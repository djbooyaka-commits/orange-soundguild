import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdPackage = "bronze" | "silver" | "gold";
export type AdPlacement = "feed" | "player";
export type AdMode = "track" | "custom";

export const AD_PACKAGES: Record<
  AdPackage,
  { label: string; priceUsd: number; days: number; maxPlacements: number; blurb: string }
> = {
  bronze: {
    label: "Bronze",
    priceUsd: 5,
    days: 7,
    maxPlacements: 1,
    blurb: "1 placement · 7 days",
  },
  silver: {
    label: "Silver",
    priceUsd: 12.5,
    days: 21,
    maxPlacements: 2,
    blurb: "Up to 2 placements · 21 days",
  },
  gold: {
    label: "Gold",
    priceUsd: 30,
    days: 30,
    maxPlacements: 2,
    blurb: "Up to 2 placements · 30 days",
  },
};

const PAYPAL_API =
  (process.env.PAYPAL_MODE ?? "sandbox") === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

async function paypalToken(): Promise<string> {
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

function validatePackage(p: unknown): AdPackage {
  if (p !== "bronze" && p !== "silver" && p !== "gold") throw new Error("Invalid package");
  return p;
}

function validatePlacements(arr: unknown, max: number): AdPlacement[] {
  if (!Array.isArray(arr) || arr.length < 1) throw new Error("Pick at least one placement");
  const out: AdPlacement[] = [];
  for (const v of arr) {
    if (v !== "feed" && v !== "player") throw new Error("Invalid placement");
    if (!out.includes(v)) out.push(v);
  }
  if (out.length > max) throw new Error(`This package allows up to ${max} placement(s)`);
  return out;
}

function validateHttpsUrl(v: unknown, field: string): string {
  if (typeof v !== "string" || v.length < 8 || v.length > 500) throw new Error(`Invalid ${field}`);
  if (!/^https:\/\//i.test(v)) throw new Error(`${field} must start with https://`);
  return v;
}

type CreateInput = {
  package: AdPackage;
  placements: AdPlacement[];
  mode: AdMode;
  trackId?: string | null;
  imageUrl?: string | null;
  headline?: string | null;
  destUrl?: string | null;
};

export const getAdPackages = createServerFn({ method: "GET" }).handler(async () => ({
  packages: AD_PACKAGES,
  paypalClientId: process.env.PAYPAL_CLIENT_ID ?? "",
  paypalMode: (process.env.PAYPAL_MODE ?? "sandbox") as "sandbox" | "live",
}));

export const createAdPaypalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: CreateInput) => {
    const pkg = validatePackage(raw?.package);
    const placements = validatePlacements(raw?.placements, AD_PACKAGES[pkg].maxPlacements);
    if (raw?.mode !== "track" && raw?.mode !== "custom") throw new Error("Invalid mode");
    if (raw.mode === "track") {
      if (typeof raw.trackId !== "string" || raw.trackId.length < 10) throw new Error("Pick a track");
      return { package: pkg, placements, mode: "track" as const, trackId: raw.trackId };
    }
    return {
      package: pkg,
      placements,
      mode: "custom" as const,
      imageUrl: validateHttpsUrl(raw.imageUrl, "image URL"),
      headline: (() => {
        const h = String(raw.headline ?? "").trim();
        if (h.length < 3 || h.length > 80) throw new Error("Headline must be 3–80 characters");
        return h;
      })(),
      destUrl: validateHttpsUrl(raw.destUrl, "destination URL"),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const pkg = AD_PACKAGES[data.package];

    // Artist-only
    const { data: prof } = await supabase.from("profiles").select("account_type").eq("id", userId).maybeSingle();
    if (prof?.account_type !== "artist") throw new Error("Artist account required to buy ads");

    if (data.mode === "track") {
      const { data: t } = await supabase.from("tracks").select("id, user_id").eq("id", data.trackId).maybeSingle();
      if (!t || t.user_id !== userId) throw new Error("You can only promote your own tracks");
    }

    const token = await paypalToken();
    const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: { currency_code: "USD", value: pkg.priceUsd.toFixed(2) },
            description: `Orange Sound Guild Ads — ${pkg.label} (${pkg.days} days)`,
            custom_id: `ad:${data.package}`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Create order failed: ${await res.text()}`);
    const j = (await res.json()) as { id?: string };
    if (!j.id) throw new Error("No order id");

    // Store pending draft
    const { error: insErr } = await supabase.from("ad_campaigns" as never).insert({
      user_id: userId,
      package: data.package,
      placements: data.placements,
      mode: data.mode,
      track_id: data.mode === "track" ? data.trackId : null,
      image_url: data.mode === "custom" ? data.imageUrl : null,
      headline: data.mode === "custom" ? data.headline : null,
      dest_url: data.mode === "custom" ? data.destUrl : null,
      amount_cents: pkg.priceUsd * 100,
      paypal_order_id: j.id,
      status: "pending",
    } as never);
    if (insErr) throw new Error(insErr.message);

    return { orderId: j.id };
  });

export const captureAdPaypalOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { orderId: string }) => {
    if (!raw?.orderId || typeof raw.orderId !== "string") throw new Error("Invalid orderId");
    return { orderId: raw.orderId };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: draft } = await supabase
      .from("ad_campaigns" as never)
      .select("id, user_id, package, status")
      .eq("paypal_order_id", data.orderId)
      .maybeSingle();
    const row = draft as { id: string; user_id: string; package: AdPackage; status: string } | null;
    if (!row) throw new Error("Order not found");
    if (row.user_id !== userId) throw new Error("Order belongs to another user");
    if (row.status === "active") throw new Error("This order was already activated");

    const token = await paypalToken();
    const capRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${data.orderId}/capture`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    });
    const order = (await capRes.json()) as {
      status?: string;
      message?: string;
      purchase_units?: Array<{
        amount?: { value?: string; currency_code?: string };
        payments?: { captures?: Array<{ amount?: { value?: string; currency_code?: string } }> };
      }>;
    };
    if (!capRes.ok) throw new Error(order.message ?? "Capture failed");
    if (order.status !== "COMPLETED") throw new Error(`Order not completed (status ${order.status})`);

    const unit = order.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    const amt = Number(capture?.amount?.value ?? unit?.amount?.value ?? "0");
    const currency = capture?.amount?.currency_code ?? unit?.amount?.currency_code;
    const expected = AD_PACKAGES[row.package].priceUsd;
    if (currency !== "USD") throw new Error("Currency must be USD");
    if (!(amt >= expected)) throw new Error(`Amount ${amt} less than required ${expected}`);

    const now = new Date();
    const ends = new Date(now.getTime() + AD_PACKAGES[row.package].days * 24 * 60 * 60 * 1000);

    const { error: updErr } = await supabase
      .from("ad_campaigns" as never)
      .update({
        status: "active",
        starts_at: now.toISOString(),
        ends_at: ends.toISOString(),
      } as never)
      .eq("id", row.id);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, endsAt: ends.toISOString() };
  });

export const listMyCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("ad_campaigns" as never)
      .select("id, package, placements, mode, track_id, image_url, headline, dest_url, amount_cents, status, starts_at, ends_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    return { campaigns: (data ?? []) as Array<{
      id: string;
      package: AdPackage;
      placements: AdPlacement[];
      mode: AdMode;
      track_id: string | null;
      image_url: string | null;
      headline: string | null;
      dest_url: string | null;
      amount_cents: number;
      status: string;
      starts_at: string | null;
      ends_at: string | null;
      created_at: string;
    }> };
  });
