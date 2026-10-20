import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Download, Music2 } from "lucide-react";
import { toast } from "sonner";
import { Navbar } from "@/components/Navbar";
import { PlaylistsSection } from "@/components/PlaylistsSection";
import { useAuth } from "@/hooks/useAuth";
import {
  listMyOwnedTracks,
  getTrackDownloadUrl,
} from "@/lib/api/track-sales.functions";
import { signOne } from "@/lib/signMedia";
import cover2 from "@/assets/cover2.jpg";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Your Library — Orange Sound Guild" },
      { name: "description", content: "Your saved playlists and purchased tracks on Orange Sound Guild." },
      { property: "og:title", content: "Your Library — Orange Sound Guild" },
      { property: "og:description", content: "Your saved playlists and purchased tracks on Orange Sound Guild." },
      { property: "og:url", content: "https://orangesoundguild.com/library" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://orangesoundguild.com/library" }],
  }),
  component: LibraryPage,
});

type OwnedItem = {
  trackId: string;
  title: string;
  artist: string | null;
  coverPath: string | null;
  genre: string;
  hasLossless: boolean;
  method: string;
  purchasedAt: string;
  coverUrl?: string | null;
};

function LibraryPage() {
  const { user, loading } = useAuth();
  const loadOwned = useServerFn(listMyOwnedTracks);
  const getDownload = useServerFn(getTrackDownloadUrl);
  const [owned, setOwned] = useState<OwnedItem[]>([]);
  const [ownedLoading, setOwnedLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) { setOwned([]); return; }
    let cancel = false;
    setOwnedLoading(true);
    loadOwned()
      .then(async (r) => {
        const items = r.items;
        const hydrated = await Promise.all(
          items.map(async (it) => ({
            ...it,
            coverUrl: it.coverPath ? await signOne("covers", it.coverPath) : null,
          })),
        );
        if (!cancel) setOwned(hydrated);
      })
      .catch(() => {})
      .finally(() => { if (!cancel) setOwnedLoading(false); });
    return () => { cancel = true; };
  }, [user, loadOwned]);

  const download = async (trackId: string) => {
    setBusyId(trackId);
    try {
      const { url, filename } = await getDownload({ data: { trackId } });
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-40">
      <Navbar />
      <main className="mx-auto mt-8 max-w-7xl px-4 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Your Library</h1>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : !user ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Sign in to view your library and save playlists from other artists.
            </p>
            <Link
              to="/auth"
              className="mt-4 inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <>
            <section className="mb-10">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-bold tracking-tight">
                <Music2 className="h-4 w-4 text-primary" /> Owned tracks
              </h2>
              {ownedLoading ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  Loading owned tracks…
                </div>
              ) : owned.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
                  Tracks you buy or redeem with a code will appear here for download.
                </div>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {owned.map((it) => (
                    <li
                      key={`${it.trackId}-${it.purchasedAt}`}
                      className="flex items-center gap-3 rounded-xl border border-border bg-card p-3"
                    >
                      <img
                        src={it.coverUrl ?? cover2}
                        alt=""
                        className="h-14 w-14 flex-shrink-0 rounded-md object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <Link
                          to="/t/$trackId"
                          params={{ trackId: it.trackId }}
                          className="block truncate text-sm font-semibold hover:text-primary"
                        >
                          {it.title}
                        </Link>
                        <p className="truncate text-xs text-muted-foreground">
                          {it.artist ?? "Unknown"} · {it.hasLossless ? "WAV" : "MP3"}
                          {it.method === "code" ? " · free code" : ""}
                        </p>
                      </div>
                      <button
                        onClick={() => download(it.trackId)}
                        disabled={busyId === it.trackId}
                        className="inline-flex h-9 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {busyId === it.trackId ? "…" : "Download"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <h2 className="mb-4 text-lg font-bold tracking-tight">Playlists</h2>
            <PlaylistsSection userId={user.id} isOwner={true} />
          </>
        )}
      </main>
    </div>
  );
}
