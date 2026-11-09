/**
 * A member can use a different Last.fm account in a specific Stream Tracker
 * room (e.g. a YouTube room). The room account wins. Spotify rooms fall back
 * to the member's default Last.fm account; YouTube, Tidal and Apple Music
 * rooms never do — they need their own account. Server-only (pass the admin
 * client).
 */

/** Platforms whose rooms need a dedicated Last.fm account (no default). */
export const DEDICATED_LASTFM_PLATFORMS = ["youtube", "tidal", "apple_music"] as const;

/**
 * True when the room may use the member's default Last.fm account: any room
 * with a Spotify (or OSG) playlist, or with no playlists yet.
 */
export function roomUsesDefaultLastfm(platforms: Array<string | null | undefined>): boolean {
  if (!platforms.length) return true;
  return !platforms.every((p) =>
    (DEDICATED_LASTFM_PLATFORMS as readonly string[]).includes(String(p ?? "spotify")),
  );
}

/** The room's music service for setup tips: one platform, or "mixed". */
export function roomLastfmPlatform(platforms: Array<string | null | undefined>): string {
  const set = new Set(platforms.map((p) => String(p ?? "spotify")));
  if (set.size === 1) return [...set][0];
  return set.size === 0 ? "spotify" : "mixed";
}

export async function roomPlatforms(admin: any, roomId: string): Promise<string[]> {
  const { data } = await admin.from("beta_room_playlists").select("platform").eq("room_id", roomId);
  return ((data ?? []) as any[]).map((r) => String(r.platform ?? "spotify"));
}

/** Last.fm username to use for one member in one room, or null if none. */
export async function resolveRoomLastfmUsername(
  admin: any,
  roomId: string,
  userId: string,
): Promise<string | null> {
  const map = await roomLastfmUsernames(admin, roomId, [userId]);
  return map.get(userId) ?? null;
}

/** Room account (if set), else default account where the room allows it. */
export async function roomLastfmUsernames(
  admin: any,
  roomId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!userIds.length) return out;
  const [platforms, { data: overrides }] = await Promise.all([
    roomPlatforms(admin, roomId),
    admin
      .from("beta_room_lastfm_accounts")
      .select("user_id, lastfm_username")
      .eq("room_id", roomId)
      .in("user_id", userIds),
  ]);
  if (roomUsesDefaultLastfm(platforms)) {
    const { data: defaults } = await admin
      .from("lastfm_connections")
      .select("user_id, lastfm_username")
      .in("user_id", userIds);
    for (const r of (defaults ?? []) as any[]) {
      if (r.lastfm_username) out.set(r.user_id as string, r.lastfm_username as string);
    }
  }
  for (const r of (overrides ?? []) as any[]) {
    if (r.lastfm_username) out.set(r.user_id as string, r.lastfm_username as string);
  }
  return out;
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * True when a Last.fm username is already used anywhere on the site — as any
 * member's default account, or as a room account in any other room/member.
 * `keep.roomId`+`keep.userId` is the caller's own row for that room, and
 * `keep.defaultOf` is a member whose own default account doesn't count.
 */
export async function lastfmAccountInUse(
  admin: any,
  username: string,
  keep?: { roomId?: string; userId?: string; defaultOf?: string },
): Promise<boolean> {
  const name = username.trim().toLowerCase();
  if (!name) return false;
  const pattern = escapeLike(name);
  const [{ data: defaults }, { data: rooms }] = await Promise.all([
    admin.from("lastfm_connections").select("user_id, lastfm_username").ilike("lastfm_username", pattern),
    admin
      .from("beta_room_lastfm_accounts")
      .select("room_id, user_id, lastfm_username")
      .ilike("lastfm_username", pattern),
  ]);
  const same = (r: any) => String(r.lastfm_username ?? "").toLowerCase() === name;
  if (((defaults ?? []) as any[]).some((r) => same(r) && r.user_id !== keep?.defaultOf)) return true;
  return ((rooms ?? []) as any[]).some(
    (r) => same(r) && !(keep?.roomId && r.room_id === keep.roomId && r.user_id === keep.userId),
  );
}

export const LASTFM_IN_USE_MESSAGE =
  "This Last.fm account is already in use on the site. Each room needs a new Last.fm account.";
