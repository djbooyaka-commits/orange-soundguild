export type CuratorRoomScope = "team" | "osg";

/**
 * Who may see / edit a curator room's message.
 * - "osg": room key is the curator's user id; members are their OSG Artist picks.
 * - "team": room key is the Spotify team playlist id; members are its team members.
 */
export async function curatorRoomAccess(
  admin: any,
  { scope, roomKey }: { scope: CuratorRoomScope; roomKey: string },
  userId: string,
) {
  if (scope === "osg") {
    const curatorId = roomKey;
    if (curatorId === userId) return { curatorId, isOwner: true, isMember: true };
    const { data } = await admin
      .from("osg_artist_picks")
      .select("id")
      .eq("user_id", curatorId)
      .eq("artist_id", userId)
      .limit(1);
    return { curatorId, isOwner: false, isMember: (data ?? []).length > 0 };
  }
  const { data: pl } = await admin
    .from("curator_playlists")
    .select("curator_id")
    .eq("id", roomKey)
    .maybeSingle();
  if (!pl) throw new Error("Room not found");
  const curatorId = pl.curator_id as string;
  if (curatorId === userId) return { curatorId, isOwner: true, isMember: true };
  const { data } = await admin
    .from("curator_team_members")
    .select("id")
    .eq("playlist_id", roomKey)
    .eq("user_id", userId)
    .limit(1);
  return { curatorId, isOwner: false, isMember: (data ?? []).length > 0 };
}
