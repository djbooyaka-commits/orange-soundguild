import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getBetaMemberPointTimeline } from "@/lib/api/beta-playlist-rooms.functions";
import { getSpotifyMemberPointTimeline } from "@/lib/api/curator-team.functions";
import type { MemberSubmission } from "@/lib/curator-member-stats";

type Ev = { at: string; kind: "stream" | "submission" | "adjustment"; points: number; label: string; balance: number };

export function PointTimelineButton({ playlistId = "", userId, username, currentPoints, spotify, submissionHistory }: { playlistId?: string; userId: string; username: string; currentPoints: number; spotify?: { mode: "osg" | "team"; curatorId?: string }; submissionHistory?: MemberSubmission[] }) {
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
    setEvents(null);
    try {
      const r = spotify
        ? await spFn({ data: { mode: spotify.mode, userId, playlistId, curatorId: spotify.curatorId } })
        : await fn({ data: { playlistId, userId } });
      if (submissionHistory) {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const merged = [
          ...(r.events as Ev[]).filter((e) => Date.parse(e.at) >= cutoff),
          ...submissionHistory.map((s) => ({ at: s.created_at, kind: "submission" as const, points: -Number(s.cost_points), label: "Track submitted", balance: 0 })),
        ].sort((a, b) => a.at.localeCompare(b.at));
        let balance = 0;
        setEvents(merged.map((e) => ({ ...e, balance: (balance += e.points) })).reverse());
      } else {
        setEvents(r.events as Ev[]);
      }
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
            <DialogDescription>Available now: <strong>{currentPoints} pts</strong>. {submissionHistory ? "Last 30 days. " : ""}Newest first.</DialogDescription>
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
