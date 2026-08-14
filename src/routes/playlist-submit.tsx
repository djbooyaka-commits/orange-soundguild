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

const OFFICIAL_PLAYLISTS: { label: string; url: string }[] = [
  { label: "Spotify — Pioneer OSG Artist Top 100", url: "https://open.spotify.com/playlist/7eqF5QBIif2l1vPhygo5D2" },
  {
    label: "Apple Music — Pioneer OSG Artist Top 100",
    url: "https://music.apple.com/ph/playlist/pioneer-osg-artist-top-100-artist/pl.u-b3b8aj7TKYEGe7b",
  },
  { label: "YouTube Music — Pioneer OSG Artist Top 100", url: "https://music.youtube.com/playlist?list=PLDuxOnqbSQ2U" },
  { label: "Tidal — Pioneer OSG Artist Top 100", url: "https://tidal.com/playlist/74192aba-7563-4520-83b9-33ca73b4527a" },
];

const PLAYLIST_BY_PLATFORM: Record<PlatformId, string> = {
  spotify: OFFICIAL_PLAYLISTS[0]!.url,
  apple_music: OFFICIAL_PLAYLISTS[1]!.url,
  youtube: OFFICIAL_PLAYLISTS[2]!.url,
  tidal: OFFICIAL_PLAYLISTS[3]!.url,
};




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
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [trackUrl, setTrackUrl] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [mine, setMine] = useState<MySubmission[]>([]);
  const [loadingMine, setLoadingMine] = useState(true);

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
    const url = playlistUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Enter a full playlist link starting with https://");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("playlist_submissions").insert({
      user_id: user.id,
      platform,
      playlist_url: url,
      track_url: trackUrl.trim() || null,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Sent to the Orange Sound Guild team");
    setPlaylistUrl("");
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
          Artists and Pioneer artists can send Spotify, Apple Music, YouTube and Tidal playlist links
          straight to the Orange Sound Guild team for review.
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

            <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
              Submitting to:{" "}
              <span className="font-medium text-foreground">
                {OFFICIAL_PLAYLISTS.find((p) => p.url === PLAYLIST_BY_PLATFORM[platform])?.label}
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
                      <ExternalLink className="h-3.5 w-3.5" /> {s.playlist_url}
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
