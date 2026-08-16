import { Play, Pause, SkipBack, SkipForward, Volume2, Shuffle, Heart } from "lucide-react";
import { formatTime, usePlayer } from "./PlayerContext";
import { Waveform } from "./Waveform";
import { formatArtistLine } from "@/lib/tracks";
import { useTrackLike } from "@/lib/likes";
import { AddToPlaylistMenu } from "@/components/AddToPlaylistMenu";

function TrackActions({ trackId, title }: { trackId: string; title: string }) {
  const { liked, count, toggle } = useTrackLike(trackId);
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={toggle}
        aria-label={liked ? "Unlike track" : "Like track"}
        aria-pressed={liked}
        className={`flex h-9 items-center gap-1 rounded-full px-2 text-xs hover:bg-white/10 ${liked ? "text-primary" : "text-white/70 hover:text-white"}`}
      >
        <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} />
        <span className="tabular-nums">{count}</span>
      </button>
      <div className="relative">
        <AddToPlaylistMenu trackId={trackId} trackTitle={title} variant="player" />
      </div>
    </div>
  );
}

export function PlayerBar() {
  const { current, isPlaying, toggle, progress, currentTime, duration, seek, volume, setVolume, shuffle, toggleShuffle, next, prev } = usePlayer();

  const disabled = !current;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-secondary text-secondary-foreground">


      {/* Waveform across the top */}
      <div className="border-b border-white/5 px-4 py-2 sm:px-6">
        <Waveform
          seed={current?.id ?? "idle"}
          progress={progress}
          onSeek={current ? (r) => seek(r) : undefined}
          className={current ? "opacity-100" : "opacity-50"}
        />
      </div>

      <div className="mx-auto flex h-20 max-w-7xl items-center gap-4 px-4 sm:px-6">
        {/* Now playing */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-white/5">
            {current ? (
              <img src={current.cover} alt="" className="h-full w-full object-cover"  loading="lazy" decoding="async" />
            ) : null}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {current?.title ?? "Nothing playing"}
            </p>
            <p className="truncate text-xs text-white/60">
              {current ? formatArtistLine(current.artist, current.collaborators) : "Pick a track to start"}
            </p>
          </div>
          {current ? <TrackActions trackId={current.id} title={current.title} /> : null}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleShuffle}
            aria-label="Shuffle"
            aria-pressed={shuffle}
            className={`hidden h-9 w-9 items-center justify-center rounded-full hover:bg-white/10 md:flex ${shuffle ? "text-primary" : "text-white/60 hover:text-white"}`}
          >
            <Shuffle className="h-4 w-4" />
          </button>
          <button onClick={prev} disabled={disabled} className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-40" aria-label="Previous">
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={toggle}
            disabled={disabled}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-glow)] transition hover:brightness-110 disabled:opacity-50"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="ml-0.5 h-5 w-5" />}
          </button>
          <button onClick={next} disabled={disabled} className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 disabled:opacity-40" aria-label="Next">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Time + volume */}
        <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 sm:flex">
          <span className="font-mono text-xs tabular-nums text-white/70">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-white/60" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="h-1 w-24 cursor-pointer appearance-none rounded-full bg-white/15 accent-[var(--color-primary)]"
              aria-label="Volume"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
