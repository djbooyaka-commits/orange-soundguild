import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Track } from "./tracks";
import cover2 from "@/assets/cover2.jpg";
import { signMany } from "./signMedia";

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
  profiles: { username: string | null } | null;
};

async function hydrate(rows: Row[]): Promise<Track[]> {
  const items: { bucket: "audio" | "covers"; path: string | null | undefined }[] = [];
  rows.forEach((row) => {
    items.push({ bucket: "audio", path: row.audio_url });
    items.push({ bucket: "covers", path: row.cover_art_url });
  });
  const urls = await signMany(items);
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
          "id, title, genre, audio_url, cover_art_url, created_at, user_id, plays_count, profiles(username)",
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
      const { data } = await supabase
        .from("tracks")
        .select(
          "id, title, genre, audio_url, cover_art_url, created_at, user_id, plays_count, profiles(username)",
        )
        .eq("user_id", userId)
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
