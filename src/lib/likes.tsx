import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type LikeInfo = { count: number; liked: boolean };

type LikesState = {
  get: (trackId: string) => LikeInfo;
  ensure: (trackId: string) => void;
  toggle: (trackId: string) => Promise<void>;
};

const Ctx = createContext<LikesState | null>(null);

export function LikesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [map, setMap] = useState<Record<string, LikeInfo>>({});
  const requested = useRef<Set<string>>(new Set());

  const ensure = useCallback(
    (trackId: string) => {
      if (requested.current.has(trackId + ":" + (user?.id ?? "anon"))) return;
      requested.current.add(trackId + ":" + (user?.id ?? "anon"));
      (async () => {
        const { count } = await supabase
          .from("track_likes")
          .select("*", { count: "exact", head: true })
          .eq("track_id", trackId);
        let liked = false;
        if (user) {
          const { data } = await supabase
            .from("track_likes")
            .select("track_id")
            .eq("track_id", trackId)
            .eq("user_id", user.id)
            .maybeSingle();
          liked = !!data;
        }
        setMap((m) => ({ ...m, [trackId]: { count: count ?? 0, liked } }));
      })();
    },
    [user],
  );

  const get = useCallback(
    (trackId: string): LikeInfo => map[trackId] ?? { count: 0, liked: false },
    [map],
  );

  const toggle = useCallback(
    async (trackId: string) => {
      if (!user) {
        toast.error("Sign in to like tracks");
        return;
      }
      const cur = map[trackId] ?? { count: 0, liked: false };
      const next: LikeInfo = { liked: !cur.liked, count: cur.count + (cur.liked ? -1 : 1) };
      setMap((m) => ({ ...m, [trackId]: next }));
      if (cur.liked) {
        const { error } = await supabase
          .from("track_likes")
          .delete()
          .eq("track_id", trackId)
          .eq("user_id", user.id);
        if (error) {
          setMap((m) => ({ ...m, [trackId]: cur }));
          toast.error("Couldn't unlike");
        }
      } else {
        const { error } = await supabase
          .from("track_likes")
          .insert({ track_id: trackId, user_id: user.id });
        if (error) {
          setMap((m) => ({ ...m, [trackId]: cur }));
          toast.error("Couldn't like");
        }
      }
    },
    [map, user],
  );

  const value = useMemo(() => ({ get, ensure, toggle }), [get, ensure, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLikes() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useLikes must be used inside LikesProvider");
  return v;
}

export function useTrackLike(trackId: string) {
  const { get, ensure, toggle } = useLikes();
  useEffect(() => {
    ensure(trackId);
  }, [trackId, ensure]);
  const info = get(trackId);
  return { ...info, toggle: () => toggle(trackId) };
}
