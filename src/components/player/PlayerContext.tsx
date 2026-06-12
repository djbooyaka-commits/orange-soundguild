import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Track } from "@/lib/tracks";
import { supabase } from "@/integrations/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PlayerState = {
  current: Track | null;
  isPlaying: boolean;
  progress: number; // 0..1
  duration: number;
  currentTime: number;
  volume: number;
  play: (t: Track) => void;
  toggle: () => void;
  seek: (ratio: number) => void;
  setVolume: (v: number) => void;
};

const Ctx = createContext<PlayerState | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentRef = useRef<Track | null>(null);
  const recordedRef = useRef<Set<string>>(new Set());
  const [current, setCurrent] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = volume;
    audioRef.current = audio;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnd = () => {
      setIsPlaying(false);
      const t = currentRef.current;
      if (!t || !UUID_RE.test(t.id)) return;
      // Only count once per track per session
      if (recordedRef.current.has(t.id)) return;
      // Require the track was played to completion
      if (audio.duration && audio.currentTime < audio.duration - 1.5) return;
      recordedRef.current.add(t.id);
      void supabase.rpc("record_track_play", { p_track_id: t.id });
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback((t: Track) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (current?.id !== t.id) {
      audio.src = t.src;
      setCurrent(t);
      currentRef.current = t;
      setCurrentTime(0);
    }
    audio.play().catch(() => setIsPlaying(false));
  }, [current?.id]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, [current]);

  const seek = useCallback((ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.max(0, Math.min(1, ratio)) * duration;
  }, [duration]);

  const setVolume = useCallback((v: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = v;
    setVolumeState(v);
  }, []);

  const value = useMemo<PlayerState>(() => ({
    current,
    isPlaying,
    currentTime,
    duration,
    progress: duration ? currentTime / duration : 0,
    volume,
    play,
    toggle,
    seek,
    setVolume,
  }), [current, isPlaying, currentTime, duration, volume, play, toggle, seek, setVolume]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayer() {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePlayer must be used inside PlayerProvider");
  return v;
}

export function formatTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}
