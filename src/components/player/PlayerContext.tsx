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
  shuffle: boolean;
  play: (t: Track, queue?: Track[]) => void;
  toggle: () => void;
  seek: (ratio: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  next: () => void;
  prev: () => void;
};

const Ctx = createContext<PlayerState | null>(null);

let _tabId: string | null = null;
const getTabId = () => {
  if (_tabId) return _tabId;
  _tabId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return _tabId;
};
// Cross-tab single-player coordination is intentionally disabled so that
// separate logins in different tabs/windows/profiles can play at the same time.

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentRef = useRef<Track | null>(null);
  const countedRef = useRef(false);
  const recordingRef = useRef(false);
  const queueRef = useRef<Track[]>([]);
  const shuffleRef = useRef(false);
  const playedRef = useRef<Set<string>>(new Set());
  const channelRef = useRef<BroadcastChannel | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);

  const announcePlaying = useCallback(() => {
    // no-op: cross-tab pausing disabled so multiple accounts can play concurrently
  }, []);

  const pickNext = useCallback((q: Track[], curId: string | undefined): Track | undefined => {
    if (!q.length) return undefined;
    if (shuffleRef.current) {
      if (q.length === 1) return undefined;
      const played = playedRef.current;
      const remaining = q.filter((t) => t.id !== curId && !played.has(t.id));
      if (!remaining.length) return undefined;
      return remaining[Math.floor(Math.random() * remaining.length)];
    }
    const idx = q.findIndex((x) => x.id === curId);
    return idx >= 0 ? q[idx + 1] : undefined;
  }, []);

  const pickPrev = useCallback((q: Track[], curId: string | undefined): Track | undefined => {
    if (!q.length) return undefined;
    if (shuffleRef.current) return pickNext(q, curId);
    const idx = q.findIndex((x) => x.id === curId);
    return idx > 0 ? q[idx - 1] : undefined;
  }, [pickNext]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = volume;
    // NOTE: no crossOrigin — Supabase signed URLs stream fine without it
    // iOS/mobile: inline playback + no autoplay hijacking
    audio.setAttribute("playsinline", "true");
    audio.setAttribute("webkit-playsinline", "true");
    audio.setAttribute("aria-hidden", "true");
    audio.style.display = "none";
    document.body.appendChild(audio);
    audioRef.current = audio;


    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const playedSeconds = () => {
      let total = 0;
      for (let i = 0; i < audio.played.length; i += 1) {
        total += audio.played.end(i) - audio.played.start(i);
      }
      return total;
    };
    const hasCompletedPlaythrough = () => {
      const mediaDuration = audio.duration;
      if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) return false;
      if (!audio.played.length) return false;
      const startedAtBeginning = audio.played.start(0) <= 1;
      const reachedEnd = audio.ended || audio.currentTime >= mediaDuration - 0.25;
      const listenedLongEnough = playedSeconds() >= mediaDuration * 0.99;
      return startedAtBeginning && reachedEnd && listenedLongEnough;
    };
    const recordIfComplete = async () => {
      const t = currentRef.current;
      if (!t || !UUID_RE.test(t.id) || countedRef.current || recordingRef.current) return;
      if (!hasCompletedPlaythrough()) return;
      recordingRef.current = true;
      const { error } = await supabase.rpc("record_track_play", { p_track_id: t.id });
      recordingRef.current = false;
      if (error) {
        console.error("Failed to record track play", error);
        return;
      }
      if (currentRef.current?.id !== t.id) return;
      countedRef.current = true;
      window.dispatchEvent(
        new CustomEvent("soundwave:track-played", { detail: { trackId: t.id } }),
      );
    };
    const onTimeWithCompletionCheck = () => {
      onTime();
      void recordIfComplete();
    };
    const onEnd = () => {
      setCurrentTime(audio.duration || audio.currentTime);
      setIsPlaying(false);
      void recordIfComplete();
      const q = queueRef.current;
      const cur = currentRef.current;
      if (cur) playedRef.current.add(cur.id);
      const nxt = pickNext(q, cur?.id);
      if (nxt) {
        audio.src = nxt.src;
        setCurrent(nxt);
        currentRef.current = nxt;
        setCurrentTime(0);
        countedRef.current = false;
        audio.play().catch(() => setIsPlaying(false));
      }
    };
    const onPlay = () => {
      setIsPlaying(true);
      announcePlaying();
    };
    const onPause = () => setIsPlaying(false);

    // Cross-tab coordination intentionally disabled: allow multiple accounts to
    // play music simultaneously in different tabs/windows.
    const channel: BroadcastChannel | null = null;

    audio.addEventListener("timeupdate", onTimeWithCompletionCheck);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeWithCompletionCheck);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      window.removeEventListener("storage", onStorage);
      if (channel) {
        channel.close();
        channelRef.current = null;
      }
      audio.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const play = useCallback(
    (t: Track, queue?: Track[]) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (queue && queue.length) {
        queueRef.current = queue;
        playedRef.current = new Set();
      } else if (!queueRef.current.some((x) => x.id === t.id)) {
        queueRef.current = [t];
        playedRef.current = new Set();
      }
      if (current?.id !== t.id) {
        audio.src = t.src;
        audio.load(); // iOS/mobile: prime the element inside the user gesture
        setCurrent(t);
        currentRef.current = t;
        setCurrentTime(0);
        countedRef.current = false;
      } else if (audio.ended) {
        audio.currentTime = 0;
        setCurrentTime(0);
        countedRef.current = false;
      }
      // Must be called synchronously in the user gesture for mobile browsers
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => setIsPlaying(false));
    },
    [current?.id],
  );

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) {
      if (audio.ended) {
        audio.currentTime = 0;
        setCurrentTime(0);
        countedRef.current = false;
      }
      const p = audio.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } else audio.pause();
  }, [current]);


  const seek = useCallback(
    (ratio: number) => {
      const audio = audioRef.current;
      if (!audio || !duration) return;
      audio.currentTime = Math.max(0, Math.min(1, ratio)) * duration;
    },
    [duration],
  );

  const setVolume = useCallback((v: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = v;
    setVolumeState(v);
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((s) => {
      shuffleRef.current = !s;
      if (!s) playedRef.current = new Set();
      return !s;
    });
  }, []);

  const jumpTo = useCallback((t: Track | undefined) => {
    if (!t) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.src = t.src;
    audio.load();
    setCurrent(t);
    currentRef.current = t;
    setCurrentTime(0);
    countedRef.current = false;
    const p = audio.play();
    if (p && typeof p.catch === "function") p.catch(() => setIsPlaying(false));

  }, []);

  const next = useCallback(() => {
    const cur = currentRef.current;
    if (cur) playedRef.current.add(cur.id);
    jumpTo(pickNext(queueRef.current, cur?.id));
  }, [jumpTo, pickNext]);

  const prev = useCallback(() => {
    jumpTo(pickPrev(queueRef.current, currentRef.current?.id));
  }, [jumpTo, pickPrev]);

  const value = useMemo<PlayerState>(
    () => ({
      current,
      isPlaying,
      currentTime,
      duration,
      progress: duration ? currentTime / duration : 0,
      volume,
      shuffle,
      play,
      toggle,
      seek,
      setVolume,
      toggleShuffle,
      next,
      prev,
    }),
    [current, isPlaying, currentTime, duration, volume, shuffle, play, toggle, seek, setVolume, toggleShuffle, next, prev],
  );

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
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${sec}`;
}
