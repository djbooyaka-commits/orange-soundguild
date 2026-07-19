import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Track } from "./tracks";
import cover2 from "@/assets/cover2.jpg";
import { signMany } from "./signMedia";
import { fetchCollaboratorsFor, fetchTrackIdsWhereCollaborator } from "./collaborators";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

type Row = {
  id: string;
  title: string;
  genre: string;
  audio_url: string;
  cover_art_url: string | null;
  created_at: string;
  user_id: string;
  plays_count: number | null;
  album: string | null;
  track_number: number | null;
  profiles: { username: string | null } | null;
};

async function hydrate(rows: Row[]): Promise<Track[]> {
  const items: { bucket: "audio" | "covers"; path: string | null | undefined }[] = [];
  rows.forEach((row) => {
    items.push({ bucket: "audio", path: row.audio_url });
    items.push({ bucket: "covers", path: row.cover_art_url });
  });
  const urls = await signMany(items);
  const collabs = await fetchCollaboratorsFor(rows.map((r) => r.id));
  return rows.map((row, i) => ({
    id: row.id,
    title: row.title,
    artist: row.profiles?.username ?? "Artist",
    cover: urls[i * 2 + 1] ?? cover2,
    src: urls[i * 2] ?? "",
    durationLabel: "—:—",
    uploadedAt: timeAgo(row.created_at),
    plays: row.plays_count ?? 0,
    genre: row.genre,
    album: row.album ?? null,
    trackNumber: row.track_number ?? null,
    collaborators: collabs.get(row.id) ?? [],
  }));
}

function incrementTrackPlays(tracks: Track[], trackId: string) {
  return tracks.map((track) =>
    track.id === trackId ? { ...track, plays: track.plays + 1 } : track,
  );
}

export function useAllTracks() {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("tracks")
        .select(
          "id, title, genre, audio_url, cover_art_url, created_at, user_id, plays_count, album, track_number, profiles(username)",
        )
        .order("created_at", { ascending: false });
      if (cancelled) return;
      const hydrated = data ? await hydrate(data as Row[]) : [];
      if (!cancelled) {
        setTracks(hydrated);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onTrackPlayed = (event: Event) => {
      const trackId = (event as CustomEvent<{ trackId?: string }>).detail?.trackId;
      if (trackId) setTracks((prev) => incrementTrackPlays(prev, trackId));
    };
    window.addEventListener("soundwave:track-played", onTrackPlayed);
    return () => window.removeEventListener("soundwave:track-played", onTrackPlayed);
  }, []);

  return { tracks, loading };
}

export function useUserTracks(userId: string | null) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setTracks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      // Owned tracks
      const ownedRes = await supabase
        .from("tracks")
        .select(
          "id, title, genre, audio_url, cover_art_url, created_at, user_id, plays_count, album, track_number, profiles(username)",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      // Tracks where this user is a collaborator
      const collabIds = await fetchTrackIdsWhereCollaborator(userId);
      let collabRows: Row[] = [];
      if (collabIds.length) {
        const res = await supabase
          .from("tracks")
          .select(
            "id, title, genre, audio_url, cover_art_url, created_at, user_id, plays_count, album, track_number, profiles(username)",
          )
          .in("id", collabIds);
        collabRows = (res.data ?? []) as Row[];
      }

      const seen = new Set<string>();
      const merged: Row[] = [];
      [...((ownedRes.data ?? []) as Row[]), ...collabRows].forEach((r) => {
        if (seen.has(r.id)) return;
        seen.add(r.id);
        merged.push(r);
      });
      merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      if (cancelled) return;
      const hydrated = await hydrate(merged);
      if (!cancelled) {
        setTracks(hydrated);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const onTrackPlayed = (event: Event) => {
      const trackId = (event as CustomEvent<{ trackId?: string }>).detail?.trackId;
      if (trackId) setTracks((prev) => incrementTrackPlays(prev, trackId));
    };
    window.addEventListener("soundwave:track-played", onTrackPlayed);
    return () => window.removeEventListener("soundwave:track-played", onTrackPlayed);
  }, []);

  return { tracks, loading };
}
