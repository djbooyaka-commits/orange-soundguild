import { createHash, timingSafeEqual } from "crypto";
import { createFileRoute } from "@tanstack/react-router";

function tokensMatch(provided: string, expected: string): boolean {
  const providedHash = createHash("sha256").update(provided).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

export const Route = createFileRoute("/api/public/hooks/cleanup-chat-media")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const providedToken = request.headers.get("x-cron-secret") ?? "";

        const { data: secretRow } = await (supabaseAdmin as any)
          .from("scheduled_job_secrets")
          .select("secret")
          .eq("name", "cleanup-chat-media")
          .maybeSingle();

        if (!secretRow?.secret || !providedToken || !tokensMatch(providedToken, secretRow.secret)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const tables = ["direct_messages", "room_chat_messages"] as const;

        let totalScanned = 0;
        let totalRemoved = 0;
        let totalDeleted = 0;

        for (const table of tables) {
          const { data: rows, error } = await (supabaseAdmin as any)
            .from(table)
            .select("id, body, image_url")
            .not("image_url", "is", null)
            .lt("created_at", cutoff)
            .limit(1000);

          if (error) {
            return new Response(JSON.stringify({ error: error.message, table }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          const paths = (rows ?? [])
            .map((r: any) => r.image_url)
            .filter((p: string | null | undefined): p is string => typeof p === "string" && p.length > 0);

          if (paths.length > 0) {
            for (let i = 0; i < paths.length; i += 100) {
              const batch = paths.slice(i, i + 100);
              const { error: rmErr } = await supabaseAdmin.storage
                .from("chat-images")
                .remove(batch);
              if (!rmErr) totalRemoved += batch.length;
            }
          }

          const idsToNull: string[] = [];
          const idsToDelete: string[] = [];
          for (const r of rows ?? []) {
            const hasText = typeof r.body === "string" && r.body.trim().length > 0;
            if (hasText) idsToNull.push(r.id);
            else idsToDelete.push(r.id);
          }

          if (idsToNull.length > 0) {
            const { error: upErr } = await (supabaseAdmin as any)
              .from(table)
              .update({ image_url: null })
              .in("id", idsToNull);
            if (upErr) {
              return new Response(JSON.stringify({ error: upErr.message, table }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
              });
            }
          }

          if (idsToDelete.length > 0) {
            for (let i = 0; i < idsToDelete.length; i += 200) {
              const batch = idsToDelete.slice(i, i + 200);
              const { error: delErr } = await (supabaseAdmin as any)
                .from(table)
                .delete()
                .in("id", batch);
              if (!delErr) totalDeleted += batch.length;
            }
          }

          totalScanned += paths.length;
        }

        return new Response(
          JSON.stringify({
            success: true,
            scanned: totalScanned,
            removed: totalRemoved,
            deleted: totalDeleted,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
