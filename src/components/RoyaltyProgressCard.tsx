import { Award, Users, Sparkles, Heart, Check } from "lucide-react";
import { ROYALTY_THRESHOLDS, useRoyaltyProgress } from "@/hooks/useRoyaltyProgress";

export function RoyaltyProgressCard({ userId }: { userId: string | null | undefined }) {
  const { data } = useRoyaltyProgress(userId);
  const p = data ?? { followers: 0, artistReferrals: 0, superfanReferrals: 0, eligible: false };

  const rows = [
    { icon: Users, label: "Followers", value: p.followers, target: ROYALTY_THRESHOLDS.followers },
    { icon: Sparkles, label: "Artist referrals", value: p.artistReferrals, target: ROYALTY_THRESHOLDS.artistReferrals },
    { icon: Heart, label: "Superfan referrals", value: p.superfanReferrals, target: ROYALTY_THRESHOLDS.superfanReferrals },
  ];

  return (
    <div
      className={`rounded-3xl border p-6 ${
        p.eligible
          ? "border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-primary/5"
          : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            p.eligible ? "bg-emerald-500 text-white" : "bg-primary/10 text-primary"
          }`}
        >
          <Award className="h-5 w-5" />
        </div>
        <div>
          <div className="text-sm font-semibold">
            {p.eligible ? "Stream royalties unlocked" : "Unlock stream royalties"}
          </div>
          <div className="text-xs text-muted-foreground">
            {p.eligible
              ? "You've hit the threshold — you're royalty-eligible."
              : "Reach any one of these to unlock:"}
          </div>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {rows.map(({ icon: Icon, label, value, target }) => {
          const done = value >= target;
          const pct = Math.min(100, Math.round((value / target) * 100));
          return (
            <li key={label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 font-medium">
                  <Icon className="h-3.5 w-3.5" /> {label}
                  {done && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                </span>
                <span className={done ? "text-emerald-600 font-semibold" : "text-muted-foreground"}>
                  {value.toLocaleString()} / {target.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    done ? "bg-emerald-500" : "bg-primary"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
