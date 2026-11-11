import {
  cleanYoutubeTitle,
  extractInitialData,
  parsePlaylistItems,
  youtubePlaylistId,
  type YoutubeTrack,
} from "@/lib/youtube-playlist";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36";
const MAX_PAGES = 20; // ~2,000 songs

/** Official YouTube Data API — used only when a YOUTUBE_API_KEY is configured. */
async function viaApi(listId: string, key: string): Promise<YoutubeTrack[]> {
  const out: YoutubeTrack[] = [];
  let pageToken = "";
  for (let i = 0; i < MAX_PAGES; i++) {
    const u = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
    u.searchParams.set("part", "snippet");
    u.searchParams.set("maxResults", "50");
    u.searchParams.set("playlistId", listId);
    u.searchParams.set("key", key);
    if (pageToken) u.searchParams.set("pageToken", pageToken);
    const r = await fetch(u);
    if (!r.ok) throw new Error(`youtube_api_${r.status}`);
    const j: any = await r.json();
    for (const it of j.items ?? []) {
      const s = it.snippet ?? {};
      const videoId = s.resourceId?.videoId;
      if (!videoId || /^(Private|Deleted) video$/i.test(s.title ?? "")) continue;
      out.push({ ...cleanYoutubeTitle(s.title ?? "", s.videoOwnerChannelTitle ?? ""), videoId });
    }
    pageToken = j.nextPageToken ?? "";
    if (!pageToken) break;
  }
  return out;
}

/** Public playlist page + its "load more" pages. No key needed. */
async function viaPage(listId: string): Promise<{ tracks: YoutubeTrack[]; name: string | null }> {
  const r = await fetch(`https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}&hl=en`, {
    headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: "CONSENT=YES+1; SOCS=CAI" },
  });
  if (!r.ok) throw new Error(`youtube_page_${r.status}`);
  const html = await r.text();
  const data = extractInitialData(html);
  if (!data) throw new Error("youtube_page_unreadable");
  const name =
    (data?.metadata?.playlistMetadataRenderer?.title as string | undefined) ??
    html.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ??
    null;
  const clientVersion = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/)?.[1] ?? "2.20250101.00.00";
  let { tracks, continuation } = parsePlaylistItems(data);
  for (let i = 0; continuation && i < MAX_PAGES; i++) {
    const res = await fetch("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": UA },
      body: JSON.stringify({
        context: { client: { clientName: "WEB", clientVersion, hl: "en" } },
        continuation,
      }),
    });
    if (!res.ok) break;
    const next = parsePlaylistItems(await res.json());
    if (!next.tracks.length) break;
    tracks = tracks.concat(next.tracks);
    continuation = next.continuation;
  }
  return { tracks, name };
}

/** Reads every song in a public YouTube / YouTube Music playlist. */
export async function fetchYoutubePlaylist(
  url: string,
): Promise<{ tracks: YoutubeTrack[]; name: string | null }> {
  const listId = youtubePlaylistId(url);
  if (!listId) throw new Error("That YouTube link has no playlist (list=…) in it");
  const key = process.env["YOUTUBE_API_KEY"];
  if (key) {
    try {
      const tracks = await viaApi(listId, key);
      if (tracks.length) return { tracks, name: null };
    } catch (e) {
      console.error("YouTube API read failed, trying the public page", e);
    }
  }
  return viaPage(listId);
}

/** Replaces a room playlist's tracked songs with the YouTube playlist's current songs. */
export async function importYoutubePlaylistTracks(
  supabaseAdmin: any,
  roomId: string,
  playlistRowId: string,
  url: string,
): Promise<{ imported: number; name: string | null }> {
  let result: { tracks: YoutubeTrack[]; name: string | null };
  try {
    result = await fetchYoutubePlaylist(url);
  } catch (e: any) {
    if (String(e?.message ?? "").startsWith("That YouTube")) throw e;
    console.error("YouTube playlist read failed", playlistRowId, e);
    throw new Error("YouTube didn't let us read that playlist right now. Try again later, or use Edit tracklist.");
  }
  const seen = new Set<string>();
  const rows = result.tracks
    .map((t) => ({
      room_id: roomId,
      playlist_id: playlistRowId,
      spotify_track_id: `ext:${t.artist.toLowerCase()}|${t.name.toLowerCase()}`.slice(0, 250),
      track_name: t.name,
      artist_name: t.artist,
    }))
    .filter((r) => (seen.has(r.spotify_track_id) ? false : (seen.add(r.spotify_track_id), true)));
  // Never wipe the current list when YouTube returns nothing (private/empty or blocked)
  if (!rows.length) throw new Error("No songs found — make sure the YouTube playlist is Public or Unlisted.");
  await supabaseAdmin.from("beta_room_tracks").delete().eq("playlist_id", playlistRowId);
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabaseAdmin
      .from("beta_room_tracks")
      .upsert(rows.slice(i, i + 200), { onConflict: "room_id,playlist_id,spotify_track_id" });
    if (error) throw new Error(error.message);
  }
  return { imported: rows.length, name: result.name };
}
