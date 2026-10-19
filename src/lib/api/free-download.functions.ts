import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type GateStep = { platform: string; label: string; url: string };

type FreeRow = {
  id: string;
  user_id: string;
  free_download: boolean;
  free_download_limit: number | null;
  free_download_count: number;
  download_gate: GateStep[] | null;
};

const PLATFORMS = ["spotify", "youtube", "instagram", "tiktok", "facebook", "soundcloud", "custom"];

export const getFreeDownloadInfo = createServerFn({ method: "POST" })
  .inputValidator((d: { trackId: string }) => {
    if (!d?.trackId) throw new Error("Missing trackId");
    return { trackId: d.trackId };
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin
      .from("tracks")
      .select("id, user_id, free_download, free_download_limit, free_download_count, download_gate")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!t) return null;
    const r = t as unknown as FreeRow;
    const remaining = r.free_download_limit == null ? null : Math.max(0, r.free_download_limit - r.free_download_count);
    return {
      enabled: r.free_download,
      limit: r.free_download_limit,
      claimed: r.free_download_count,
      remaining,
      gate: Array.isArray(r.download_gate) ? r.download_gate : [],
    };
  });

export const setFreeDownloadSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trackId: string; enabled: boolean; limit: number | null; gate: GateStep[] }) => {
    if (!d?.trackId) throw new Error("Missing trackId");
    let limit: number | null = null;
    if (d.limit != null) {
      const n = Math.floor(Number(d.limit));
      if (!Number.isFinite(n) || n < 1 || n > 1000000) throw new Error("Limit must be a whole number of at least 1");
      limit = n;
    }
    const gate = (Array.isArray(d.gate) ? d.gate : []).slice(0, 8).map((s) => {
      const url = String(s.url ?? "").trim();
      if (!/^https?:\/\//i.test(url) || url.length > 500) throw new Error("Each step needs a valid https link");
      const platform = PLATFORMS.includes(s.platform) ? s.platform : "custom";
      const label = String(s.label ?? "").trim().slice(0, 80) || "Visit link";
      return { platform, label, url };
    });
    return { trackId: d.trackId, enabled: !!d.enabled, limit, gate };
  })
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: t } = await supabaseAdmin.from("tracks").select("user_id").eq("id", data.trackId).maybeSingle();
    if (!t) throw new Error("Track not found");
    if (t.user_id !== context.userId) throw new Error("Not your track");
    const { error } = await supabaseAdmin
      .from("tracks")
      .update({ free_download: data.enabled, free_download_limit: data.limit, download_gate: data.gate } as never)
      .eq("id", data.trackId);
    if (error) throw new Error("Could not save settings");
    return { ok: true };
  });

export const claimFreeDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { trackId: string }) => ({ trackId: String(d?.trackId ?? "") }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("track_purchases")
      .select("id")
      .eq("user_id", context.userId)
      .eq("track_id", data.trackId)
      .limit(1)
      .maybeSingle();
    if (existing) return { ok: true };

    const { data: t } = await supabaseAdmin
      .from("tracks")
      .select("id, user_id, free_download, free_download_limit, free_download_count, download_gate")
      .eq("id", data.trackId)
      .maybeSingle();
    if (!t) throw new Error("Track not found");
    const r = t as unknown as FreeRow;
    if (!r.free_download) throw new Error("This track is not a free download");

    // One free copy per user: record the claim first (unique per user+track),
    // then take a slot. If no slot is left, undo the claim.
    const txRef = `free:${context.userId}:${data.trackId}`;
    const { error: insErr } = await supabaseAdmin.from("track_purchases").insert({
      user_id: context.userId,
      track_id: data.trackId,
      method: "free",
      tx_ref: txRef,
      price_cents: 0,
      amount: 0,
    } as never);
    if (insErr) {
      if (insErr.code === "23505") return { ok: true }; // already claimed
      throw new Error("Could not record free download");
    }
    for (let i = 0; i < 5; i++) {
      const { data: cur } = await supabaseAdmin
        .from("tracks")
        .select("free_download_limit, free_download_count")
        .eq("id", data.trackId)
        .single();
      const c = cur as unknown as { free_download_limit: number | null; free_download_count: number };
      if (c.free_download_limit != null && c.free_download_count >= c.free_download_limit) break;
      const { data: upd } = await supabaseAdmin
        .from("tracks")
        .update({ free_download_count: c.free_download_count + 1 } as never)
        .eq("id", data.trackId)
        .eq("free_download_count" as never, c.free_download_count as never)
        .select("id");
      if (upd && upd.length > 0) return { ok: true };
    }
    await supabaseAdmin.from("track_purchases").delete().eq("method", "free").eq("tx_ref", txRef);
    throw new Error("All free downloads have been claimed");
  });
