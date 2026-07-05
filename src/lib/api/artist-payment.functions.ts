import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RECEIVER = "GeiXPwBprWDwSzYq7qiqsV6eRRqTuLf1PaowHZjcdQZr";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const PRICE_USD = 10;
const NETWORK = "mainnet-beta";
const RPC_URL = "https://api.mainnet-beta.solana.com";
const SUB_DAYS = 30;
const SOL_TOLERANCE = 0.03;

type SolanaRpcRes<T> = { jsonrpc: "2.0"; result?: T; error?: { message: string } };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await res.json()) as SolanaRpcRes<T>;
  if (body.error) throw new Error(`RPC ${method}: ${body.error.message}`);
  if (body.result === undefined) throw new Error(`RPC ${method}: empty result`);
  return body.result;
}

async function fetchSolUsd(): Promise<number> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
    { headers: { accept: "application/json" } },
  );
  if (!res.ok) throw new Error("Could not fetch SOL price");
  const j = (await res.json()) as { solana?: { usd?: number } };
  const p = j?.solana?.usd;
  if (!p || p <= 0) throw new Error("Invalid SOL price");
  return p;
}

type ParsedTx = {
  transaction: {
    message: {
      accountKeys: Array<{ pubkey: string; signer?: boolean; writable?: boolean }>;
    };
  };
  meta: {
    err: unknown | null;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: Array<{
      owner?: string;
      mint: string;
      uiTokenAmount: { amount: string };
    }>;
    postTokenBalances?: Array<{
      owner?: string;
      mint: string;
      uiTokenAmount: { amount: string };
    }>;
  } | null;
};

export const getPaymentConfig = createServerFn({ method: "GET" }).handler(async () => {
  const solUsd = await fetchSolUsd().catch(() => null);
  return {
    receiver: RECEIVER,
    usdcMint: USDC_MINT,
    usdcDecimals: USDC_DECIMALS,
    priceUsd: PRICE_USD,
    network: NETWORK,
    rpcUrl: RPC_URL,
    solUsd,
  };
});

export const verifyArtistPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { signature: string; token: "SOL" | "USDC" }) => {
    if (!data?.signature || typeof data.signature !== "string" || data.signature.length < 20)
      throw new Error("Invalid signature");
    if (data.token !== "SOL" && data.token !== "USDC") throw new Error("Bad token");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("artist_subscriptions")
      .select("id")
      .eq("tx_signature", data.signature)
      .maybeSingle();
    if (existing) throw new Error("This transaction has already been used.");

    let tx: ParsedTx | null = null;
    for (let i = 0; i < 6; i++) {
      tx = await rpc<ParsedTx | null>("getTransaction", [
        data.signature,
        {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
          encoding: "jsonParsed",
        },
      ]);
      if (tx) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (!tx) throw new Error("Transaction not found yet. Try again in a moment.");
    if (tx.meta?.err) throw new Error("Transaction failed on-chain.");

    const accountKeys = tx.transaction.message.accountKeys.map((k) => k.pubkey);
    const feePayer = accountKeys[0] ?? "unknown";
    let verifiedAmount = 0;

    if (data.token === "SOL") {
      const idx = accountKeys.indexOf(RECEIVER);
      if (idx === -1) throw new Error("Receiver not in transaction accounts");
      const pre = tx.meta?.preBalances?.[idx] ?? 0;
      const post = tx.meta?.postBalances?.[idx] ?? 0;
      const lamports = post - pre;
      if (lamports <= 0) throw new Error("No SOL received by artist wallet");
      const sol = lamports / 1_000_000_000;
      const price = await fetchSolUsd();
      const usdValue = sol * price;
      if (usdValue < PRICE_USD * (1 - SOL_TOLERANCE))
        throw new Error(
          `Payment under required amount (received ~$${usdValue.toFixed(2)}, need $${PRICE_USD}).`,
        );
      verifiedAmount = sol;
    } else {
      const pre = tx.meta?.preTokenBalances ?? [];
      const post = tx.meta?.postTokenBalances ?? [];
      const findBal = (arr: typeof post) =>
        arr.find((b) => b.owner === RECEIVER && b.mint === USDC_MINT);
      const preBal = findBal(pre);
      const postBal = findBal(post);
      const preAmt = preBal ? Number(preBal.uiTokenAmount.amount) : 0;
      const postAmt = postBal ? Number(postBal.uiTokenAmount.amount) : 0;
      const delta = postAmt - preAmt;
      const need = PRICE_USD * 10 ** USDC_DECIMALS;
      if (delta < need)
        throw new Error(
          `USDC received (${delta / 10 ** USDC_DECIMALS}) less than required ${PRICE_USD}.`,
        );
      verifiedAmount = delta / 10 ** USDC_DECIMALS;
    }

    const expiresAt = new Date(Date.now() + SUB_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { error: insErr } = await supabase.from("artist_subscriptions").insert({
      user_id: userId,
      tx_signature: data.signature,
      token: data.token,
      amount: verifiedAmount,
      from_wallet: feePayer,
      network: NETWORK,
      expires_at: expiresAt,
    });
    if (insErr) throw new Error(insErr.message);

    const { error: upErr } = await supabase
      .from("profiles")
      .update({ account_type: "artist" })
      .eq("id", userId);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, expiresAt, amount: verifiedAmount, token: data.token };
  });
