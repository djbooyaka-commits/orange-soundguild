import { Star } from "lucide-react";

const DAY = 24 * 60 * 60 * 1000;

/** One small red star per day (max 7) a member has gone without a curator pass. */
export function NoPassStars({
  lastDeductionAt,
  joinedAt,
  periodDays = 7,
}: {
  lastDeductionAt: string | null;
  joinedAt: string | null;
  periodDays?: number;
}) {
  const now = Date.now();
  const starts = [now - 7 * DAY];
  if (lastDeductionAt) starts.push(new Date(lastDeductionAt).getTime() + periodDays * DAY);
  if (joinedAt) starts.push(new Date(joinedAt).getTime());
  const since = Math.max(...starts.filter((n) => isFinite(n)));
  const count = Math.min(7, Math.max(1, Math.ceil((now - since) / DAY)));
  return (
    <span
      className="inline-flex items-center"
      aria-label={`${count} day${count === 1 ? "" : "s"} without a pass`}
      title={`${count} day${count === 1 ? "" : "s"} without a pass`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <Star key={i} className="h-3 w-3 fill-current text-destructive" />
      ))}
    </span>
  );
}
