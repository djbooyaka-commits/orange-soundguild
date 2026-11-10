import { createHash, timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";

// Called by the paired Android phone app on a loop. It:
// - verifies the device token,
// - stores reported command results and the latest screen frame,
// - returns pending commands (marking them "sent") and whether a viewer is watching.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const MAX_FRAME = 600_000;
const STALE_MS = 2 * 60 * 1000;
// While nobody is watching, devices sleep: they check in about every IDLE_POLL_MS
// and "last seen" is only rewritten every SEEN_*_MS, so idle devices barely touch the database.
export const IDLE_POLL_MS = 15_000;
const SEEN_IDLE_MS = 30_000;
const SEEN_WATCH_MS = 10_000;

type Result = { id?: unknown; status?: unknown; result?: unknown; kind?: unknown };

export const Route = createFileRoute("/api/public/remote/poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          deviceId?: unknown; token?: unknown; width?: unknown; height?: unknown; frame?: unknown; results?: unknown; answer?: unknown; plays?: unknown;
        } | null;
        const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
        const token = typeof body?.token === "string" ? body.token : "";
        if (!/^[0-9a-f-]{36}$/i.test(deviceId) || !token) return json({ error: "Unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: device } = await supabaseAdmin
          .from("remote_devices")
          .select("id, owner_id, device_token_hash, watch_until, paired, last_seen, screen_width, screen_height")
          .eq("id", deviceId)
          .maybeSingle();
        const provided = createHash("sha256").update(token).digest();
        const expected = device?.device_token_hash ? Buffer.from(device.device_token_hash, "hex") : null;
        if (!device?.paired || !expected || expected.length !== provided.length || !timingSafeEqual(provided, expected)) {
          return json({ error: "Unauthorized" }, 401);
        }

        const now = new Date();
        const watch = !!device.watch_until && new Date(device.watch_until).getTime() > now.getTime();
        const update: { last_seen: string; screen_width?: number; screen_height?: number; last_frame?: string; webrtc_answer?: string } = { last_seen: now.toISOString() };
        const w = Number(body?.width), h = Number(body?.height);
        if (Number.isInteger(w) && Number.isInteger(h) && w > 100 && h > 100 && w < 10000 && h < 10000 && (w !== device.screen_width || h !== device.screen_height)) {
          update.screen_width = w;
          update.screen_height = h;
        }
        if (typeof body?.frame === "string" && body.frame.startsWith("data:image/jpeg;base64,") && body.frame.length <= MAX_FRAME) {
          update.last_frame = body.frame;
        }
        const ans = body?.answer as { session?: unknown; sdp?: unknown } | undefined;
        if (ans && typeof ans.session === "string" && typeof ans.sdp === "string" && ans.sdp.length < 20_000) {
          update.webrtc_answer = JSON.stringify({ session: ans.session.slice(0, 64), sdp: ans.sdp });
        }
        const seenAge = device.last_seen ? now.getTime() - new Date(device.last_seen).getTime() : Infinity;
        const hasNews = Object.keys(update).length > 1;
        if (hasNews || seenAge >= (watch ? SEEN_WATCH_MS : SEEN_IDLE_MS)) {
          await supabaseAdmin.from("remote_devices").update(update).eq("id", deviceId);
        }

        if (Array.isArray(body?.results)) {
          for (const r of (body.results as Result[]).slice(0, 20)) {
            if (typeof r?.id !== "string") continue;
            const status = r.status === "done" ? "done" : "failed";
            await supabaseAdmin
              .from("remote_commands")
              // Passwords sent for "unlock" are wiped as soon as the PC reports back.
              .update({ status, result: typeof r.result === "string" ? r.result.slice(0, 500) : null, ...(r.kind === "unlock" ? { payload: {} } : {}) })
              .eq("id", r.id)
              .eq("device_id", deviceId);
          }
        }

        // Music the phone reports as played (Spotify, Apple Music, YouTube...).
        if (Array.isArray(body?.plays)) {
          const str = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
          const rows = (body.plays as Record<string, unknown>[]).slice(0, 50).flatMap((p) => {
            const title = str(p?.title, 300);
            const started = Number(p?.startedAt);
            const secs = Math.round(Number(p?.playedSeconds));
            if (!title || !Number.isFinite(started) || started < 1.6e12 || started > now.getTime() + 60_000) return [];
            if (!Number.isFinite(secs) || secs < 1 || secs > 6 * 3600) return [];
            return [{
              device_id: deviceId, owner_id: device.owner_id, title,
              app: str(p?.app, 60) ?? "Unknown", package: str(p?.package, 200),
              artist: str(p?.artist, 300), album: str(p?.album, 300), playlist: str(p?.playlist, 200),
              played_seconds: secs, started_at: new Date(started).toISOString(),
            }];
          });
          if (rows.length) await supabaseAdmin.from("remote_plays").upsert(rows as never, { onConflict: "device_id,started_at,title", ignoreDuplicates: true });
        }

        const { data: pending } = await supabaseAdmin
          .from("remote_commands")
          .select("id, kind, payload, created_at")
          .eq("device_id", deviceId)
          .eq("status", "pending")
          .order("created_at")
          .limit(30);
        // Drop commands that waited too long so an offline phone doesn't replay old taps.
        const cutoff = now.getTime() - STALE_MS;
        const stale = (pending ?? []).filter((c) => new Date(c.created_at).getTime() < cutoff).map((c) => c.id);
        if (stale.length) await supabaseAdmin.from("remote_commands").update({ status: "expired", payload: {} }).in("id", stale);
        const commands = (pending ?? []).filter((c) => new Date(c.created_at).getTime() >= cutoff).slice(0, 10)
          .map(({ id, kind, payload }) => ({ id, kind, payload }));
        if (commands.length) {
          await supabaseAdmin.from("remote_commands").update({ status: "sent" }).in("id", commands.map((c) => c.id));
          // Never leave a password sitting in the database once it's been handed to the PC.
          const unlocks = commands.filter((c) => c.kind === "unlock").map((c) => c.id);
          if (unlocks.length) await supabaseAdmin.from("remote_commands").update({ payload: {} }).in("id", unlocks);
        }

        return json({ commands, watch, idle_ms: IDLE_POLL_MS });
      },
    },
  },
});
