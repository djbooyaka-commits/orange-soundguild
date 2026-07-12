import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RECEIVER = "GeiXPwBprWDwSzYq7qiqsV6eRRqTuLf1PaowHZjcdQZr";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const NETWORK = "mainnet-beta";
const RPC_URLS = [
  "https://solana-rpc.publicnode.com",
  "https://api.mainnet.rpcpool.com",
  "https://solana.drpc.org",
  "https://api.mainnet-beta.solana.com",
];
const SOL_TOLERANCE = 0.03;
const FALLBACK_SOL_USD = 150;
const DOWNLOAD_TTL = 60 * 60;

// --- Solana helpers (mirror of artist-payment.functions.ts) ---

async function fetchJsonWithTimeout<T>(url: string, timeoutMs = 3500): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { accept: "application/json" }, signal: controller.signal });
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

type SolanaRpcRes<T> = { jsonrpc: "2.0"; result?: T; error?: { message: string } };

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastErr: unknown = null;
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      });
      if (!res.ok) { lastErr = new Error(`RPC ${method} ${url}: HTTP ${res.status}`); continue; }
      const body = (await res.json()) as SolanaRpcRes<T>;
      if (body.error) { lastErr = new Error(`RPC ${method}: ${body.error.message}`); continue; }
      if (body.result === undefined) { lastErr = new Error(`RPC ${method}: empty result`); continue; }
      return body.result;
    } catch (e) { lastErr = e; }
  }
  throw lastErr instanceof Error ? lastErr : new Error(`RPC ${method} failed`);
}

async function fetchSolUsd(): Promise<number> {
  const cg = await fetchJsonWithTimeout<{ solana?: { usd?: number } }>(
    "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
  ).catch(() => null);
  if (cg?.solana?.usd && cg.solana.usd > 0) return cg.solana.usd;
  const jp = await fetchJsonWithTimeout<{
    data?: { SOL?: { price?: number }; So11111111111111111111111111111111111111112?: { price?: number } };
  }>("https://lite-api.jup.ag/price/v3?ids=SOL").catch(() => null);
  const jpPrice = jp?.data?.SOL?.price ?? jp?.data?.So11111111111111111111111111111111111111112?.price;
  if (jpPrice && jpPrice > 0) return jpPrice;
  return FALLBACK_SOL_USD;
}

type ParsedTx = {
  transaction: { message: { accountKeys: Array<{ pubkey: string }> } };
  meta: {
    err: unknown | null;
    preBalances: number[];
    postBalances: number[];
    preTokenBalances?: Array<{ owner?: string; mint: string; uiTokenAmount: { amount: string } }>;
    postTokenBalances?: Array<{ owner?: string; mint: string; uiTokenAmount: { amount: string } }>;
  } | null;
};

// --- Track lookup helper ---

async function loadSaleInfo(trackId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("tracks")
    .select("id, user_id, title, price_cents, audio_url, download_lossless_url")
    .eq("id", trackId)
    .maybeSingle();
  if (error || !data) throw new Error("Track not found");
  return data as {
    id: string;
    user_id: string;
    title: string;
    price_cents: number | null;
    audio_url: string;
    download_lossless_url: string | null;
  };
}

async function creditArtist(trackId: string, amountCents: number) {
  if (amountCents <= 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.rpc("credit_track_sale" as never, {
    _track_id: trackId,
    _amount_cents: amountCents,
  } as never);
}

// --- Public read ---

export const getTrackForPurchase = createServerFn({ method: "POST" })
  .inputValidator((d: { trackId: string }) => {
    if (!d?.trackId) throw new Error("Missing trackId");
    return { trackId: d.trackId };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tracks")
      .select("id, title, price_cents, download_lossless_url, user_id")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!t) throw new Error("Track not found");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", t.user_id)
      .maybeSingle();
    return {
      trackId: t.id,
      title: t.title,
      priceCents: (t as { price_cents: number | null }).price_cents,
      hasLossless: !!(t as { download_lossless_url: string | null }).download_lossless_url,
      artist: prof?.username ?? null,
    };
  });

