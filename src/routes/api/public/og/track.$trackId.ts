import { createFileRoute } from "@tanstack/react-router";

// Public, stable cover-image URL used for og:image / twitter:image.
// Streams the track's cover through our own domain with clean headers
// (no cookies, no signed-URL query string) so social card scrapers like
// X's Twitterbot will cache and render it reliably.
export const Route = createFileRoute("/api/public/og/track/$trackId")({
  server: {
    handlers: {
      HEAD: async ({ params }) => {
        const trackId = params.trackId;
        if (!/^[0-9a-f-]{36}$/i.test(trackId)) {
          return new Response(null, { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("tracks")
          .select("cover_art_url")
          .eq("id", trackId)
          .maybeSingle();

        if (!row?.cover_art_url) {
          return new Response(null, { status: 404 });
        }

        return new Response(null, {
          status: 200,
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
          },
        });
      },
      GET: async ({ params }) => {
        const trackId = params.trackId;
        if (!/^[0-9a-f-]{36}$/i.test(trackId)) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("tracks")
          .select("cover_art_url")
          .eq("id", trackId)
          .maybeSingle();

        if (!row?.cover_art_url) {
          return new Response("Not found", { status: 404 });
        }

        let sourceUrl: string;
        if (row.cover_art_url.startsWith("http")) {
          sourceUrl = row.cover_art_url;
        } else {
          const { data: signed } = await supabaseAdmin.storage
            .from("covers")
            .createSignedUrl(row.cover_art_url, 60 * 60);
          if (!signed?.signedUrl) return new Response("Not found", { status: 404 });
          sourceUrl = signed.signedUrl;
        }

        const upstream = await fetch(sourceUrl);
        if (!upstream.ok || !upstream.body) {
          return new Response("Upstream error", { status: 502 });
        }

        const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
        const cleanType = contentType.startsWith("image/") ? contentType : "image/jpeg";

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": cleanType,
            "Cache-Control": "public, max-age=86400, s-maxage=86400, immutable",
          },
        });
      },
    },
  },
});
