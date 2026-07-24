import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star, ArrowLeft, Send, Loader2, Info, CheckCircle2, X, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  listOsgPlaylistsForSubmission,
  listOsgArtistFollowLinks,
  saveOsgArtistFollowLink,
} from "@/lib/api/osg-picks.functions";
import {
  submitOsgCuratorTrack,
  listMyTrackSubmissions,
  followAllArtistsOnOsgPlaylist,
} from "@/lib/api/curator-submissions.functions";


export const Route = createFileRoute("/curator/osg-submit")({
  head: () => ({
    meta: [
      { title: "Submit / change a track — OSG Artists" },
      {
        name: "description",
        content:
          "Submit or change your Spotify track for a Curator's OSG Artists playlist on Orange Sound Guild.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Submit / change a track — OSG Artists" },
      {
        property: "og:description",
        content: "Submit a Spotify track to a Curator's OSG Artists playlist.",
      },
    ],
  }),
  component: OsgSubmitPage,
});

type Playlist = {
  id: string;
  curator_id: string;
  curator_username: string;
  spotify_playlist_id: string;
  name: string;
  image_url: string | null;
  available_points: number;
};

type Submission = {
  id: string;
  curator_playlist_id: string;
  playlist_name: string;
  spotify_track_url: string;
  spotify_track_name: string | null;
  cost_points: number;
  followed_all_artists: boolean;
  status: "pending" | "approved" | "rejected";
  curator_note: string | null;
  created_at: string;
};

type FollowLink = {
  curator_id: string;
  user_id: string;
  spotify_artist_id: string;
  spotify_artist_url: string;
  spotify_artist_name: string | null;
  updated_at: string;
};

function OsgSubmitPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const listPlaylists = useServerFn(listOsgPlaylistsForSubmission);
  const listFollowLinks = useServerFn(listOsgArtistFollowLinks);
  const saveFollowLinkFn = useServerFn(saveOsgArtistFollowLink);
  const listMine = useServerFn(listMyTrackSubmissions);
  const submitFn = useServerFn(submitOsgCuratorTrack);
  const followAllFn = useServerFn(followAllArtistsOnOsgPlaylist);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [mine, setMine] = useState<Submission[]>([]);
  const [followLinks, setFollowLinks] = useState<FollowLink[]>([]);
  const [playlistId, setPlaylistId] = useState<string>("");
  const [trackUrl, setTrackUrl] = useState("");
  const [artistUrl, setArtistUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [savingArtist, setSavingArtist] = useState(false);
  const [following, setFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<{
    playlistName: string;
    trackName: string | null;
  } | null>(null);


  const refresh = async () => {
    const [pl, m, links] = await Promise.all([listPlaylists(), listMine(), listFollowLinks()]);
    setPlaylists(pl as Playlist[]);
    setMine((m ?? []) as Submission[]);
    setFollowLinks((links ?? []) as FollowLink[]);
    if (pl.length > 0) {
      setPlaylistId((cur) => (cur && pl.some((p) => p.id === cur) ? cur : pl[0].id));
    } else {
      setPlaylistId("");
    }
  };

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    (async () => {
      try {
        await refresh();
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const osgSubmissions = mine.filter((s) => playlists.some((p) => p.id === s.curator_playlist_id));
  const selectedPlaylist = playlists.find((p) => p.id === playlistId) ?? null;
  const currentArtistLink = selectedPlaylist
    ? followLinks.find((l) => l.curator_id === selectedPlaylist.curator_id && l.user_id === user?.id)
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playlistId || !trackUrl.trim()) return;
    setBusy(true);
    try {
      const res = await submitFn({ data: { playlistId, trackUrl } });
      toast.success("Submitted");
      setReceipt({
        playlistName: res.playlistName,
        trackName: res.trackName,
      });
      setTrackUrl("");
      await refresh();
    } catch (ex: any) {
      toast.error(ex?.message ?? "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  const saveArtistLink = async () => {
    if (!selectedPlaylist || !artistUrl.trim()) return;
    setSavingArtist(true);
    try {
      const res = await saveFollowLinkFn({
        data: { curatorId: selectedPlaylist.curator_id, artistUrl },
      });
      toast.success(`Saved ${res.artistName ?? "Spotify artist"}`);
      setArtistUrl("");
      await refresh();
    } catch (ex: any) {
      toast.error(ex?.message ?? "Could not save artist link");
    } finally {
      setSavingArtist(false);
    }
  };

  const followAll = async () => {
    if (!playlistId) return;
    setFollowing(true);
    try {
      const res = await followAllFn({ data: { playlistId } });
      if (res.total === 0) {
        toast.info("No Spotify artist links have been added to this OSG list yet");
      } else if (res.source === "artist_links") {
        toast.success(`Following ${res.followed} artist${res.followed === 1 ? "" : "s"} from the saved OSG artist list`);
      } else if (res.source === "submitted_tracks") {
        toast.success(
          `Spotify blocked reading the playlist, so I followed ${res.followed} artist${res.followed === 1 ? "" : "s"} from the submitted tracks instead`,
          { duration: 9000 },
        );
      } else {
        toast.success(`Following ${res.followed} artist${res.followed === 1 ? "" : "s"} from this playlist`);
      }
    } catch (ex: any) {
      const msg = String(ex?.message ?? "");
      if (msg.includes("curator_reconnect_playlist_scope")) {
        toast.error("The curator needs to reconnect Spotify from the Stream Tracker tab so this private/collab playlist can be read.");
      } else if (msg.includes("missing_follow_scope")) {
        toast.error("Reconnect Spotify to grant follow + playlist permissions (Stream Tracker tab → Disconnect, then Connect).");
      } else if (msg.includes("playlist_fetch_failed_401")) {
        toast.error("Spotify connection expired. Reconnect Spotify from the Stream Tracker tab.");
      } else if (msg.includes("playlist_fetch_failed_403")) {
        toast.error(
          "Spotify returned 403 for this playlist. This usually means the curator's Spotify Developer app is in Development Mode — the app owner must open the Spotify Developer Dashboard → app → Users and Access, and add the curator's Spotify account (email) to the allowlist. Then have the curator disconnect & reconnect Spotify.",
          { duration: 12000 },
        );
      } else if (msg.includes("not_connected")) {
        toast.error("Connect Spotify first (Stream Tracker tab)");
      } else if (msg.includes("playlist_fetch_failed_404")) {
        toast.error("Spotify can't find this playlist. Check it still exists and is accessible.");
      } else {
        toast.error(msg || "Failed to follow artists");
      }
    } finally {
      setFollowing(false);
    }
  };




  if (authLoading || loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-muted-foreground">Loading…</main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4">
        <Link
          to="/curator"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Curator
        </Link>
      </div>

      <header className="mb-6 flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Star className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Submit / change a track</h1>
          <p className="text-sm text-muted-foreground">
            For a Curator's OSG Artists playlist. Only OSG playlists you're a member of are listed.
          </p>
        </div>
      </header>

      <div className="rounded-xl border border-border bg-card p-5">
        {receipt && (
          <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
              <div className="flex-1 text-sm">
                <div className="font-semibold text-emerald-500">Submission received</div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-muted-foreground">
                  {receipt.trackName && (
                    <>
                      <dt>Track</dt>
                      <dd className="text-foreground">{receipt.trackName}</dd>
                    </>
                  )}
                  <dt>Playlist</dt>
                  <dd className="text-foreground">{receipt.playlistName}</dd>
                </dl>
              </div>
              <button
                type="button"
                onClick={() => setReceipt(null)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="Dismiss receipt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {playlists.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No OSG Artists playlists are available for you to submit to yet. A Curator has to add
            you to their OSG Artists list and designate one of their playlists as their OSG
            playlist.
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-xs font-medium text-muted-foreground">
              OSG playlist
            </label>
            <select
              value={playlistId}
              onChange={(e) => setPlaylistId(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={busy}
            >
              {playlists.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — @{p.curator_username}
                </option>
              ))}
            </select>

            <label className="block text-xs font-medium text-muted-foreground">
              Spotify track URL
            </label>
            <input
              type="url"
              value={trackUrl}
              onChange={(e) => setTrackUrl(e.target.value)}
              placeholder="https://open.spotify.com/track/..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={busy}
            />

            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                Free to submit — no points required. You can submit or change your track anytime.
              </div>
            </div>

            <div className="rounded-md border border-border bg-muted/20 p-3">
              <div className="space-y-2">
                <label className="block text-xs font-medium text-muted-foreground">
                  Spotify artist link for the follow list
                </label>
                {currentArtistLink && (
                  <a
                    href={currentArtistLink.spotify_artist_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 truncate text-xs text-primary hover:underline"
                  >
                    Saved: {currentArtistLink.spotify_artist_name ?? currentArtistLink.spotify_artist_url}
                  </a>
                )}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="url"
                    value={artistUrl}
                    onChange={(e) => setArtistUrl(e.target.value)}
                    placeholder="https://open.spotify.com/artist/..."
                    className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                    disabled={savingArtist}
                  />
                  <button
                    type="button"
                    onClick={saveArtistLink}
                    disabled={savingArtist || !artistUrl.trim() || !selectedPlaylist}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                  >
                    {savingArtist ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                    Save artist link
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy || !trackUrl.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit / change track
              </button>
              <button
                type="button"
                onClick={followAll}
                disabled={following || !playlistId}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
                title="Follow every saved Spotify artist link on this OSG list"
              >
                {following ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                Follow all artists from the list
              </button>
            </div>

          </form>
        )}

        {osgSubmissions.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">My OSG submissions</h3>
            <ul className="mt-2 space-y-2">
              {osgSubmissions.slice(0, 10).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <a
                      href={s.spotify_track_url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate font-medium hover:underline"
                    >
                      {s.spotify_track_name ?? s.spotify_track_url}
                    </a>
                    <p className="text-xs text-muted-foreground">
                      {s.playlist_name} · {s.cost_points} pts
                      {s.followed_all_artists ? " · follow bonus" : ""}
                    </p>
                    {s.curator_note && (
                      <p className="mt-1 text-xs italic text-muted-foreground">
                        "{s.curator_note}"
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      s.status === "approved"
                        ? "bg-emerald-500/15 text-emerald-500"
                        : s.status === "rejected"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {s.status}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
