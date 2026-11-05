const DAY = 24 * 60 * 60 * 1000;

/** Same count the red stars show: days (max 7) a member has gone without a curator pass. */
export function noPassStarCount(
  lastDeductionAt: string | null,
  joinedAt: string | null,
  periodDays: number,
  now = Date.now(),
): number {
  const starts = [now - 7 * DAY];
  if (lastDeductionAt) starts.push(new Date(lastDeductionAt).getTime() + periodDays * DAY);
  if (joinedAt) starts.push(new Date(joinedAt).getTime());
  const since = Math.max(...starts.filter((n) => isFinite(n)));
  return Math.min(7, Math.max(1, Math.ceil((now - since) / DAY)));
}

export function hasRecentPass(lastDeductionAt: string | null, periodDays: number, now = Date.now()) {
  return !!lastDeductionAt && now - new Date(lastDeductionAt).getTime() < periodDays * DAY;
}

async function spotifyRemove(token: string, playlistId: string, trackIds: string[]) {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // The /items DELETE endpoint requires `items`; `tracks` returns 400 "No uris provided".
    body: JSON.stringify({ items: trackIds.map((id) => ({ uri: `spotify:track:${id}` })) }),
  });
  if (!res.ok) console.error(`Auto-remove DELETE failed [${res.status}]`, await res.text().catch(() => ""));
  return res.ok;
}

async function spotifyAdd(token: string, playlistId: string, trackIds: string[]) {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: trackIds.map((id) => `spotify:track:${id}`) }),
  });
  return res.ok;
}

/**
 * Removes a member's tracks from a team Spotify playlist once their red stars reach the
 * curator's threshold, and puts them back automatically once the member has a pass again.
 * Track links stay saved on OSG; only the Spotify playlist changes.
 */
export async function syncAutoRemovals(
  supabaseAdmin: any,
  opts: {
    playlistId: string;
    spotifyPlaylistId: string;
    ownerId: string;
    threshold: number | null;
    periodDays: number;
    members: { user_id: string; last_deduction_at: string | null; joined_at: string | null }[];
    /** Spotify stream tracker team rooms keep their own removal list and member links. */
    removalsTable?: string;
    accessToken?: string | null;
    trackIdsByUser?: (userIds: string[]) => Promise<Map<string, string[]>>;
  },
) {
  const table = opts.removalsTable ?? "beta_playlist_auto_removals";
  const { data: existing } = await supabaseAdmin
    .from(table)
    .select("user_id, spotify_track_id")
    .eq("playlist_id", opts.playlistId);
  const removedBy = new Map<string, string[]>();
  for (const r of existing ?? []) {
    const arr = removedBy.get(r.user_id) ?? [];
    arr.push(r.spotify_track_id);
    removedBy.set(r.user_id, arr);
  }

  const toRestore: string[] = [];
  const toRemoveUsers: string[] = [];
  for (const m of opts.members) {
    if (m.user_id === opts.ownerId) continue;
    const passed = hasRecentPass(m.last_deduction_at, opts.periodDays);
    const isRemoved = removedBy.has(m.user_id);
    const stars = noPassStarCount(m.last_deduction_at, m.joined_at, opts.periodDays);
    if (isRemoved && (passed || !opts.threshold)) toRestore.push(m.user_id);
    else if (!isRemoved && !passed && opts.threshold && stars >= opts.threshold)
      toRemoveUsers.push(m.user_id);
  }
  if (!toRestore.length && !toRemoveUsers.length) return;

  const { getBetaAccessToken, fetchBetaPlaylistTracks, parseSpotifyTrackId } = await import(
    "./beta-spotify.server"
  );
  const token =
    opts.accessToken !== undefined ? opts.accessToken : await getBetaAccessToken(opts.ownerId, supabaseAdmin);
  if (!token) return;

  for (const uid of toRestore) {
    const ids = removedBy.get(uid) ?? [];
    if (ids.length && !(await spotifyAdd(token, opts.spotifyPlaylistId, ids))) continue;
    await supabaseAdmin
      .from(table)
      .delete()
      .eq("playlist_id", opts.playlistId)
      .eq("user_id", uid);
  }

  if (!toRemoveUsers.length) return;
  if (opts.trackIdsByUser) {
    const [byUser, current] = await Promise.all([
      opts.trackIdsByUser(toRemoveUsers),
      fetchBetaPlaylistTracks(token, opts.spotifyPlaylistId),
    ]);
    const onPl = new Set(current.items.map((t: any) => t.id as string));
    for (const uid of toRemoveUsers) {
      const list = (byUser.get(uid) ?? []).filter((id) => onPl.has(id));
      if (!list.length || !(await spotifyRemove(token, opts.spotifyPlaylistId, list))) continue;
      await supabaseAdmin
        .from(table)
        .upsert(
          list.map((id) => ({ playlist_id: opts.playlistId, user_id: uid, spotify_track_id: id })),
          { onConflict: "playlist_id,user_id,spotify_track_id", ignoreDuplicates: true },
        );
    }
    return;
  }
  const [{ data: links }, { data: subs }, current] = await Promise.all([
    supabaseAdmin
      .from("beta_playlist_member_links")
      .select("user_id, track_url, track2_url, track3_url, track4_url, track5_url")
      .eq("playlist_id", opts.playlistId)
      .in("user_id", toRemoveUsers),
    supabaseAdmin
      .from("beta_submissions")
      .select("submitter_user_id, spotify_track_id")
      .eq("playlist_id", opts.playlistId)
      .eq("status", "approved")
      .in("submitter_user_id", toRemoveUsers),
    fetchBetaPlaylistTracks(token, opts.spotifyPlaylistId),
  ]);
  const onPlaylist = new Set(current.items.map((t: any) => t.id as string));
  for (const uid of toRemoveUsers) {
    const ids = new Set<string>();
    for (const l of (links ?? []).filter((l: any) => l.user_id === uid)) {
      for (const u of [l.track_url, l.track2_url, l.track3_url, l.track4_url, l.track5_url]) {
        const id = u ? parseSpotifyTrackId(u) : null;
        if (id) ids.add(id);
      }
    }
    for (const s of (subs ?? []).filter((s: any) => s.submitter_user_id === uid))
      if (s.spotify_track_id) ids.add(s.spotify_track_id);
    const list = Array.from(ids).filter((id) => onPlaylist.has(id));
    if (!list.length) continue;
    if (!(await spotifyRemove(token, opts.spotifyPlaylistId, list))) continue;
    await supabaseAdmin
      .from(table)
      .upsert(
        list.map((id) => ({ playlist_id: opts.playlistId, user_id: uid, spotify_track_id: id })),
        { onConflict: "playlist_id,user_id,spotify_track_id", ignoreDuplicates: true },
      );
  }
}