export const ownsTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trackId: string }) => ({ trackId: d.trackId }))
  .handler(async ({ data, context }) => {
    const { data: rows } = await context.supabase
      .from("track_purchases" as never)
      .select("id")
      .eq("user_id", context.userId)
      .eq("track_id", data.trackId)
      .limit(1);
    return { owns: Array.isArray(rows) && rows.length > 0 };
  });

// Owner-only read of private track fields (lossless path, price).
// Needed because SELECT on download_lossless_url is revoked from anon/authenticated.
export const getMyTrackPrivateFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trackId: string }) => ({ trackId: d.trackId }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tracks")
      .select("user_id, price_cents, download_lossless_url")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!t) throw new Error("Track not found");
    if (t.user_id !== context.userId) throw new Error("Not your track");
    return {
      priceCents: (t as { price_cents: number | null }).price_cents,
      losslessPath: (t as { download_lossless_url: string | null }).download_lossless_url,
    };
  });

// --- Download URL ---

export const getTrackDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trackId: string }) => ({ trackId: d.trackId }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Verify ownership OR that the caller is the track's artist
    const { data: t } = await supabaseAdmin
      .from("tracks")
      .select("id, user_id, title, audio_url, download_lossless_url")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!t) throw new Error("Track not found");

    const isOwner = t.user_id === context.userId;
    if (!isOwner) {
      const { data: purchase } = await supabaseAdmin
        .from("track_purchases")
        .select("id")
        .eq("user_id", context.userId)
        .eq("track_id", data.trackId)
        .limit(1)
        .maybeSingle();
      if (!purchase) throw new Error("You don't own this track");
    }

    const lossless = (t as { download_lossless_url: string | null }).download_lossless_url;
    const path = lossless || t.audio_url;
    const filename = (t.title || "track").replace(/[^\w\-. ]+/g, "_").slice(0, 80);
    const ext = path.split(".").pop() || "mp3";
    const { data: signed } = await supabaseAdmin.storage
      .from("audio")
      .createSignedUrl(path, DOWNLOAD_TTL, {
        download: `${filename}.${ext}`,
      });
    if (!signed?.signedUrl) throw new Error("Could not sign download");
    return {
      url: signed.signedUrl,
      lossless: !!lossless,
      filename: `${filename}.${ext}`,
    };
  });

// --- Code claim / management ---

export const claimTrackCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { code: string }) => {
    if (!d?.code || typeof d.code !== "string") throw new Error("Invalid code");
    return { code: d.code };
  })
  .handler(async ({ data, context }) => {
    const { data: tid, error } = await context.supabase.rpc("claim_track_code" as never, {
      _code: data.code,
    } as never);
    if (error) throw new Error(error.message);
    return { trackId: tid as unknown as string };
  });

export const listMyTrackCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trackId: string }) => ({ trackId: d.trackId }))
  .handler(async ({ data, context }) => {
    // Verify the caller owns the track (RLS also gates this, but explicit is nicer)
    const { data: t } = await context.supabase
      .from("tracks")
      .select("user_id")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!t || t.user_id !== context.userId) throw new Error("Not your track");
    const { data: codes } = await context.supabase
      .from("track_claim_codes" as never)
      .select("id, code, claimed_by, claimed_at, created_at")
      .eq("track_id", data.trackId)
      .order("created_at", { ascending: false });
    return {
      codes: (codes ?? []) as Array<{
        id: string;
        code: string;
        claimed_by: string | null;
        claimed_at: string | null;
        created_at: string;
      }>,
    };
  });

export const generateTrackCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trackId: string; count: number }) => {
    const count = Math.max(1, Math.min(100, Math.floor(d.count)));
    return { trackId: d.trackId, count };
  })
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase.rpc("generate_track_codes" as never, {
      _track_id: data.trackId,
      _count: data.count,
    } as never);
    if (error) throw new Error(error.message);
    const codes = Array.isArray(rows)
      ? (rows as Array<string | { generate_track_codes: string }>).map((r) =>
          typeof r === "string" ? r : r.generate_track_codes,
        )
      : [];
    return { codes };
  });

