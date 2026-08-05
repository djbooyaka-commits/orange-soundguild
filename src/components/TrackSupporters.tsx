import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import defaultAvatar from "@/assets/avatar.jpg";

type Supporter = { id: string; username: string; avatar: string };

const SIGNED_TTL = 60 * 60 * 24;

async function resolveAvatar(value: string | null | undefined): Promise<string> {
  if (!value) return defaultAvatar;
  if (value.startsWith("http")) return value;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(value, SIGNED_TTL);
  return data?.signedUrl ?? defaultAvatar;
}

/** Bandcamp-style "supported by" row of tiny supporter avatars (users who hearted the track). */
export function TrackSupporters({ trackId, max = 8 }: { trackId: string; max?: number }) {
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: likes, count } = await supabase
        .from("track_likes")
        .select("user_id", { count: "exact" })
        .eq("track_id", trackId)
        .order("created_at", { ascending: false })
        .limit(max);
      if (cancelled) return;
      const ids = (likes ?? []).map((l) => l.user_id);
      setTotal(count ?? ids.length);
      if (ids.length === 0) {
        setSupporters([]);
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, avatar_url")
        .in("id", ids);
      if (cancelled) return;
      const resolved = await Promise.all(
        (profiles ?? []).map(async (p) => ({
          id: p.id,
          username: p.username ?? "listener",
          avatar: await resolveAvatar(p.avatar_url),
        })),
      );
      if (!cancelled) setSupporters(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [trackId, max]);

  if (supporters.length === 0) return null;

  return (
    <div className="pt-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">supported by</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {supporters.map((s) => (
          <Link
            key={s.id}
            to="/u/$handle"
            params={{ handle: s.username }}
            onClick={(e) => e.stopPropagation()}
            title={s.username}
          >
            <img
              src={s.avatar}
              alt={s.username}
              loading="lazy"
              className="h-6 w-6 rounded-sm object-cover ring-1 ring-border transition hover:ring-primary"
            />
          </Link>
        ))}
        {total > supporters.length && (
          <span className="ml-0.5 text-[10px] text-muted-foreground">+{total - supporters.length}</span>
        )}
      </div>
    </div>
  );
}
