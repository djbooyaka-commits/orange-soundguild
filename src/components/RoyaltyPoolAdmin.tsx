import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, PiggyBank, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CuratorPoolCard } from "@/components/CuratorPoolCard";

type PoolSummary = {
  period_start: string;
  artist_subs: number;
  superfan_subs: number;
  artist_pool_cents: number;
  superfan_pool_cents: number;
  pool_cents: number;
  total_weighted_plays: number;
  eligible_artists: number;
  paid_out_cents: number;
};

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function monthValue(d: Date) {
  return d.toISOString().slice(0, 7);
}

export function RoyaltyPoolAdmin() {
  const [month, setMonth] = useState(() => monthValue(new Date()));
  const [row, setRow] = useState<PoolSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [unpaidAll, setUnpaidAll] = useState<{
    pool_cents: number;
    paid_cents: number;
    unpaid_cents: number;
  } | null>(null);

  async function load(m: string) {
    setLoading(true);
    const { data, error } = await supabase
      .rpc("admin_royalty_pool_summary", { p_period_start: `${m}-01` })
      .maybeSingle();
    setLoading(false);
    if (error) {
      toast.error(error.message);
      setRow(null);
      return;
    }
    setRow((data ?? null) as PoolSummary | null);
  }

  async function loadTotals() {
    const { data } = await (supabase as any).rpc("admin_royalty_unpaid_total").maybeSingle();
    setUnpaidAll((data ?? null) as typeof unpaidAll);
  }

  useEffect(() => {
    void load(month);
  }, [month]);

  useEffect(() => {
    void loadTotals();
  }, []);

  const pool = row?.pool_cents ?? 0;
  const paid = row?.paid_out_cents ?? 0;
  const remaining = Math.max(0, pool - paid);
  const perWeighted =
    row && row.total_weighted_plays > 0 ? pool / row.total_weighted_plays : 0;

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <PiggyBank className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Stream royalty pool</h2>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="month"
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-primary"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
          />
          <button
            type="button"
            onClick={() => {
              void load(month);
              void loadTotals();
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border hover:bg-muted"
            aria-label="Refresh pool"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Money owed to the monthly royalty pool: $5 per Artist subscription + $3 per Superfan
        subscription paid in the selected month.
      </p>

      <div className="mb-5 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Total still owed (all time)
        </div>
        <div className="mt-1 text-4xl font-bold tracking-tight text-primary">
          {fmtUsd(unpaidAll?.unpaid_cents ?? 0)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Set this money aside. All royalty pool money ever earned (
          {fmtUsd(unpaidAll?.pool_cents ?? 0)}) minus everything paid out so far (
          {fmtUsd(unpaidAll?.paid_cents ?? 0)}).
        </p>
      </div>



      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : !row ? (
        <p className="text-sm text-muted-foreground">No data for this month.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <div className="text-xs uppercase text-muted-foreground">Pool owed</div>
              <div className="mt-1 text-3xl font-bold tracking-tight">{fmtUsd(pool)}</div>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <div className="text-xs uppercase text-muted-foreground">Already paid out</div>
              <div className="mt-1 text-3xl font-bold tracking-tight">{fmtUsd(paid)}</div>
            </div>
            <div className="rounded-xl border border-border bg-background/60 p-4">
              <div className="text-xs uppercase text-muted-foreground">Still to distribute</div>
              <div className="mt-1 text-3xl font-bold tracking-tight text-emerald-600">
                {fmtUsd(remaining)}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-4 text-sm">
              <div className="font-medium">Where the pool comes from</div>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>
                  {row.artist_subs} artist sub{row.artist_subs === 1 ? "" : "s"} × $5 ={" "}
                  <span className="font-medium text-foreground">
                    {fmtUsd(row.artist_pool_cents)}
                  </span>
                </li>
                <li>
                  {row.superfan_subs} superfan sub{row.superfan_subs === 1 ? "" : "s"} × $3 ={" "}
                  <span className="font-medium text-foreground">
                    {fmtUsd(row.superfan_pool_cents)}
                  </span>
                </li>
              </ul>
            </div>
            <div className="rounded-xl border border-border p-4 text-sm">
              <div className="font-medium">How it splits</div>
              <ul className="mt-2 space-y-1 text-muted-foreground">
                <li>{row.eligible_artists} royalty-eligible artists with plays</li>
                <li>{row.total_weighted_plays.toLocaleString()} weighted plays</li>
                <li>
                  ≈ {perWeighted > 0 ? `$${(perWeighted / 100).toFixed(4)}` : "$0.0000"} per
                  weighted play
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
      <div className="mt-4">
        <CuratorPoolCard admin />
      </div>
    </section>
  );
}
