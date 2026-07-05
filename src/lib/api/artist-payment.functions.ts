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
const FALLBACK_SOL_USD = 150;

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 3500): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

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
  const coinGecko = await fetchJsonWithTimeout<{ solana?: { usd?: number } }>(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
  ).catch(() => null);
  const coinGeckoPrice = coinGecko?.solana?.usd;
  if (coinGeckoPrice && coinGeckoPrice > 0) return coinGeckoPrice;

  const jupiter = await fetchJsonWithTimeout<{
    data?: { SOL?: { price?: number }; So11111111111111111111111111111111111111112?: { price?: number } };
  }>("https://lite-api.jup.ag/price/v3?ids=SOL").catch(() => null);
  const jupiterPrice =
    jupiter?.data?.SOL?.price ??
    jupiter?.data?.So11111111111111111111111111111111111111112?.price;
  if (jupiterPrice && jupiterPrice > 0) return jupiterPrice;

  return FALLBACK_SOL_USD;
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

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({ account_type: "artist" })
      .eq("id", userId);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, expiresAt, amount: verifiedAmount, token: data.token };
  });

const PAYPAL_API =
  (process.env.PAYPAL_MODE ?? "sandbox") === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function paypalAccessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error("PayPal not configured");
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      authorization: `Basic ${btoa(`${id}:${secret}`)}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("PayPal auth failed");
  const j = (await res.json()) as { access_token?: string };
  if (!j.access_token) throw new Error("PayPal auth: no token");
  return j.access_token;
}

export const getPaypalConfig = createServerFn({ method: "GET" }).handler(async () => ({
  clientId: process.env.PAYPAL_CLIENT_ID ?? "",
  mode: (process.env.PAYPAL_MODE ?? "sandbox") as "sandbox" | "live",
  priceUsd: PRICE_USD,
}));

export const createPaypalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const token = await paypalAccessToken();
    const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: PRICE_USD.toFixed(2) },
            description: "soundwave Artist plan - 30 days",
          },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Create order failed: ${t}`);
    }
    const j = (await res.json()) as { id?: string };
    if (!j.id) throw new Error("No order id");
    return { orderId: j.id };
  });

export const capturePaypalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { orderId: string }) => {
    if (!data?.orderId || typeof data.orderId !== "string" || data.orderId.length < 5)
      throw new Error("Invalid orderId");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("artist_subscriptions")
      .select("id")
      .eq("tx_signature", data.orderId)
      .maybeSingle();
    if (existing) throw new Error("This order has already been used.");

    const token = await paypalAccessToken();

    // Capture the order
    const capRes = await fetch(
      `${PAYPAL_API}/v2/checkout/orders/${data.orderId}/capture`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
      },
    );
    const order = (await capRes.json()) as {
      status?: string;
      purchase_units?: Array<{
        amount?: { value?: string; currency_code?: string };
        payments?: {
          captures?: Array<{
            status?: string;
            amount?: { value?: string; currency_code?: string };
          }>;
        };
      }>;
      payer?: { email_address?: string; payer_id?: string };
      message?: string;
    };
    if (!capRes.ok) throw new Error(order.message ?? "Capture failed");
    if (order.status !== "COMPLETED")
      throw new Error(`Order not completed (status ${order.status})`);

    const unit = order.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    const amt = Number(capture?.amount?.value ?? unit?.amount?.value ?? "0");
    const currency = capture?.amount?.currency_code ?? unit?.amount?.currency_code;
    if (currency !== "USD") throw new Error("Currency must be USD");
    if (!(amt >= PRICE_USD)) throw new Error(`Amount ${amt} less than required ${PRICE_USD}`);

    const expiresAt = new Date(Date.now() + SUB_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const payerRef = order.payer?.payer_id ?? order.payer?.email_address ?? "paypal";

    const { error: insErr } = await supabase.from("artist_subscriptions").insert({
      user_id: userId,
      tx_signature: data.orderId,
      token: "PAYPAL",
      amount: amt,
      from_wallet: payerRef,
      network: process.env.PAYPAL_MODE ?? "sandbox",
      expires_at: expiresAt,
    });
    if (insErr) throw new Error(insErr.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: upErr } = await supabaseAdmin
      .from("profiles")
      .update({ account_type: "artist" })
      .eq("id", userId);
    if (upErr) throw new Error(upErr.message);

    return { ok: true, expiresAt, amount: amt };
  });

