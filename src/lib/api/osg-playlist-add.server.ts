const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Adds an approved Orange Sound Guild track to the real OSG playlist behind a
 * room playlist. Only adds when the room curator owns that OSG playlist.
 */
export async function addTrackToOsgPlaylist(
  supabaseAdmin: any,
  opts: { playlistUrl: string | null; trackUrl: string | null; curatorId: string },
): Promise<{ ok: true; already: boolean } | { ok: false; error: string }> {
  const playlistId = (opts.playlistUrl ?? "").match(/\/playlist\/([0-9a-f-]{36})/i)?.[1] ?? null;
  const trackId = (opts.trackUrl ?? "").match(UUID)?.[0] ?? null;
  if (!playlistId) return { ok: false, error: "This room playlist has no Orange Sound Guild playlist link." };
  if (!trackId) return { ok: false, error: "Couldn't read the track from the submitted link. Add it by hand." };
  const { data: pl } = await supabaseAdmin.from("playlists").select("id, user_id").eq("id", playlistId).maybeSingle();
  if (!pl) return { ok: false, error: "The Orange Sound Guild playlist no longer exists." };
  if (pl.user_id !== opts.curatorId)
    return { ok: false, error: "Only the playlist's owner can add tracks to it. Add it by hand." };
  const { data: track } = await supabaseAdmin.from("tracks").select("id").eq("id", trackId).maybeSingle();
  if (!track) return { ok: false, error: "That track no longer exists on Orange Sound Guild." };
  const { data: existing } = await supabaseAdmin
    .from("playlist_tracks")
    .select("track_id")
    .eq("playlist_id", playlistId)
    .eq("track_id", trackId)
    .maybeSingle();
  if (existing) return { ok: true, already: true };
  const { data: last } = await supabaseAdmin
    .from("playlist_tracks")
    .select("position")
    .eq("playlist_id", playlistId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { error } = await supabaseAdmin
    .from("playlist_tracks")
    .insert({ playlist_id: playlistId, track_id: trackId, position: ((last?.position as number) ?? -1) + 1 });
  if (error) return { ok: false, error: "Couldn't add it to the playlist. Add it by hand." };
  return { ok: true, already: false };
}
