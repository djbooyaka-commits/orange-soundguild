import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { listOsgDailyStreams, type OsgDailyStreams as Row } from "@/lib/api/osg-picks.functions";

export function OsgDailyStreams({ curatorId }: { curatorId: string }) {
  const fn = useServerFn(listOsgDailyStreams);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fn({ data: { curatorId } })
      .then((r) => alive && setRows(r as Row[]))
      .catch((e) => alive && setErr(e instanceof Error ? e.message : "Could not load"));
    return () => {
      alive = false;
    };
  }, [fn, curatorId]);

  if (err) return <p className="mt-4 text-sm text-destructive">{err}</p>;
  if (!rows)
    return (
      <div className="mt-4 flex justify-center p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (rows.length === 0)
    return (
      <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
        No streams counted in the last 7 days yet.
      </div>
    );

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {rows.map((d) => (
        <div key={d.user_id} className="rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium">@{d.username ?? "user"}</p>
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
              {d.total} pts this week
            </span>
          </div>
          <ul className="mt-2 space-y-1">
            {d.days.map((day) => (
              <li key={day.date} className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {new Date(`${day.date}T00:00:00`).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className="font-semibold text-foreground">{day.count} pts</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
