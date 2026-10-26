import { createHash, randomBytes } from "crypto";
import { createFileRoute } from "@tanstack/react-router";

// Called by the Android phone app: exchanges a pairing code shown on /remote
// for a device id + secret token. Only unpaired, unexpired codes work.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/remote/pair")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
        const code = typeof body?.code === "string" ? body.code.trim().toUpperCase() : "";
        if (!/^[0-9A-F]{6,8}$/.test(code)) return json({ error: "Invalid pairing code" }, 400);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: rows } = await supabaseAdmin
          .from("remote_devices")
          .select("id, name")
          .eq("pairing_code", code)
          .eq("paired", false)
          .gt("pairing_expires_at", new Date().toISOString())
          .limit(1);
        const device = rows?.[0];
        if (!device) return json({ error: "Invalid or expired pairing code" }, 404);

        const token = randomBytes(32).toString("hex");
        const { error } = await supabaseAdmin
          .from("remote_devices")
          .update({
            paired: true,
            device_token_hash: createHash("sha256").update(token).digest("hex"),
            last_seen: new Date().toISOString(),
          })
          .eq("id", device.id)
          .eq("paired", false);
        if (error) return json({ error: "Pairing failed" }, 500);
        return json({ deviceId: device.id, token, name: device.name });
      },
    },
  },
});
