import { createHash, timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";

// Strips http(s) URLs out of chat message bodies older than 30 days.
// If the message ends up with no text and no image, it is deleted.
const URL_RE = /(https?:\/\/[^\s<>"']+)/gi;

function tokensMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export const Route = createFileRoute("/api/public/hooks/cleanup-chat-links")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const providedToken = request.headers.get("x-cron-secret") ?? "";

        const { data: secretRow } = await (supabaseAdmin as any)
          .from("scheduled_job_secrets")
          .select("secret")
          .eq("name", "cleanup-chat-links")
          .maybeSingle();

        if (!secretRow?.secret || !providedToken || !tokensMatch(providedToken, secretRow.secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const tables = ["direct_messages", "room_chat_messages"] as const;

        let totalScanned = 0;
        let totalStripped = 0;
        let totalDeleted = 0;

        for (const table of tables) {
          const { data: rows, error } = await (supabaseAdmin as any)
            .from(table)
            .select("id, body, image_url")
            .lt("created_at", cutoff)
            .ilike("body", "%http%")
            .limit(2000);

          if (error) {
            return new Response(JSON.stringify({ error: error.message, table }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const deleteIds: string[] = [];

          for (const r of rows ?? []) {
            const original = r.body ?? "";
            if (!original.match(URL_RE)) continue;
            const cleaned = original.replace(URL_RE, "[link removed]").replace(/\s+/g, " ").trim();

            if (!cleaned && !r.image_url) {
              deleteIds.push(r.id);
              continue;
            }

            const { error: upErr } = await (supabaseAdmin as any)
              .from(table)
              .update({ body: cleaned })
              .eq("id", r.id);
            if (!upErr) totalStripped += 1;
          }

          if (deleteIds.length > 0) {
            for (let i = 0; i < deleteIds.length; i += 200) {
              const batch = deleteIds.slice(i, i + 200);
              const { error: delErr } = await (supabaseAdmin as any)
                .from(table)
                .delete()
                .in("id", batch);
              if (!delErr) totalDeleted += batch.length;
            }
          }

          totalScanned += rows?.length ?? 0;
        }

        return new Response(
          JSON.stringify({
            success: true,
            scanned: totalScanned,
            stripped: totalStripped,
            deleted: totalDeleted,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
