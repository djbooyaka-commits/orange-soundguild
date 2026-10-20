import { Link } from "@tanstack/react-router";
import type { PublicTrackDTO } from "@/lib/api/public-tracks.functions";

export function CrawlableTrackList({ tracks, ordered }: { tracks: PublicTrackDTO[]; ordered?: boolean }) {
  if (!tracks.length) return null;
  const List = ordered ? "ol" : "ul";
  return (
    <List className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {tracks.map((t, i) => (
        <li key={t.id} className="flex items-center gap-3 px-4 py-3 text-sm">
          {ordered && <span className="w-6 tabular-nums text-muted-foreground">{i + 1}</span>}
          <Link to="/t/$trackId" params={{ trackId: t.id }} className="font-medium hover:text-primary">
            {t.title}
          </Link>
          <span className="text-muted-foreground">by</span>
          <Link to="/u/$handle" params={{ handle: t.artist }} className="text-muted-foreground hover:text-primary">
            {t.artist}
          </Link>
          <span className="ml-auto text-xs text-muted-foreground">{t.genre}</span>
        </li>
      ))}
    </List>
  );
}
