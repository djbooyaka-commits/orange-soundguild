import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ListMusic, Pause, Play, Share2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveTracksByIds } from "@/lib/playlists";
import { signMany } from "@/lib/signMedia";
import { formatArtistLine, type Track } from "@/lib/tracks";
import { usePlayer } from "@/components/player/PlayerContext";

export const Route = createFileRoute("/playlist/$playlistId")({
  head: () => ({
    meta: [
      { title: "Playlist — Orange Sound Guild" },
      { name: "description", content: "Listen to this playlist on Orange Sound Guild." },
      { property: "og:title", content: "Playlist — Orange Sound Guild" },
      { property: "og:description", content: "Listen to this playlist on Orange Sound Guild." },
      { property: "og:type", content: "music.playlist" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlaylistPage,
});

type Info = { name: string; owner: string | null; cover: string | null; tracks: Track[] };

function PlaylistPage() {
  const { playlistId } = Route.useParams();
  const [info, setInfo] = useState<Info | null>(null);
  const [missing, setMissing] = useState(false);
  const { current, isPlaying, play, toggle } = usePlayer();

  useEffect(() => {
    let off = false;
    (async () => {
      const { data: pl } = await supabase
        .from("playlists")
        .select("id, name, user_id, cover_art_url")
        .eq("id", playlistId)
        .maybeSingle();
      if (!pl) {
        if (!off) setMissing(true);
        return;
      }
      const [{ data: prof }, { data: items }] = await Promise.all([
        supabase.from("profiles").select("username").eq("id", pl.user_id).maybeSingle(),
        supabase
          .from("playlist_tracks")
          .select("track_id, position")
          .eq("playlist_id", pl.id)
          .order("position", { ascending: true }),
      ]);
      const tracks = await resolveTracksByIds((items ?? []).map((i) => i.track_id));
      const [cover] = await signMany([{ bucket: "covers", path: pl.cover_art_url }]);
      if (!off)
        setInfo({
          name: pl.name,
          owner: (prof?.username as string | null) ?? null,
          cover: cover ?? tracks[0]?.cover ?? null,
          tracks,
        });
    })();
    return () => {
      off = true;
    };
  }, [playlistId]);

  const share = () => {
    const link = window.location.href;
    void navigator.clipboard.writeText(link).then(
      () => toast.success("Playlist link copied"),
      () => toast.error(link),
    );
  };

  if (missing)
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">Playlist not found.</div>;
  if (!info)
    return <div className="mx-auto max-w-3xl px-4 py-16 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-end gap-4">
        {info.cover ? (
          <img src={info.cover} alt="" className="h-32 w-32 rounded-xl object-cover" />
        ) : (
          <div className="flex h-32 w-32 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <ListMusic className="h-10 w-10" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Playlist</p>
          <h1 className="text-3xl font-bold">{info.name}</h1>
          <p className="text-sm text-muted-foreground">
            {info.owner ? (
              <Link to="/u/$handle" params={{ handle: info.owner }} className="hover:text-primary">
                {info.owner}
              </Link>
            ) : null}
            {" · "}
            {info.tracks.length} tracks
          </p>
          <div className="mt-3 flex gap-2">
            <button
              disabled={!info.tracks.length}
              onClick={() => info.tracks[0] && play(info.tracks[0], info.tracks)}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Play className="h-4 w-4" /> Play
            </button>
            <button
              onClick={share}
              className="inline-flex items-center gap-1 rounded-full border border-border px-4 py-2 text-sm font-semibold hover:border-primary hover:text-primary"
            >
              <Share2 className="h-4 w-4" /> Copy link
            </button>
          </div>
        </div>
      </div>
      <ul className="mt-6 divide-y divide-border rounded-xl border border-border">
        {info.tracks.length === 0 ? (
          <li className="px-4 py-3 text-sm text-muted-foreground">Empty playlist.</li>
        ) : (
          info.tracks.map((t, i) => {
            const active = current?.id === t.id;
            return (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2">
                <span className="w-5 text-xs text-muted-foreground">{i + 1}</span>
                <button
                  onClick={() => (active ? toggle() : play(t, info.tracks))}
                  aria-label={active && isPlaying ? "Pause" : "Play"}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-muted hover:bg-primary hover:text-primary-foreground"
                >
                  {active && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <img src={t.cover} alt="" className="h-10 w-10 rounded object-cover" />
                <div className="min-w-0 flex-1">
                  <Link to="/t/$trackId" params={{ trackId: t.id }} className="block truncate text-sm font-semibold hover:text-primary">
                    {t.title}
                  </Link>
                  <p className="truncate text-xs text-muted-foreground">{formatArtistLine(t)}</p>
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
