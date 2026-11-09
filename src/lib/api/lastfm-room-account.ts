/**
 * A member can use a different Last.fm account in a specific Stream Tracker
 * room (e.g. a YouTube room). The room account wins; otherwise the member's
 * default Last.fm account is used. Server-only (pass the admin client).
 */

/** Last.fm username to use for one member in one room, or null if none. */
export async function resolveRoomLastfmUsername(
  admin: any,
  roomId: string,
  userId: string,
): Promise<string | null> {
  const map = await roomLastfmUsernames(admin, roomId, [userId]);
  return map.get(userId) ?? null;
}

/** Room account (if set) or default account for each member. */
export async function roomLastfmUsernames(
  admin: any,
  roomId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!userIds.length) return out;
  const [{ data: defaults }, { data: overrides }] = await Promise.all([
    admin.from("lastfm_connections").select("user_id, lastfm_username").in("user_id", userIds),
    admin
      .from("beta_room_lastfm_accounts")
      .select("user_id, lastfm_username")
      .eq("room_id", roomId)
      .in("user_id", userIds),
  ]);
  for (const r of (defaults ?? []) as any[]) {
    if (r.lastfm_username) out.set(r.user_id as string, r.lastfm_username as string);
  }
  for (const r of (overrides ?? []) as any[]) {
    if (r.lastfm_username) out.set(r.user_id as string, r.lastfm_username as string);
  }
  return out;
}
