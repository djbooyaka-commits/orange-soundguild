import { useEffect, useState } from "react";
import { Pause, Play, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { resolveTracksByIds } from "@/lib/playlists";
import { formatArtistLine, type Track } from "@/lib/tracks";
import { usePlayer } from "@/components/player/PlayerContext";
import { Button } from "@/components/ui/button";

/** Streams an Orange Sound Guild playlist inside a stream room. Full plays earn points automatically. */
export function OsgRoomPlayer({ externalUrl }: { externalUrl: string | null }) {
  const osgId = (externalUrl ?? "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const { current, isPlaying, play, toggle } = usePlayer();

  useEffect(() => {
    if (!osgId) return;
    let off = false;
    (async () => {
      const { data } = await supabase
        .from("playlist_tracks")
        .select("track_id, position")
        .eq("playlist_id", osgId)
        .order("position", { ascending: true });
      const list = await resolveTracksByIds((data ?? []).map((d) => d.track_id));
      if (!off) setTracks(list);
    })();
    return () => {
      off = true;
    };
  }, [osgId]);

  if (!osgId) return null;
  const playingHere = !!current && !!tracks?.some((t) => t.id === current.id);

  return (
    <div className="rounded-xl border border-primary/30 bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Radio className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0">
            <h3 className="font-semibold">Stream on Orange Sound Guild</h3>
            <p className="text-xs text-muted-foreground">
              Every full play here earns points automatically — no Last.fm or Start tracking needed.
            </p>
          </div>
        </div>
        <Button
          size="sm"
          disabled={!tracks?.length}
          onClick={() => (playingHere ? toggle() : tracks?.[0] && play(tracks[0], tracks))}
        >
          {playingHere && isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playingHere && isPlaying ? "Pause" : "Play playlist"}
        </Button>
      </div>
      {tracks === null ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading tracks…</p>
      ) : tracks.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">This playlist has no tracks yet.</p>
      ) : (
        <ol className="mt-3 max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
          {tracks.map((t, i) => {
            const active = current?.id === t.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => (active ? toggle() : play(t, tracks))}
                  className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted ${active ? "bg-primary/10" : ""}`}
                >
                  <span className="w-5 shrink-0 text-xs text-muted-foreground">
                    {active && isPlaying ? <Pause className="h-3.5 w-3.5 text-primary" /> : i + 1}
                  </span>
                  {t.cover ? (
                    <img src={t.cover} alt="" className="h-9 w-9 shrink-0 rounded object-cover" loading="lazy" />
                  ) : (
                    <span className="h-9 w-9 shrink-0 rounded bg-muted" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium ${active ? "text-primary" : ""}`}>{t.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {formatArtistLine(t.artist, t.collaborators)}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
