import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getBetaMemberPointTimeline } from "@/lib/api/beta-playlist-rooms.functions";
import { getSpotifyMemberPointTimeline } from "@/lib/api/curator-team.functions";

type Ev = { at: string; kind: "stream" | "submission" | "adjustment"; points: number; label: string; balance: number };

export function PointTimelineButton({ playlistId = "", userId, username, currentPoints, spotify }: { playlistId?: string; userId: string; username: string; currentPoints: number; spotify?: { mode: "osg" | "team"; curatorId?: string } }) {
  const fn = useServerFn(getBetaMemberPointTimeline);
  const spFn = useServerFn(getSpotifyMemberPointTimeline);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setOpen(true);
    setLoading(true);
    setErr(null);
    try {
      const r = spotify
        ? await spFn({ data: { mode: spotify.mode, userId, playlistId, curatorId: spotify.curatorId } })
        : await fn({ data: { playlistId, userId } });
      setEvents(r.events as Ev[]);
    } catch (e: any) {
      setErr(e?.message ?? "Could not load timeline");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={load}>
        <History className="mr-1 h-3 w-3" /> Point timeline
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Point timeline — @{username}</DialogTitle>
            <DialogDescription>Available now: <strong>{currentPoints} pts</strong>. Newest first.</DialogDescription>
          </DialogHeader>
          {loading && <Loader2 className="mx-auto h-5 w-5 animate-spin" />}
          {err && <p className="text-sm text-destructive">{err}</p>}
          {events && !loading && events.length === 0 && <p className="text-sm text-muted-foreground">No activity yet.</p>}
          {events && !loading && (
            <ul className="divide-y divide-border text-sm">
              {events.map((e, i) => (
                <li key={i} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <div>{e.kind === "stream" ? "🟢" : e.kind === "submission" ? "🔴" : "🟡"} {e.label}</div>
                    <div className="text-xs text-muted-foreground">{new Date(e.at).toLocaleString()}</div>
                  </div>
                  <div className="text-right">
                    <div className={e.points >= 0 ? "font-semibold text-primary" : "font-semibold text-destructive"}>
                      {e.points >= 0 ? "+" : ""}{e.points}
                    </div>
                    <div className="text-xs text-muted-foreground">bal {e.balance}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
