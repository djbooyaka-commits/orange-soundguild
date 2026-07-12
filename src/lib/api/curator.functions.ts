import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function extractPlaylistId(input: string): string | null {
  const trimmed = input.trim();
  const uriMatch = trimmed.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (uriMatch) return uriMatch[1];
  const urlMatch = trimmed.match(/playlist\/([A-Za-z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[A-Za-z0-9]{16,}$/.test(trimmed)) return trimmed;
  return null;
}

export const addCuratorPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { url: string }) => data)
  .handler(async ({ data, context }) => {
    const spotifyId = extractPlaylistId(data.url);
    if (!spotifyId) throw new Error("Invalid Spotify playlist URL");

    // Verify user is superfan
    const { data: prof } = await context.supabase
      .from("profiles")
      .select("account_type")
      .eq("id", context.userId)
      .maybeSingle();
    if (prof?.account_type !== "superfan") {
      throw new Error("Only Superfans can submit playlists");
    }

    // Fetch playlist meta via client credentials (app-level token)
    let name = "Spotify playlist";
    let imageUrl: string | null = null;
    try {
      const clientId = process.env.SPOTIFY_CLIENT_ID!;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET!;
      const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokRes = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      if (tokRes.ok) {
        const tok = await tokRes.json();
        const metaRes = await fetch(
          `https://api.spotify.com/v1/playlists/${spotifyId}?fields=name,images`,
          { headers: { Authorization: `Bearer ${tok.access_token}` } },
        );
        if (metaRes.ok) {
          const meta = await metaRes.json();
          if (meta.name) name = meta.name;
          if (meta.images?.[0]?.url) imageUrl = meta.images[0].url;
        }
      }
    } catch (e) {
      console.error("Spotify meta fetch failed", e);
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inserted, error } = await supabaseAdmin
      .from("curator_playlists")
      .insert({
        curator_id: context.userId,
        spotify_playlist_id: spotifyId,
        name,
        image_url: imageUrl,
      })
      .select("id, spotify_playlist_id, name, image_url")
      .single();
    if (error) throw new Error(error.message);
    return inserted;
  });

export const removeCuratorPlaylist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("curator_playlists")
      .delete()
      .eq("id", data.id)
      .eq("curator_id", context.userId);
    return { ok: true };
  });

export const listMyCuratorPlaylists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("curator_playlists")
      .select("id, spotify_playlist_id, name, image_url, created_at")
      .eq("curator_id", context.userId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const getCuratorEarnedPoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("get_curator_earned_points");
    return { points: (data as number | null) ?? 0 };
  });
