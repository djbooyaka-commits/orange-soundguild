import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Track } from "./tracks";
import cover2 from "@/assets/cover2.jpg";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { signOne, signMany } from "./signMedia";

export const CURRENT_USER = {
  handle: "me",
  name: "You",
  bio: "Independent producer. Uploads weekly.",
};

type UploadArgs = { title: string; genre: string; file: File; coverFile?: File | null };
type UpdateArgs = { id: string; title: string; genre: string; coverFile?: File | null };

type UploadsState = {
  uploads: Track[];
  addUpload: (data: UploadArgs) => Promise<Track>;
  updateUpload: (data: UpdateArgs) => Promise<void>;
  removeUpload: (id: string) => Promise<void>;
};

const Ctx = createContext<UploadsState | null>(null);

function storagePathFromValue(bucket: string, value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("http")) return value;

  try {
    const url = new URL(value);
    const marker = `/storage/v1/object/sign/${bucket}/`;
    const publicMarker = `/storage/v1/object/public/${bucket}/`;
    const pathname = url.pathname;
    if (pathname.includes(marker)) {
      return decodeURIComponent(pathname.slice(pathname.indexOf(marker) + marker.length));
    }
    if (pathname.includes(publicMarker)) {
      return decodeURIComponent(
        pathname.slice(pathname.indexOf(publicMarker) + publicMarker.length),
      );
    }
  } catch {
    // Keep the original value below if URL parsing fails.
  }

  return value;
}

async function resolveMediaUrl(
  bucket: "audio" | "covers",
  value: string | null | undefined,
): Promise<string | null> {
  const path = storagePathFromValue(bucket, value);
  return signOne(bucket, path);
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

function incrementTrackPlays(tracks: Track[], trackId: string) {
  return tracks.map((track) =>
    track.id === trackId ? { ...track, plays: track.plays + 1 } : track,
  );
}

export function UploadsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<Track[]>([]);

  // Load this user's tracks from the database on auth changes.
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setUploads([]);
      return;
    }
    (async () => {
      const { data, error } = await supabase
        .from("tracks")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error || !data || cancelled) return;

      const hydrated = await Promise.all(
        data.map(async (row) => {
          let src = "";
          let cover: string = cover2;
          try {
            src = (await resolveMediaUrl("audio", row.audio_url)) ?? "";
          } catch {
            // skip if signing fails
          }
          if (row.cover_art_url) {
            try {
              cover = (await resolveMediaUrl("covers", row.cover_art_url)) ?? cover2;
            } catch {
              /* fall back */
            }
          }
          const track: Track = {
            id: row.id,
            title: row.title,
            artist: CURRENT_USER.name,
            cover,
            src,
            durationLabel: "—:—",
            uploadedAt: timeAgo(row.created_at),
            plays: (row as { plays_count?: number | null }).plays_count ?? 0,
            genre: row.genre,
          };
          return track;
        }),
      );
      if (!cancelled) setUploads(hydrated);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    const onTrackPlayed = (event: Event) => {
      const trackId = (event as CustomEvent<{ trackId?: string }>).detail?.trackId;
      if (trackId) setUploads((prev) => incrementTrackPlays(prev, trackId));
    };
    window.addEventListener("soundwave:track-played", onTrackPlayed);
    return () => window.removeEventListener("soundwave:track-played", onTrackPlayed);
  }, []);

  const addUpload = useCallback(
    async ({ title, genre, file, coverFile }: UploadArgs): Promise<Track> => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) {
        throw new Error("You need to be signed in to upload.");
      }
      const userId = userData.user.id;
      const stamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const audioPath = `${userId}/${stamp}-${safeName}`;

      const { error: audioErr } = await supabase.storage
        .from("audio")
        .upload(audioPath, file, { contentType: file.type || "audio/mpeg", upsert: false });
      if (audioErr) throw audioErr;

      let coverPath: string | null = null;
      if (coverFile) {
        const safeCover = coverFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        coverPath = `${userId}/${stamp}-${safeCover}`;
        const { error: coverErr } = await supabase.storage
          .from("covers")
          .upload(coverPath, coverFile, { contentType: coverFile.type, upsert: false });
        if (coverErr) throw coverErr;
      }

      const { data: row, error: dbErr } = await supabase
        .from("tracks")
        .insert({
          user_id: userId,
          title,
          genre,
          audio_url: audioPath,
          cover_art_url: coverPath,
        })
        .select()
        .single();
      if (dbErr) throw dbErr;

      const audioUrl = (await signOne("audio", audioPath)) ?? "";
      const coverUrl = coverPath ? await signOne("covers", coverPath) : null;

      const track: Track = {
        id: row.id,
        title,
        artist: CURRENT_USER.name,
        cover: coverUrl ?? cover2,
        src: audioUrl,
        durationLabel: "—:—",
        uploadedAt: "Just now",
        plays: 0,
        genre,
      };
      setUploads((prev) => [track, ...prev]);
      return track;
    },
    [],
  );

  const removeUpload = useCallback(
    async (id: string) => {
      const target = uploads.find((t) => t.id === id);
      const { data: row, error: fetchErr } = await supabase
        .from("tracks")
        .select("audio_url, cover_art_url, user_id")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      const audioPath = row ? storagePathFromValue("audio", row.audio_url) : null;
      const coverPath = row ? storagePathFromValue("covers", row.cover_art_url) : null;

      const { error: delErr } = await supabase.from("tracks").delete().eq("id", id);
      if (delErr) throw delErr;

      if (audioPath && !audioPath.startsWith("http")) {
        await supabase.storage.from("audio").remove([audioPath]);
      }
      if (coverPath && !coverPath.startsWith("http")) {
        await supabase.storage.from("covers").remove([coverPath]);
      }

      setUploads((prev) => prev.filter((t) => t.id !== id));
      void target;
    },
    [uploads],
  );

  const updateUpload = useCallback(
    async ({ id, title, genre, coverFile }: UpdateArgs) => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("You need to be signed in.");
      const userId = userData.user.id;

      const { data: row, error: fetchErr } = await supabase
        .from("tracks")
        .select("cover_art_url")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;

      let newCoverPath: string | null | undefined = undefined;
      if (coverFile) {
        const stamp = Date.now();
        const safe = coverFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${userId}/${stamp}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("covers")
          .upload(path, coverFile, { contentType: coverFile.type, upsert: false });
        if (upErr) throw upErr;
        newCoverPath = path;
      }

      const patch: { title: string; genre: string; cover_art_url?: string } = { title, genre };
      if (newCoverPath) patch.cover_art_url = newCoverPath;

      const { error: updErr } = await supabase.from("tracks").update(patch).eq("id", id);
      if (updErr) throw updErr;

      // Remove old cover file if replaced
      if (newCoverPath && row?.cover_art_url) {
        const oldPath = storagePathFromValue("covers", row.cover_art_url);
        if (oldPath && !oldPath.startsWith("http")) {
          await supabase.storage.from("covers").remove([oldPath]);
        }
      }

      const newCoverUrl = newCoverPath ? await getSignedUrl("covers", newCoverPath) : null;
      setUploads((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, title, genre, cover: newCoverUrl ?? t.cover }
            : t,
        ),
      );
    },
    [],
  );

  const value = useMemo(
    () => ({ uploads, addUpload, updateUpload, removeUpload }),
    [uploads, addUpload, updateUpload, removeUpload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUploads() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUploads must be used inside UploadsProvider");
  return v;
}