// --- Solana payment ---

export const verifyTrackSolanaPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { signature: string; token: "SOL" | "USDC"; trackId: string }) => {
    if (!d?.signature || d.signature.length < 20) throw new Error("Invalid signature");
    if (d.token !== "SOL" && d.token !== "USDC") throw new Error("Bad token");
    if (!d?.trackId) throw new Error("Missing trackId");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sale = await loadSaleInfo(data.trackId);
    if (!sale.price_cents || sale.price_cents < 100) throw new Error("Track is not for sale");
    const priceUsd = sale.price_cents / 100;

    const { data: existing } = await context.supabase
      .from("track_purchases" as never)
      .select("id")
      .eq("tx_ref", data.signature)
      .in("method", ["phantom_sol", "phantom_usdc"])
      .maybeSingle();
    if (existing) throw new Error("This transaction has already been used.");

    let tx: ParsedTx | null = null;
    for (let i = 0; i < 6; i++) {
      tx = await rpc<ParsedTx | null>("getTransaction", [
        data.signature,
        { commitment: "confirmed", maxSupportedTransactionVersion: 0, encoding: "jsonParsed" },
      ]);
      if (tx) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (!tx) throw new Error("Transaction not found yet. Try again in a moment.");
    if (tx.meta?.err) throw new Error("Transaction failed on-chain.");

    const accountKeys = tx.transaction.message.accountKeys.map((k) => k.pubkey);
    let verifiedAmount = 0;

    if (data.token === "SOL") {
      const idx = accountKeys.indexOf(RECEIVER);
      if (idx === -1) throw new Error("Receiver not in transaction");
      const pre = tx.meta?.preBalances?.[idx] ?? 0;
      const post = tx.meta?.postBalances?.[idx] ?? 0;
      const lamports = post - pre;
      if (lamports <= 0) throw new Error("No SOL received");
      const sol = lamports / 1_000_000_000;
      const rate = await fetchSolUsd();
      const usdValue = sol * rate;
      if (usdValue < priceUsd * (1 - SOL_TOLERANCE))
        throw new Error(`Payment under required amount (received ~$${usdValue.toFixed(2)}, need $${priceUsd}).`);
      verifiedAmount = sol;
    } else {
      const pre = tx.meta?.preTokenBalances ?? [];
      const post = tx.meta?.postTokenBalances ?? [];
      const findBal = (arr: typeof post) => arr.find((b) => b.owner === RECEIVER && b.mint === USDC_MINT);
      const preAmt = findBal(pre) ? Number(findBal(pre)!.uiTokenAmount.amount) : 0;
      const postAmt = findBal(post) ? Number(findBal(post)!.uiTokenAmount.amount) : 0;
      const delta = postAmt - preAmt;
      const need = priceUsd * 10 ** USDC_DECIMALS;
      if (delta < need)
        throw new Error(`USDC received (${delta / 10 ** USDC_DECIMALS}) less than required ${priceUsd}.`);
      verifiedAmount = delta / 10 ** USDC_DECIMALS;
    }

    const method = data.token === "SOL" ? "phantom_sol" : "phantom_usdc";
    const { error: insErr } = await context.supabase.from("track_purchases" as never).insert({
      user_id: context.userId,
      track_id: data.trackId,
      method,
      tx_ref: data.signature,
      price_cents: sale.price_cents,
      amount: verifiedAmount,
    } as never);
    if (insErr) throw new Error(insErr.message);

    await creditArtist(data.trackId, sale.price_cents);
    void NETWORK;
    return { ok: true, amount: verifiedAmount, token: data.token };
  });

// --- PayPal ---

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

