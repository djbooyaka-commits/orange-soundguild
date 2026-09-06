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
import { getMyTrackPrivateFields } from "./api/track-sales.functions";
import { fetchCollaboratorsFor } from "./collaborators";

export const CURRENT_USER = {
  handle: "me",
  name: "You",
  bio: "Independent producer. Uploads weekly.",
};

type UploadArgs = {
  title: string;
  genre: string;
  file: File;
  coverFile?: File | null;
  album?: string | null;
  trackNumber?: number | null;
  collaboratorIds?: string[];
};
type AlbumTrackInput = { title: string; file: File };
type AlbumArgs = {
  album: string;
  genre: string;
  tracks: AlbumTrackInput[];
  coverFile?: File | null;
  collaboratorIds?: string[];
};
type UpdateArgs = {
  id: string;
  title: string;
  genre: string;
  coverFile?: File | null;
  priceCents?: number | null;
  losslessFile?: File | null;
};

type UploadsState = {
  uploads: Track[];
  addUpload: (data: UploadArgs) => Promise<Track>;
  addAlbum: (data: AlbumArgs) => Promise<Track[]>;
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

function collaboratorRows(trackId: string, collaboratorIds: string[] | undefined, userId: string) {
  return Array.from(new Set(collaboratorIds ?? []))
    .filter((uid) => uid && uid !== userId)
    .map((uid, idx) => ({ track_id: trackId, user_id: uid, position: idx }));
}

export function UploadsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<Track[]>([]);
  const [username, setUsername] = useState<string>(CURRENT_USER.name);

  // Fetch the signed-in user's real username so uploaded tracks are attributed
  // to it (matching what other views load via profiles.username). Without this
  // the tracks fall back to the "You" placeholder, and album links from the
  // own-profile page point at /album/You/<album> and 404.
  useEffect(() => {
    if (!user) {
      setUsername(CURRENT_USER.name);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled && data?.username) setUsername(data.username);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, username]);

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
        .select(
          "id, user_id, title, genre, audio_url, cover_art_url, created_at, plays_count, album, track_number, price_cents",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error || !data || cancelled) return;

      const collabs = await fetchCollaboratorsFor(data.map((r) => r.id));
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
          const rowExt = row as { plays_count?: number | null; album?: string | null; track_number?: number | null };
          const track: Track = {
            id: row.id,
            title: row.title,
            artist: username,
            cover,
            src,
            durationLabel: "—:—",
            uploadedAt: timeAgo(row.created_at),
            plays: rowExt.plays_count ?? 0,
            genre: row.genre,
            album: rowExt.album ?? null,
            trackNumber: rowExt.track_number ?? null,
            collaborators: collabs.get(row.id) ?? [],
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
    async ({ title, genre, file, coverFile, album, trackNumber, collaboratorIds }: UploadArgs): Promise<Track> => {
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

      const albumName = album && album.trim() ? album.trim() : null;
      const trackNum = albumName ? (trackNumber ?? null) : null;

      const { data: row, error: dbErr } = await supabase
        .from("tracks")
        .insert({
          user_id: userId,
          title,
          genre,
          audio_url: audioPath,
          cover_art_url: coverPath,
          album: albumName,
          track_number: trackNum,
        })
        .select("id")
        .single();
      if (dbErr) throw dbErr;

      // Insert collaborators (uploader is not a collaborator).
      const rows = collaboratorRows(row.id, collaboratorIds, userId);
      if (rows.length) {
        const { error: collabErr } = await supabase.from("track_collaborators").insert(rows);
        if (collabErr) throw collabErr;
      }

      const audioUrl = (await signOne("audio", audioPath)) ?? "";
      const coverUrl = coverPath ? await signOne("covers", coverPath) : null;

      const track: Track = {
        id: row.id,
        title,
        artist: username,
        cover: coverUrl ?? cover2,
        src: audioUrl,
        durationLabel: "—:—",
        uploadedAt: "Just now",
        plays: 0,
        genre,
        album: albumName,
        trackNumber: trackNum,
      };
      setUploads((prev) => [track, ...prev]);
      return track;
    },
    [username],
  );

  const addAlbum = useCallback(
    async ({ album, genre, tracks, coverFile, collaboratorIds }: AlbumArgs): Promise<Track[]> => {
      const name = album.trim();
      if (!name) throw new Error("Album name is required.");
      if (!tracks.length) throw new Error("Add at least one track.");

      // Upload the shared cover once and reuse the same path for every track.
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("You need to be signed in to upload.");
      const userId = userData.user.id;

      let sharedCoverPath: string | null = null;
      if (coverFile) {
        const stamp = Date.now();
        const safeCover = coverFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        sharedCoverPath = `${userId}/${stamp}-album-${safeCover}`;
        const { error: coverErr } = await supabase.storage
          .from("covers")
          .upload(sharedCoverPath, coverFile, { contentType: coverFile.type, upsert: false });
        if (coverErr) throw coverErr;
      }

      const sharedCoverUrl = sharedCoverPath ? await signOne("covers", sharedCoverPath) : null;
      const created: Track[] = [];

      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        const title = t.title.trim() || t.file.name.replace(/\.[^.]+$/, "");
        const stamp = Date.now() + i;
        const safeName = t.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const audioPath = `${userId}/${stamp}-${safeName}`;

        const { error: audioErr } = await supabase.storage
          .from("audio")
          .upload(audioPath, t.file, { contentType: t.file.type || "audio/mpeg", upsert: false });
        if (audioErr) throw audioErr;

        const { data: row, error: dbErr } = await supabase
          .from("tracks")
          .insert({
            user_id: userId,
            title,
            genre,
            audio_url: audioPath,
            cover_art_url: sharedCoverPath,
            album: name,
            track_number: i + 1,
          })
          .select("id")
          .single();
        if (dbErr) throw dbErr;

        const rows = collaboratorRows(row.id, collaboratorIds, userId);
        if (rows.length) {
          const { error: collabErr } = await supabase.from("track_collaborators").insert(rows);
          if (collabErr) throw collabErr;
        }

        const audioUrl = (await signOne("audio", audioPath)) ?? "";
        created.push({
          id: row.id,
          title,
          artist: username,
          cover: sharedCoverUrl ?? cover2,
          src: audioUrl,
          durationLabel: "—:—",
          uploadedAt: "Just now",
          plays: 0,
          genre,
          album: name,
          trackNumber: i + 1,
        });
      }

      setUploads((prev) => [...created, ...prev]);
      return created;
    },
    [username],
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
    async ({ id, title, genre, coverFile, priceCents, losslessFile }: UpdateArgs) => {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("You need to be signed in.");
      const userId = userData.user.id;

      const { data: row, error: fetchErr } = await supabase
        .from("tracks")
        .select("cover_art_url")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      let oldLosslessPath: string | null = null;
      if (losslessFile) {
        try {
          const info = await getMyTrackPrivateFields({ data: { trackId: id } });
          oldLosslessPath = info.losslessPath ?? null;
        } catch {
          oldLosslessPath = null;
        }
      }

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

      let newLosslessPath: string | null | undefined = undefined;
      if (losslessFile) {
        const stamp = Date.now();
        const safe = losslessFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${userId}/lossless-${stamp}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("audio")
          .upload(path, losslessFile, {
            contentType: losslessFile.type || "audio/wav",
            upsert: false,
          });
        if (upErr) throw upErr;
        newLosslessPath = path;
      }

      const patch: {
        title: string;
        genre: string;
        cover_art_url?: string;
        price_cents?: number | null;
        download_lossless_url?: string;
      } = { title, genre };
      if (newCoverPath) patch.cover_art_url = newCoverPath;
      if (priceCents !== undefined) patch.price_cents = priceCents;
      if (newLosslessPath) patch.download_lossless_url = newLosslessPath;

      const { error: updErr } = await supabase.from("tracks").update(patch).eq("id", id);
      if (updErr) throw updErr;

      if (newCoverPath && row?.cover_art_url) {
        const oldPath = storagePathFromValue("covers", row.cover_art_url);
        if (oldPath && !oldPath.startsWith("http")) {
          await supabase.storage.from("covers").remove([oldPath]);
        }
      }
      if (newLosslessPath && oldLosslessPath) {
        const oldPath = storagePathFromValue("audio", oldLosslessPath);
        if (oldPath && !oldPath.startsWith("http")) {
          await supabase.storage.from("audio").remove([oldPath]);
        }
      }

      const newCoverUrl = newCoverPath ? await signOne("covers", newCoverPath) : null;
      const nextCover = newCoverUrl ?? undefined;
      setUploads((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, title, genre, cover: nextCover ?? t.cover }
            : t,
        ),
      );
      window.dispatchEvent(
        new CustomEvent("soundwave:track-updated", {
          detail: { trackId: id, title, genre, cover: nextCover },
        }),
      );
    },
    [],
  );

  const value = useMemo(
    () => ({ uploads, addUpload, addAlbum, updateUpload, removeUpload }),
    [uploads, addUpload, addAlbum, updateUpload, removeUpload],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUploads() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUploads must be used inside UploadsProvider");
  return v;
}
