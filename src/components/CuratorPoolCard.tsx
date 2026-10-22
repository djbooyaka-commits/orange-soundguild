import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Row = {
  curator_id: string;
  username: string | null;
  placements: number;
  pool_cents: number;
  total_placements: number;
  share_cents: number;
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

/** 15% of this month's artist subscriptions, split by approved placements by Superfan curators. */
export function CuratorPoolCard({ admin = false }: { admin?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const month = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    void (supabase as any)
      .rpc("curator_pool_summary", { p_period_start: `${month}-01` })
      .then(({ data }: { data: Row[] | null }) => setRows(data ?? []));
  }, [month]);

  if (rows === null) return null;
  const mine = rows[0];

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <Coins className="h-5 w-5 text-primary" />
        <h2 className="font-semibold">Curator Pool · {month}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        15% of Artist subscriptions this month is shared between Superfan curators, based on
        tracks they approve and add to their playlist.
      </p>
      {admin ? (
        rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No paid placements yet this month.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm">
            <li className="font-medium">Pool: {usd(rows[0].pool_cents)} · {rows[0].total_placements} placements</li>
            {rows.map((r) => (
              <li key={r.curator_id} className="flex justify-between">
                <span>@{r.username ?? "unknown"} — {r.placements} placements</span>
                <span className="font-medium">{usd(r.share_cents)}</span>
              </li>
            ))}
          </ul>
        )
      ) : (
        <p className="mt-3 text-lg font-semibold">
          {mine
            ? `Estimated share: ${usd(mine.share_cents)} (${mine.placements} of ${mine.total_placements} placements)`
            : "No paid placements yet this month."}
        </p>
      )}
    </section>
  );
}
