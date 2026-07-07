import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/cleanup-chat-media")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const cutoff = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

        // Fetch old messages that have media attached
        const { data: rows, error } = await supabaseAdmin
          .from("direct_messages")
          .select("id, image_url")
          .not("image_url", "is", null)
          .lt("created_at", cutoff)
          .limit(1000);

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        const paths = (rows ?? [])
          .map((r) => r.image_url)
          .filter((p): p is string => !!p);

        let removed = 0;
        if (paths.length > 0) {
          // Storage remove in batches of 100
          for (let i = 0; i < paths.length; i += 100) {
            const batch = paths.slice(i, i + 100);
            const { error: rmErr } = await supabaseAdmin.storage
              .from("chat-images")
              .remove(batch);
            if (!rmErr) removed += batch.length;
          }

          const ids = (rows ?? []).map((r) => r.id);
          // Null out media reference on those messages (keep text if any)
          await supabaseAdmin
            .from("direct_messages")
            .update({ image_url: null })
            .in("id", ids);
        }

        return new Response(
          JSON.stringify({ success: true, scanned: paths.length, removed }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
