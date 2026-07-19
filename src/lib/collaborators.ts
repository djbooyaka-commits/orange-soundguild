import { supabase } from "@/integrations/supabase/client";
import type { TrackCollaborator } from "./tracks";

/**
 * Fetch collaborators for a set of tracks in one round trip.
 * Returns a Map keyed by track_id, with ordered collaborator arrays.
 */
export async function fetchCollaboratorsFor(
  trackIds: string[],
): Promise<Map<string, TrackCollaborator[]>> {
  const out = new Map<string, TrackCollaborator[]>();
  if (!trackIds.length) return out;

  const { data: rows } = await supabase
    .from("track_collaborators")
    .select("track_id, user_id, position")
    .in("track_id", trackIds)
    .order("position", { ascending: true });

  if (!rows || !rows.length) return out;

  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profs } = await supabase
    .from("profiles")
    .select("id, username")
    .in("id", userIds);

  const nameMap = new Map<string, string>();
  (profs ?? []).forEach((p) => {
    if (p.username) nameMap.set(p.id, p.username);
  });

  rows.forEach((r) => {
    const username = nameMap.get(r.user_id);
    if (!username) return;
    const list = out.get(r.track_id) ?? [];
    list.push({ id: r.user_id, username });
    out.set(r.track_id, list);
  });

  return out;
}

/**
 * Fetch track IDs where the given user appears as a collaborator (not uploader).
 */
export async function fetchTrackIdsWhereCollaborator(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("track_collaborators")
    .select("track_id")
    .eq("user_id", userId);
  return (data ?? []).map((r) => r.track_id);
}
