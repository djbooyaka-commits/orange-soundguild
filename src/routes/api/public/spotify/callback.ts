import { createFileRoute } from "@tanstack/react-router";
import { verifyState } from "@/lib/api/spotify-state.server";

export const Route = createFileRoute("/api/public/spotify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");
        const origin = url.origin;

        if (error) {
          return Response.redirect(`${origin}/curator?spotify=error`, 302);
        }
        if (!code || !state) {
          return Response.redirect(`${origin}/curator?spotify=missing`, 302);
        }
        const userId = verifyState(state);
        if (!userId) {
          return Response.redirect(`${origin}/curator?spotify=badstate`, 302);
        }

        const clientId = process.env.SPOTIFY_CLIENT_ID!;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
        const redirectUri = `${origin}/api/public/spotify/callback`;
        const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

        const tokRes = await fetch("https://accounts.spotify.com/api/token", {
          method: "POST",
          headers: {
            Authorization: `Basic ${basic}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
          }),
        });
        if (!tokRes.ok) {
          const t = await tokRes.text();
          console.error(`Spotify token exchange failed [${tokRes.status}]: ${t}`);
          return Response.redirect(`${origin}/curator?spotify=tokenfail`, 302);
        }
        const tok = await tokRes.json();

        // Fetch spotify user id
        let spotifyUserId: string | null = null;
        try {
          const meRes = await fetch("https://api.spotify.com/v1/me", {
            headers: { Authorization: `Bearer ${tok.access_token}` },
          });
          if (meRes.ok) {
            const me = await meRes.json();
            spotifyUserId = me.id ?? null;
          }
        } catch {
          // ignore
        }

        const expiresAt = new Date(Date.now() + (tok.expires_in as number) * 1000).toISOString();

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: upErr } = await supabaseAdmin
          .from("spotify_connections")
          .upsert(
            {
              user_id: userId,
              access_token: tok.access_token,
              refresh_token: tok.refresh_token,
              expires_at: expiresAt,
              scope: tok.scope ?? null,
              spotify_user_id: spotifyUserId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );
        if (upErr) {
          console.error("Spotify upsert failed", upErr);
          return Response.redirect(`${origin}/curator?spotify=savefail`, 302);
        }

        return Response.redirect(`${origin}/curator?spotify=connected`, 302);
      },
    },
  },
});
