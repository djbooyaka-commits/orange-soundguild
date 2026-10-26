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

type Result = { id?: unknown; status?: unknown; result?: unknown };

export const Route = createFileRoute("/api/public/remote/poll")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          deviceId?: unknown; token?: unknown; width?: unknown; height?: unknown; frame?: unknown; results?: unknown; answer?: unknown;
        } | null;
        const deviceId = typeof body?.deviceId === "string" ? body.deviceId : "";
        const token = typeof body?.token === "string" ? body.token : "";
        if (!/^[0-9a-f-]{36}$/i.test(deviceId) || !token) return json({ error: "Unauthorized" }, 401);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: device } = await supabaseAdmin
          .from("remote_devices")
          .select("id, device_token_hash, watch_until, paired")
          .eq("id", deviceId)
          .maybeSingle();
        const provided = createHash("sha256").update(token).digest();
        const expected = device?.device_token_hash ? Buffer.from(device.device_token_hash, "hex") : null;
        if (!device?.paired || !expected || expected.length !== provided.length || !timingSafeEqual(provided, expected)) {
          return json({ error: "Unauthorized" }, 401);
        }

        const now = new Date();
        const update: { last_seen: string; screen_width?: number; screen_height?: number; last_frame?: string; webrtc_answer?: string } = { last_seen: now.toISOString() };
        const w = Number(body?.width), h = Number(body?.height);
        if (Number.isInteger(w) && Number.isInteger(h) && w > 100 && h > 100 && w < 10000 && h < 10000) {
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
        await supabaseAdmin.from("remote_devices").update(update).eq("id", deviceId);

        if (Array.isArray(body?.results)) {
          for (const r of (body.results as Result[]).slice(0, 20)) {
            if (typeof r?.id !== "string") continue;
            const status = r.status === "done" ? "done" : "failed";
            await supabaseAdmin
              .from("remote_commands")
              .update({ status, result: typeof r.result === "string" ? r.result.slice(0, 500) : null })
              .eq("id", r.id)
              .eq("device_id", deviceId);
          }
        }

        // Drop commands that waited too long so an offline phone doesn't replay old taps.
        await supabaseAdmin
          .from("remote_commands")
          .update({ status: "expired" })
          .eq("device_id", deviceId)
          .eq("status", "pending")
          .lt("created_at", new Date(now.getTime() - STALE_MS).toISOString());

        const { data: pending } = await supabaseAdmin
          .from("remote_commands")
          .select("id, kind, payload")
          .eq("device_id", deviceId)
          .eq("status", "pending")
          .order("created_at")
          .limit(10);
        const commands = pending ?? [];
        if (commands.length) {
          await supabaseAdmin.from("remote_commands").update({ status: "sent" }).in("id", commands.map((c) => c.id));
        }

        const watch = !!device.watch_until && new Date(device.watch_until).getTime() > now.getTime();
        return json({ commands, watch });
      },
    },
  },
});
