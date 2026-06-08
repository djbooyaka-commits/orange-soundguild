import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Track } from "./tracks";
import cover2 from "@/assets/cover2.jpg";
import { supabase } from "@/integrations/supabase/client";

export const CURRENT_USER = {
  handle: "me",
  name: "You",
  bio: "Independent producer. Uploads weekly.",
};

type UploadArgs = { title: string; genre: string; file: File; coverFile?: File | null };

type UploadsState = {
  uploads: Track[];
  addUpload: (data: UploadArgs) => Promise<Track>;
};

const Ctx = createContext<UploadsState | null>(null);

// 1 year — buckets are private, so we hand the player a long-lived signed URL.
const SIGNED_URL_TTL = 60 * 60 * 24 * 365;

async function getSignedUrl(bucket: string, path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
  if (error || !data) throw error ?? new Error("Failed to sign URL");
  return data.signedUrl;
}

export function UploadsProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<Track[]>([]);

  const addUpload = useCallback(async ({ title, genre, file, coverFile }: UploadArgs): Promise<Track> => {
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      throw new Error("You need to be signed in to upload.");
    }
    const userId = userData.user.id;
    const stamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const audioPath = `${userId}/${stamp}-${safeName}`;

    // 1) Upload audio
    const { error: audioErr } = await supabase.storage
      .from("audio")
      .upload(audioPath, file, { contentType: file.type || "audio/mpeg", upsert: false });
    if (audioErr) throw audioErr;

    // 2) Upload cover (optional)
    let coverPath: string | null = null;
    if (coverFile) {
      const safeCover = coverFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      coverPath = `${userId}/${stamp}-${safeCover}`;
      const { error: coverErr } = await supabase.storage
        .from("covers")
        .upload(coverPath, coverFile, { contentType: coverFile.type, upsert: false });
      if (coverErr) throw coverErr;
    }

    // 3) Sign URLs for playback / display
    const audioUrl = await getSignedUrl("audio", audioPath);
    const coverUrl = coverPath ? await getSignedUrl("covers", coverPath) : null;

    // 4) Insert into tracks table
    const { data: row, error: dbErr } = await supabase
      .from("tracks")
      .insert({
        user_id: userId,
        title,
        genre,
        audio_url: audioUrl,
        cover_art_url: coverUrl,
      })
      .select()
      .single();
    if (dbErr) throw dbErr;

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
  }, []);

  const value = useMemo(() => ({ uploads, addUpload }), [uploads, addUpload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUploads() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUploads must be used inside UploadsProvider");
  return v;
}