export const createTrackPaypalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trackId: string }) => ({ trackId: d.trackId }))
  .handler(async ({ data }) => {
    const sale = await loadSaleInfo(data.trackId);
    if (!sale.price_cents || sale.price_cents < 100) throw new Error("Track is not for sale");
    const priceUsd = (sale.price_cents / 100).toFixed(2);
    const token = await paypalAccessToken();
    const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: priceUsd },
            description: `Orange Sound Guild — ${sale.title}`,
            custom_id: data.trackId,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Create order failed: ${await res.text()}`);
    const j = (await res.json()) as { id?: string };
    if (!j.id) throw new Error("No order id");
    return { orderId: j.id };
  });

export const captureTrackPaypalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; trackId: string }) => {
    if (!d?.orderId || d.orderId.length < 5) throw new Error("Invalid orderId");
    if (!d?.trackId) throw new Error("Missing trackId");
    return d;
  })
  .handler(async ({ data, context }) => {
    const sale = await loadSaleInfo(data.trackId);
    if (!sale.price_cents || sale.price_cents < 100) throw new Error("Track is not for sale");
    const priceUsd = sale.price_cents / 100;

    const { data: existing } = await context.supabase
      .from("track_purchases" as never)
      .select("id")
      .eq("method", "paypal")
      .eq("tx_ref", data.orderId)
      .maybeSingle();
    if (existing) throw new Error("This order has already been used.");

    const token = await paypalAccessToken();
    const capRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${data.orderId}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    });
    const order = (await capRes.json()) as {
      status?: string;
      purchase_units?: Array<{
        amount?: { value?: string; currency_code?: string };
        payments?: { captures?: Array<{ amount?: { value?: string; currency_code?: string } }> };
      }>;
      message?: string;
    };
    if (!capRes.ok) throw new Error(order.message ?? "Capture failed");
    if (order.status !== "COMPLETED") throw new Error(`Order not completed (${order.status})`);
    const unit = order.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    const amt = Number(capture?.amount?.value ?? unit?.amount?.value ?? "0");
    const currency = capture?.amount?.currency_code ?? unit?.amount?.currency_code;
    if (currency !== "USD") throw new Error("Currency must be USD");
    if (!(amt >= priceUsd)) throw new Error(`Amount ${amt} less than required ${priceUsd}`);

    const { error: insErr } = await context.supabase.from("track_purchases" as never).insert({
      user_id: context.userId,
      track_id: data.trackId,
      method: "paypal",
      tx_ref: data.orderId,
      price_cents: sale.price_cents,
      amount: amt,
    } as never);
    if (insErr) throw new Error(insErr.message);

    await creditArtist(data.trackId, sale.price_cents);
    return { ok: true, amount: amt };
  });

// --- Library: my owned tracks ---

export const listMyOwnedTracks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: purchases } = await context.supabase
      .from("track_purchases" as never)
      .select("track_id, method, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    const list = (purchases ?? []) as Array<{ track_id: string; method: string; created_at: string }>;
    if (list.length === 0) return { items: [] };
    const ids = Array.from(new Set(list.map((p) => p.track_id)));
    const { data: tracks } = await supabaseAdmin
      .from("tracks")
      .select("id, title, user_id, cover_art_url, genre, download_lossless_url")
      .in("id", ids);
    const rows = (tracks ?? []) as Array<{
      id: string; title: string; user_id: string; cover_art_url: string | null;
      genre: string; download_lossless_url: string | null;
    }>;
    const artistIds = Array.from(new Set(rows.map((r) => r.user_id)));
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id, username").in("id", artistIds);
    const nameFor = new Map((profs ?? []).map((p) => [p.id as string, p.username as string]));
    return {
      items: list.map((p) => {
        const t = rows.find((r) => r.id === p.track_id);
        return {
          trackId: p.track_id,
          title: t?.title ?? "Track",
          artist: t ? nameFor.get(t.user_id) ?? null : null,
          coverPath: t?.cover_art_url ?? null,
          genre: t?.genre ?? "",
          hasLossless: !!t?.download_lossless_url,
          method: p.method,
          purchasedAt: p.created_at,
        };
      }),
    };
  });
