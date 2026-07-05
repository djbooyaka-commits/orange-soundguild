import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";

const RECEIVER = "GeiXPwBprWDwSzYq7qiqsV6eRRqTuLf1PaowHZjcdQZr";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const PRICE_USD = 10;
const NETWORK = "mainnet-beta";
const RPC_URL = "https://api.mainnet-beta.solana.com";
const SUB_DAYS = 30;
const SOL_TOLERANCE = 0.03;

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

export const buildArtistPaymentTx = createServerFn({ method: "POST" })
  .inputValidator((data: { token: "SOL" | "USDC"; from: string }) => {
    if (data.token !== "SOL" && data.token !== "USDC") throw new Error("Bad token");
    if (!data.from || typeof data.from !== "string") throw new Error("Missing wallet");
    return data;
  })
  .handler(async ({ data }) => {
    const conn = new Connection(RPC_URL, "confirmed");
    const payer = new PublicKey(data.from);
    const receiver = new PublicKey(RECEIVER);
    const tx = new Transaction();
    let amount = 0;
    let solUsdPrice: number | undefined;

    if (data.token === "SOL") {
      solUsdPrice = await fetchSolUsd();
      amount = +(PRICE_USD / solUsdPrice).toFixed(6);
      tx.add(
        SystemProgram.transfer({
          fromPubkey: payer,
          toPubkey: receiver,
          lamports: Math.round(amount * LAMPORTS_PER_SOL),
        }),
      );
    } else {
      amount = PRICE_USD;
      const mint = new PublicKey(USDC_MINT);
      const fromAta = getAssociatedTokenAddressSync(mint, payer);
      const toAta = getAssociatedTokenAddressSync(mint, receiver);
      try {
        await getAccount(conn, toAta);
      } catch {
        tx.add(createAssociatedTokenAccountInstruction(payer, toAta, receiver, mint));
      }
      tx.add(
        createTransferCheckedInstruction(
          fromAta,
          mint,
          toAta,
          payer,
          BigInt(Math.round(amount * 10 ** USDC_DECIMALS)),
          USDC_DECIMALS,
          [],
          TOKEN_PROGRAM_ID,
        ),
      );
    }

    const { blockhash } = await conn.getLatestBlockhash();
    tx.recentBlockhash = blockhash;
    tx.feePayer = payer;

    const messageBytes = tx.serializeMessage();
    const messageBase58 = bs58.encode(messageBytes);

    return {
      token: data.token,
      amount,
      solUsdPrice,
      network: NETWORK,
      receiver: RECEIVER,
      messageBase58,
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

    const conn = new Connection(RPC_URL, "confirmed");
    let tx = null;
    for (let i = 0; i < 6; i++) {
      tx = await conn.getParsedTransaction(data.signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (tx) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (!tx) throw new Error("Transaction not found yet. Try again in a moment.");
    if (tx.meta?.err) throw new Error("Transaction failed on-chain.");

    const accountKeys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
    const feePayer = accountKeys[0];
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
      from_wallet: feePayer ?? "unknown",
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
