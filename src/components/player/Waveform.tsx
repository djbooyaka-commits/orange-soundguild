import { useMemo } from "react";

// Deterministic pseudo-random bar heights from a seed string.
function bars(seed: string, count: number): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    const base = (h % 1000) / 1000; // 0..1
    // Smooth profile — taller in middle, shorter at edges
    const envelope = 0.45 + 0.55 * Math.sin((i / count) * Math.PI);
    out.push(Math.max(0.18, base * envelope));
  }
  return out;
}

type Props = {
  seed: string;
  progress: number; // 0..1
  onSeek?: (ratio: number) => void;
  count?: number;
  className?: string;
};

export function Waveform({ seed, progress, onSeek, count = 96, className = "" }: Props) {
  const heights = useMemo(() => bars(seed || "soundwave", count), [seed, count]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    onSeek((e.clientX - rect.left) / rect.width);
  };

  return (
    <div
      onClick={handleClick}
      className={`relative flex h-10 w-full items-center gap-[2px] ${onSeek ? "cursor-pointer" : ""} ${className}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      {heights.map((h, i) => {
        const played = i / heights.length < progress;
        return (
          <span
            key={i}
            className={`flex-1 rounded-sm transition-colors ${played ? "bg-primary" : "bg-white/20"}`}
            style={{ height: `${Math.round(h * 100)}%` }}
          />
        );
      })}
    </div>
  );
}
