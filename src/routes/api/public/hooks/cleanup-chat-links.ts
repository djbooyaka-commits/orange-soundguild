import { createFileRoute } from "@tanstack/react-router";

// Strips http(s) URLs out of direct message bodies older than 30 days.
// If the message ends up with no text and no image, it is deleted.
const URL_RE = /(https?:\/\/[^\s<>"']+)/gi;

export const Route = createFileRoute("/api/public/hooks/cleanup-chat-links")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

        const { data: rows, error } = await supabaseAdmin
          .from("direct_messages")
          .select("id, body, image_url")
          .lt("created_at", cutoff)
          .ilike("body", "%http%")
          .limit(2000);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        let stripped = 0;
        let deleted = 0;
        const deleteIds: string[] = [];

        for (const r of rows ?? []) {
          const original = r.body ?? "";
          if (!URL_RE.test(original)) continue;
          const cleaned = original.replace(URL_RE, "[link removed]").replace(/\s+/g, " ").trim();

          if (!cleaned && !r.image_url) {
            deleteIds.push(r.id);
            continue;
          }

          const { error: upErr } = await supabaseAdmin
            .from("direct_messages")
            .update({ body: cleaned })
            .eq("id", r.id);
          if (!upErr) stripped += 1;
        }

        if (deleteIds.length > 0) {
          for (let i = 0; i < deleteIds.length; i += 200) {
            const batch = deleteIds.slice(i, i + 200);
            const { error: delErr } = await supabaseAdmin
              .from("direct_messages")
              .delete()
              .in("id", batch);
            if (!delErr) deleted += batch.length;
          }
        }

        return new Response(
          JSON.stringify({ success: true, scanned: rows?.length ?? 0, stripped, deleted }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
