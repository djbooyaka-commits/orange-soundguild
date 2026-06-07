import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Track } from "./tracks";
import cover2 from "@/assets/cover2.jpg";

export const CURRENT_USER = {
  handle: "me",
  name: "You",
  bio: "Independent producer. Uploads weekly.",
};

type UploadsState = {
  uploads: Track[];
  addUpload: (data: { title: string; genre: string; file: File }) => Track;
};

const Ctx = createContext<UploadsState | null>(null);

export function UploadsProvider({ children }: { children: ReactNode }) {
  const [uploads, setUploads] = useState<Track[]>([]);

  const addUpload = useCallback(({ title, genre, file }: { title: string; genre: string; file: File }) => {
    const src = URL.createObjectURL(file);
    const track: Track = {
      id: `u-${Date.now()}`,
      title,
      artist: CURRENT_USER.name,
      cover: cover2,
      src,
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
