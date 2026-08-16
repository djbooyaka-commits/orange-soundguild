import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ListMusic, ExternalLink } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";

export const Route = createFileRoute("/playlist-submit")({
  head: () => ({
    meta: [
      { title: "Playlist Submissions — Orange Sound Guild" },
      {
        name: "description",
        content:
          "Artists and Pioneer artists submit Spotify, Apple Music, YouTube and Tidal playlist links for Orange Sound Guild review.",
      },
      { property: "og:title", content: "Playlist Submissions — Orange Sound Guild" },
      {
        property: "og:description",
        content: "Send your Spotify, Apple Music, YouTube or Tidal playlist link to the Orange Sound Guild team.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlaylistSubmitPage,
  errorComponent: ({ error }) => <div role="alert" className="p-6">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

const PLATFORMS = [
  { id: "spotify", label: "Spotify" },
  { id: "apple_music", label: "Apple Music" },
  { id: "youtube", label: "YouTube" },
  { id: "tidal", label: "Tidal" },
] as const;

type PlatformId = (typeof PLATFORMS)[number]["id"];

// All Spotify playlists available for submission (Top 100 + genre playlists)
const SPOTIFY_PLAYLISTS: { label: string; url: string }[] = [
  { label: "Spotify — Pioneer OSG Artist Top 100", url: "https://open.spotify.com/playlist/7eqF5QBIif2l1vPhygo5D2" },
  { label: "Spotify — Electronic OSG", url: "https://open.spotify.com/playlist/2YyW7Is4IYcDHDLj9pgD6r" },
  { label: "Spotify — House OSG", url: "https://open.spotify.com/playlist/5YlvupSOizFaf3jSaBnao2" },
  { label: "Spotify — Tech House OSG", url: "https://open.spotify.com/playlist/0ONyF4oaDRCXbxmFfLHvwH" },
  { label: "Spotify — Drum and Bass OSG", url: "https://open.spotify.com/playlist/2pg7mGn6IL4mADLuEIL0Wn" },
  { label: "Spotify — Afro House OSG", url: "https://open.spotify.com/playlist/4xGLfF8xfgwWACQ3cKFMTh" },
  { label: "Spotify — Afrobeats OSG", url: "https://open.spotify.com/playlist/1zSf4QGvsZ1m3L5U6YfNsf" },
  { label: "Spotify — Hip-Hop OSG", url: "https://open.spotify.com/playlist/51xKogbXRFuNpK92lKSDNx" },
  { label: "Spotify — Lo-fi OSG", url: "https://open.spotify.com/playlist/5ahIniapvTvsoHVjDIg33w" },
  { label: "Spotify — Indie OSG", url: "https://open.spotify.com/playlist/230BlC0Ifpvr5XokfaIZgH" },
  { label: "Spotify — Ambient OSG", url: "https://open.spotify.com/playlist/5Vfv2vXvuaBl9lYhdY6Tga" },
  { label: "Spotify — Jazz OSG", url: "https://open.spotify.com/playlist/3anGG0pJCA7O33i6fQuCka" },
  { label: "Spotify — Techno OSG", url: "https://open.spotify.com/playlist/2lpPDZcwgwErZvasX61Om6" },
  { label: "Spotify — Psytrance OSG", url: "https://open.spotify.com/playlist/2cbeHywboh5bVyDV29mf0k" },
  { label: "Spotify — POP OSG", url: "https://open.spotify.com/playlist/0dGqgXJyGCSVp8E8eTxASv" },
  { label: "Spotify — Rock OSG", url: "https://open.spotify.com/playlist/47nZXoBHtvvYXtuZ5iUGXc" },
  { label: "Spotify — R&B OSG", url: "https://open.spotify.com/playlist/1tICZK79ENqcmSrGrrYDaC" },
];

const APPLE_PLAYLIST = { label: "Apple Music — Pioneer OSG Artist Top 100", url: "https://music.apple.com/ph/playlist/pioneer-osg-artist-top-100-artist/pl.u-b3b8aj7TKYEGe7b" };
const YOUTUBE_PLAYLIST = { label: "YouTube Music — Pioneer OSG Artist Top 100", url: "https://music.youtube.com/playlist?list=PLDuxOnqbSQ2U" };
const TIDAL_PLAYLIST = { label: "Tidal — Pioneer OSG Artist Top 100", url: "https://tidal.com/playlist/74192aba-7563-4520-83b9-33ca73b4527a" };

// Playlists shown in the follow/save section
const OFFICIAL_PLAYLISTS: { label: string; url: string }[] = [
  ...SPOTIFY_PLAYLISTS,
  APPLE_PLAYLIST,
  YOUTUBE_PLAYLIST,
  TIDAL_PLAYLIST,
];

// Default playlist url per platform
const DEFAULT_PLAYLIST_BY_PLATFORM: Record<PlatformId, string> = {
  spotify: SPOTIFY_PLAYLISTS[0]!.url,
  apple_music: APPLE_PLAYLIST.url,
  youtube: YOUTUBE_PLAYLIST.url,
  tidal: TIDAL_PLAYLIST.url,
};

function labelForPlaylistUrl(url: string): string {
  const found = OFFICIAL_PLAYLISTS.find((p) => p.url === url);
  return found ? found.label : url;
}

type MySubmission = {
  id: string;
  platform: string;
  playlist_url: string;
  track_url: string | null;
  status: string;
  admin_note: string | null;
  created_at: string;
};

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

function PlaylistSubmitPage() {
  const { user, loading: authLoading } = useAuth();
  const { accountType, loading: typeLoading } = useAccountType();
  const canSubmit = accountType === "artist" || accountType === "pioneer";

  const [platform, setPlatform] = useState<PlatformId>("spotify");
  const [spotifyPlaylistUrl, setSpotifyPlaylistUrl] = useState<string>(SPOTIFY_PLAYLISTS[0]!.url);
  const [trackUrl, setTrackUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState<MySubmission[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);

  // The playlist url that will be submitted for the current platform
  const activePlaylistUrl =
    platform === "spotify" ? spotifyPlaylistUrl : DEFAULT_PLAYLIST_BY_PLATFORM[platform];

  const loadMine = useCallback(async () => {
    if (!user) return;
    setLoadingMine(true);
    const { data } = await supabase
      .from("playlist_submissions")
      .select("id, platform, playlist_url, track_url, status, admin_note, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setMine((data ?? []) as MySubmission[]);
    setLoadingMine(false);
  }, [user]);

  useEffect(() => {
    void loadMine();
  }, [loadMine]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const track = trackUrl.trim();
    if (!/^https?:\/\//i.test(track)) {
      toast.error("Enter a full track link starting with https://");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("playlist_submissions").insert({
      user_id: user.id,
      platform,
      playlist_url: activePlaylistUrl,
      track_url: track,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sent to the Orange Sound Guild team");
    setTrackUrl("");
    setNote("");
    void loadMine();
  }

  if (authLoading || typeLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-10 pb-40 sm:px-6">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <ListMusic className="h-7 w-7 text-primary" /> Playlist submissions
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Artists and Pioneer Artists can send Spotify, Apple Music, YouTube, and Tidal links
          straight to the Orange Sound Guild team for review to be added to a free playlist.
        </p>

        <div className="mt-4 rounded-2xl border border-border bg-card/50 p-4 text-sm">
          <p className="font-semibold">Submission rules</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Only music uploaded to Orange Sound Guild will be added.</li>
            <li>3 submissions every 15 days for Artists.</li>
            <li>1 submission every 15 days for Pioneer Artists.</li>
          </ul>
        </div>

        <section className="mt-6 rounded-2xl border border-border bg-card/50 p-4">
          <h2 className="text-base font-semibold">Official Orange Sound Guild playlists</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Follow, save or like these on your platform of choice.
          </p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {OFFICIAL_PLAYLISTS.map((p) => (
              <li key={p.label}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium transition hover:border-primary hover:text-primary"
                >
                  <span>{p.label}</span>
                  <ExternalLink className="h-4 w-4 flex-shrink-0" />
                </a>
              </li>
            ))}
          </ul>
        </section>

        {!user ? (
          <div className="mt-8 rounded-2xl border border-border bg-card/50 p-6 text-center">
            <p className="text-muted-foreground">Sign in to submit a playlist.</p>
            <Link
              to="/auth"
              className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
            >
              Sign in
            </Link>
          </div>
        ) : !canSubmit ? (
          <div className="mt-8 rounded-2xl border border-border bg-card/50 p-6 text-center">
            <p className="text-muted-foreground">
              Playlist submissions are open to Artist and Pioneer Artist accounts.
            </p>
            <Link
              to="/upgrade"
              className="mt-4 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
            >
              Upgrade to Artist
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4 rounded-2xl border border-border bg-card/50 p-5">
            <div>
              <label className="mb-1 block text-sm font-medium">Platform</label>
              <div className="flex flex-wrap gap-2">
                {PLATFORMS.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => setPlatform(p.id)}
                    className={
                      "rounded-full px-4 py-2 text-sm font-semibold transition " +
                      (platform === p.id
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground hover:bg-muted")
                    }
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {platform === "spotify" && (
              <div>
                <label className="mb-1 block text-sm font-medium">Spotify playlist</label>
                <select
                  className={inputCls}
                  value={spotifyPlaylistUrl}
                  onChange={(e) => setSpotifyPlaylistUrl(e.target.value)}
                >
                  {SPOTIFY_PLAYLISTS.map((p) => (
                    <option key={p.url} value={p.url}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              Submitting to:{" "}
              <span className="font-medium text-foreground">
                {labelForPlaylistUrl(activePlaylistUrl)}
              </span>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Your track link</label>
              <input
                required
                className={inputCls}
                placeholder="Link to the track you'd like placed"
                value={trackUrl}
                onChange={(e) => setTrackUrl(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">Note (optional)</label>
              <textarea
                rows={3}
                className={inputCls}
                placeholder="Anything the team should know"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Send to admin
            </button>
          </form>
        )}

        {user && (
          <section className="mt-8 rounded-2xl border border-border bg-card/50 p-5">
            <h2 className="text-lg font-semibold">Your submissions</h2>
            {loadingMine ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : mine.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nothing submitted yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {mine.map((s) => (
                  <li key={s.id} className="rounded-xl border border-border bg-background/60 p-4 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold">
                        {PLATFORMS.find((p) => p.id === s.platform)?.label ?? s.platform}
                      </span>
                      <span
                        className={
                          "ml-auto rounded-full px-2 py-0.5 text-xs font-semibold capitalize " +
                          (s.status === "pending"
                            ? "bg-muted text-muted-foreground"
                            : s.status === "approved"
                              ? "bg-primary/15 text-primary"
                              : "bg-destructive/15 text-destructive")
                        }
                      >
                        {s.status}
                      </span>
                    </div>
                    <a
                      href={s.playlist_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 break-all text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> {labelForPlaylistUrl(s.playlist_url)}
                    </a>
                    {s.admin_note && (
                      <p className="mt-1 text-xs text-muted-foreground">Team note: {s.admin_note}</p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
