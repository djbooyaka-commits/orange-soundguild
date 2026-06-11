import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Track } from "./tracks";
import cover2 from "@/assets/cover2.jpg";

const SIGNED_TTL = 60 * 60 * 24 * 365;

async function signed(bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? null;
}

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
  profiles: { username: string | null } | null;
};

async function hydrate(rows: Row[]): Promise<Track[]> {
  return Promise.all(
    rows.map(async (row) => {
      const src = (await signed("audio", row.audio_url)) ?? "";
      const cover = row.cover_art_url ? ((await signed("covers", row.cover_art_url)) ?? cover2) : cover2;
      return {
        id: row.id,
        title: row.title,
        artist: row.profiles?.username ?? "Artist",
        cover,
        src,
        durationLabel: "—:—",
        uploadedAt: timeAgo(row.created_at),
        plays: 0,
        genre: row.genre,
      } as Track;
    })
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
        .select("id, title, genre, audio_url, cover_art_url, created_at, user_id, profiles(username)")
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
        .select("id, title, genre, audio_url, cover_art_url, created_at, user_id, profiles(username)")
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

  return { tracks, loading };
}
