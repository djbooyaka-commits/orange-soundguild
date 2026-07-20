import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { Play, Pause, ArrowLeft, Disc3, Shuffle, Pencil } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useAllTracks } from "@/lib/feed";
import { usePlayer } from "@/components/player/PlayerContext";
import { AddToPlaylistMenu } from "@/components/AddToPlaylistMenu";
import { EditTrackDialog } from "@/components/EditTrackDialog";
import { useUploads } from "@/lib/uploads";


export const Route = createFileRoute("/album/$handle/$album")({
  head: ({ params }) => {
    const albumName = decodeURIComponent(params.album);
    const handle = decodeURIComponent(params.handle);
    const title = `${albumName} — ${handle} · Orange Sound Guild`;
    return {
      meta: [
        { title },
        { name: "description", content: `Listen to ${albumName} by ${handle} on Orange Sound Guild.` },
        { property: "og:title", content: title },
        { property: "og:type", content: "music.album" },
      ],
    };
  },
  component: AlbumPage,
});

function fmtTotal(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m} min ${s} sec`;
}

function AlbumPage() {
  const { handle, album } = Route.useParams();
  const decodedHandle = decodeURIComponent(handle);
  const decodedAlbum = decodeURIComponent(album);
  const { tracks: all, loading } = useAllTracks();
  const { current, isPlaying, play, toggle, toggleShuffle, shuffle } = usePlayer();
  const navigate = useNavigate();

  const tracks = useMemo(() => {
    return all
      .filter(
        (t) =>
          t.artist === decodedHandle &&
          (t.album?.trim() ?? "") === decodedAlbum,
      )
      .sort((a, b) => {
        const an = a.trackNumber ?? 999;
        const bn = b.trackNumber ?? 999;
        if (an !== bn) return an - bn;
        return a.title.localeCompare(b.title);
      });
  }, [all, decodedHandle, decodedAlbum]);

  if (!loading && tracks.length === 0) {
    return (
      <div className="min-h-screen bg-background pb-40">
        <Navbar />
        <main className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
          <p className="text-sm text-muted-foreground">Album not found.</p>
          <Link to="/" className="mt-4 inline-block text-sm text-primary hover:underline">
            ← Back to feed
          </Link>
        </main>
      </div>
    );
  }

  const first = tracks[0];
  const activeInAlbum = tracks.find((t) => t.id === current?.id);
  const playing = !!activeInAlbum && isPlaying;
  const totalPlays = tracks.reduce((sum, t) => sum + t.plays, 0);

  const playAlbum = () => {
    if (activeInAlbum) toggle();
    else if (first) play(first, tracks);
  };

  return (
    <div className="min-h-screen bg-background pb-40">
      <Navbar />
      <main className="mx-auto max-w-5xl px-4 sm:px-6">
        <button
          onClick={() => navigate({ to: "/" })}
          className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        {/* Hero */}
        <section className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-end">
          <img
            src={first?.cover}
            alt={`${decodedAlbum} cover`}
            className="h-48 w-48 shrink-0 rounded-xl object-cover shadow-[var(--shadow-elegant)] sm:h-56 sm:w-56"
          />
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
              <Disc3 className="h-3 w-3" /> Album
            </span>
            <h1 className="mt-2 truncate text-4xl font-bold tracking-tight sm:text-6xl">
              {decodedAlbum}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <Link
                to="/u/$handle"
                params={{ handle: decodedHandle }}
                className="font-semibold text-foreground hover:text-primary"
              >
                {decodedHandle}
              </Link>
              <span>·</span>
              <span>{tracks.length} songs</span>
              <span>·</span>
              <span>{totalPlays.toLocaleString()} plays</span>
            </div>
          </div>
        </section>

        {/* Controls */}
        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={playAlbum}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-105"
          >
            {playing ? <Pause className="h-6 w-6" /> : <Play className="ml-0.5 h-6 w-6" />}
          </button>
          <button
            onClick={toggleShuffle}
            aria-pressed={shuffle}
            aria-label="Shuffle"
            className={`flex h-11 w-11 items-center justify-center rounded-full border border-border transition ${
              shuffle ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Shuffle className="h-5 w-5" />
          </button>
        </div>

        {/* Track list */}
        <section className="mt-8 rounded-xl border border-border bg-card">
          <div className="grid grid-cols-[40px_1fr_auto] items-center gap-4 border-b border-border px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:grid-cols-[40px_1fr_120px_60px]">
            <span className="text-right">#</span>
            <span>Title</span>
            <span className="hidden text-right sm:block">Plays</span>
            <span className="text-right">·</span>
          </div>
          <ul>
            {tracks.map((t, idx) => {
              const isCurrent = current?.id === t.id;
              const isThisPlaying = isCurrent && isPlaying;
              return (
                <li
                  key={t.id}
                  className={`group grid grid-cols-[40px_1fr_auto] items-center gap-4 px-4 py-3 transition hover:bg-secondary/40 sm:grid-cols-[40px_1fr_120px_60px] ${
                    isCurrent ? "text-primary" : ""
                  }`}
                >
                  <button
                    onClick={() => (isCurrent ? toggle() : play(t, tracks))}
                    aria-label={isThisPlaying ? "Pause" : "Play"}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-right tabular-nums text-sm text-muted-foreground hover:bg-primary/10 hover:text-primary"
                  >
                    <span className="group-hover:hidden">{t.trackNumber ?? idx + 1}</span>
                    <span className="hidden group-hover:inline">
                      {isThisPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </span>
                  </button>
                  <Link
                    to="/t/$trackId"
                    params={{ trackId: t.id }}
                    className="min-w-0"
                  >
                    <div className="truncate text-sm font-semibold">{t.title}</div>
                    <div className="truncate text-xs text-muted-foreground">{t.artist}</div>
                  </Link>
                  <div className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">
                    {t.plays.toLocaleString()}
                  </div>
                  <div className="flex justify-end">
                    <AddToPlaylistMenu trackId={t.id} trackTitle={t.title} variant="inline" />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </main>
    </div>
  );
}
