import {
  parseApplePlaylistPage,
  parseTidalApiItems,
  parseTidalEmbed,
  tidalPlaylistId,
  type ExternalTrack,
} from "@/lib/external-playlist";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
// Public token Tidal's own web player uses for logged-out playlist reads.
const TIDAL_WEB_TOKEN = "CzET4vdadNUFQ5JU";
const TIDAL_MAX_PAGES = 20; // 2,000 songs

export async function fetchApplePlaylist(url: string): Promise<{ tracks: ExternalTrack[]; name: string | null }> {
  if (!/music\.apple\.com\/.+\/playlist\//i.test(url) && !/[?&/]pl\.[A-Za-z0-9-]+/.test(url))
    throw new Error("That Apple Music link isn't a playlist (music.apple.com/…/playlist/…)");
  const r = await fetch(url.trim(), { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
  if (!r.ok) throw new Error(`apple_page_${r.status}`);
  return parseApplePlaylistPage(await r.text());
}

export async function fetchTidalPlaylist(url: string): Promise<{ tracks: ExternalTrack[]; name: string | null }> {
  const id = tidalPlaylistId(url);
  if (!id) throw new Error("That Tidal link isn't a playlist (tidal.com/playlist/…)");
  const headers = { "x-tidal-token": TIDAL_WEB_TOKEN, "User-Agent": UA };
  try {
    let name: string | null = null;
    const meta = await fetch(`https://api.tidal.com/v1/playlists/${id}?countryCode=US`, { headers });
    if (meta.ok) name = ((await meta.json()) as any)?.title ?? null;
    let tracks: ExternalTrack[] = [];
    for (let page = 0; page < TIDAL_MAX_PAGES; page++) {
      const r = await fetch(
        `https://api.tidal.com/v1/playlists/${id}/tracks?countryCode=US&limit=100&offset=${page * 100}`,
        { headers },
      );
      if (!r.ok) throw new Error(`tidal_api_${r.status}`);
      const j: any = await r.json();
      const items = parseTidalApiItems(j);
      tracks = tracks.concat(items);
      if (!j?.items?.length || tracks.length >= Number(j?.totalNumberOfItems ?? 0)) break;
    }
    if (tracks.length) return { tracks, name };
  } catch (e) {
    console.error("Tidal API read failed, trying the embed player", e);
  }
  // Fallback: embed player only lists the first ~50 songs.
  const r = await fetch(`https://embed.tidal.com/playlists/${id}`, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`tidal_embed_${r.status}`);
  return { tracks: parseTidalEmbed(await r.text()), name: null };
}

/** Replaces a room playlist's tracked songs. Never wipes the list when nothing was read. */
export async function replaceRoomPlaylistTracks(
  supabaseAdmin: any,
  roomId: string,
  playlistRowId: string,
  tracks: ExternalTrack[],
  emptyMessage: string,
): Promise<number> {
  const seen = new Set<string>();
  const rows = tracks
    .map((t) => ({
      room_id: roomId,
      playlist_id: playlistRowId,
      spotify_track_id: `ext:${t.artist.toLowerCase()}|${t.name.toLowerCase()}`.slice(0, 250),
      track_name: t.name,
      artist_name: t.artist,
    }))
    .filter((r) => (seen.has(r.spotify_track_id) ? false : (seen.add(r.spotify_track_id), true)));
  if (!rows.length) throw new Error(emptyMessage);
  await supabaseAdmin.from("beta_room_tracks").delete().eq("playlist_id", playlistRowId);
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabaseAdmin
      .from("beta_room_tracks")
      .upsert(rows.slice(i, i + 200), { onConflict: "room_id,playlist_id,spotify_track_id" });
    if (error) throw new Error(error.message);
  }
  return rows.length;
}

/** Syncs an Apple Music or Tidal room playlist from its public page. */
export async function importExternalPlaylistTracks(
  supabaseAdmin: any,
  roomId: string,
  playlistRowId: string,
  platform: "apple_music" | "tidal",
  url: string,
): Promise<{ imported: number; name: string | null }> {
  const label = platform === "tidal" ? "Tidal" : "Apple Music";
  let result: { tracks: ExternalTrack[]; name: string | null };
  try {
    result = platform === "tidal" ? await fetchTidalPlaylist(url) : await fetchApplePlaylist(url);
  } catch (e: any) {
    if (String(e?.message ?? "").startsWith("That ")) throw e;
    console.error(`${label} playlist read failed`, playlistRowId, e);
    throw new Error(`${label} didn't let us read that playlist right now. Try again later, or use Edit tracklist.`);
  }
  const imported = await replaceRoomPlaylistTracks(
    supabaseAdmin,
    roomId,
    playlistRowId,
    result.tracks,
    `No songs found — make sure the ${label} playlist is public.`,
  );
  return { imported, name: result.name };
}
