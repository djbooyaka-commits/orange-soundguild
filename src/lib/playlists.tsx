import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { type Track } from "./tracks";
import cover2 from "@/assets/cover2.jpg";
import { signMany } from "./signMedia";
import { fetchCollaboratorsFor } from "./collaborators";

export type Playlist = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
};

export type PlaylistWithTracks = Playlist & { tracks: Track[] };

export async function resolveTracksByIds(ids: string[]): Promise<Track[]> {
  if (!ids.length) return [];
  const dbMap = new Map<string, Track>();
  const uuids = ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id));
  if (uuids.length) {
    const { data } = await supabase
      .from("tracks")
      .select("id, title, genre, audio_url, cover_art_url, profiles(username)")
      .in("id", uuids);
    if (data) {
      const rows = data as Array<{
        id: string;
        title: string;
        genre: string;
        audio_url: string;
        cover_art_url: string | null;
        profiles: { username: string | null } | null;
      }>;
      const items: { bucket: "audio" | "covers"; path: string | null | undefined }[] = [];
      rows.forEach((row) => {
        items.push({ bucket: "audio", path: row.audio_url });
        items.push({ bucket: "covers", path: row.cover_art_url });
      });
      const urls = await signMany(items);
      const collabs = await fetchCollaboratorsFor(rows.map((row) => row.id));
      rows.forEach((row, i) => {
        dbMap.set(row.id, {
          id: row.id,
          title: row.title,
          artist: row.profiles?.username ?? "Artist",
          cover: urls[i * 2 + 1] ?? cover2,
          src: urls[i * 2] ?? "",
          durationLabel: "—:—",
          uploadedAt: "",
          plays: 0,
          genre: row.genre,
          collaborators: collabs.get(row.id) ?? [],
        });
      });
    }
  }
  return ids.map((id) => dbMap.get(id)).filter(Boolean) as Track[];
}


export function useMyPlaylists() {
  const { user } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setPlaylists([]);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from("playlists")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setPlaylists((data as Playlist[]) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(
    async (name: string): Promise<Playlist | null> => {
      if (!user) throw new Error("Sign in to create a playlist.");
      const { data, error } = await supabase
        .from("playlists")
        .insert({ user_id: user.id, name })
        .select()
        .single();
      if (error) throw error;
      setPlaylists((prev) => [data as Playlist, ...prev]);
      return data as Playlist;
    },
    [user]
  );

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("playlists").delete().eq("id", id);
    if (error) throw error;
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const addTrack = useCallback(async (playlistId: string, trackId: string) => {
    const { count } = await supabase
      .from("playlist_tracks")
      .select("track_id", { count: "exact", head: true })
      .eq("playlist_id", playlistId);
    const { error } = await supabase
      .from("playlist_tracks")
      .insert({ playlist_id: playlistId, track_id: trackId, position: count ?? 0 });
    if (error && error.code !== "23505") throw error;
  }, []);

  return { playlists, loading, refresh, create, remove, addTrack };
}

export function usePlaylistsForUser(userId: string | null) {
  const [data, setData] = useState<PlaylistWithTracks[]>([]);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setData([]);
      return;
    }
    (async () => {
      const { data: pls } = await supabase
        .from("playlists")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (!pls || cancelled) return;

      const ids = pls.map((p) => p.id);
      const { data: items } = ids.length
        ? await supabase
            .from("playlist_tracks")
            .select("playlist_id, track_id, position")
            .in("playlist_id", ids)
            .order("position", { ascending: true })
        : { data: [] };

      const allTrackIds = Array.from(new Set((items ?? []).map((i) => i.track_id)));
      const resolved = await resolveTracksByIds(allTrackIds);
      const trackMap = new Map(resolved.map((t) => [t.id, t]));

      const grouped: PlaylistWithTracks[] = (pls as Playlist[]).map((p) => ({
        ...p,
        tracks: (items ?? [])
          .filter((i) => i.playlist_id === p.id)
          .map((i) => trackMap.get(i.track_id))
          .filter(Boolean) as Track[],
      }));
      if (!cancelled) setData(grouped);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, version]);

  const removeTrack = useCallback(async (playlistId: string, trackId: string) => {
    const { error } = await supabase
      .from("playlist_tracks")
      .delete()
      .eq("playlist_id", playlistId)
      .eq("track_id", trackId);
    if (error) throw error;
    refresh();
  }, [refresh]);

  const deletePlaylist = useCallback(async (id: string) => {
    const { error } = await supabase.from("playlists").delete().eq("id", id);
    if (error) throw error;
    refresh();
  }, [refresh]);

  const createPlaylist = useCallback(
    async (name: string) => {
      if (!userId) throw new Error("Sign in to create a playlist.");
      const { error } = await supabase.from("playlists").insert({ user_id: userId, name });
      if (error) throw error;
      refresh();
    },
    [userId, refresh]
  );

  const moveTrack = useCallback(
    async (playlistId: string, trackId: string, direction: "up" | "down") => {
      const pl = data.find((p) => p.id === playlistId);
      if (!pl) return;
      const idx = pl.tracks.findIndex((t) => t.id === trackId);
      if (idx < 0) return;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= pl.tracks.length) return;
      const a = pl.tracks[idx];
      const b = pl.tracks[swapIdx];
      // Two-step swap to avoid unique(playlist_id, position) collision
      await supabase
        .from("playlist_tracks")
        .update({ position: swapIdx })
        .eq("playlist_id", playlistId)
        .eq("track_id", a.id);
      await supabase
        .from("playlist_tracks")
        .update({ position: idx })
        .eq("playlist_id", playlistId)
        .eq("track_id", b.id);
      refresh();
    },
    [data, refresh]
  );

  return { playlists: data, refresh, removeTrack, deletePlaylist, createPlaylist, moveTrack };
}

export async function savePlaylistToLibrary(
  sourcePlaylistId: string,
  targetUserId: string,
  sourceName: string,
): Promise<string> {
  // Ensure not saving own playlist
  const { data: src } = await supabase
    .from("playlists")
    .select("user_id")
    .eq("id", sourcePlaylistId)
    .maybeSingle();
  if (src?.user_id === targetUserId) throw new Error("This is already your playlist.");

  // Prevent duplicates by name for this user
  const { data: dup } = await supabase
    .from("playlists")
    .select("id")
    .eq("user_id", targetUserId)
    .eq("name", sourceName)
    .maybeSingle();
  if (dup) throw new Error(`You already have a playlist named "${sourceName}".`);

  const { data: created, error: createErr } = await supabase
    .from("playlists")
    .insert({ user_id: targetUserId, name: sourceName })
    .select("id")
    .single();
  if (createErr || !created) throw createErr ?? new Error("Could not save playlist.");

  const { data: items } = await supabase
    .from("playlist_tracks")
    .select("track_id, position")
    .eq("playlist_id", sourcePlaylistId)
    .order("position", { ascending: true });

  if (items && items.length) {
    const rows = items.map((it, idx) => ({
      playlist_id: created.id,
      track_id: it.track_id,
      position: idx,
    }));
    const { error: insErr } = await supabase.from("playlist_tracks").insert(rows);
    if (insErr) throw insErr;
  }

  return created.id;
}

