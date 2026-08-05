import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import defaultAvatar from "@/assets/avatar.jpg";

type Follower = { id: string; username: string; avatar: string };

const SIGNED_TTL = 60 * 60 * 24;

async function resolveAvatar(value: string | null | undefined): Promise<string> {
  if (!value) return defaultAvatar;
  if (value.startsWith("http")) return value;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(value, SIGNED_TTL);
  return data?.signedUrl ?? defaultAvatar;
}

/** Sidebar box showing the artist's followers as a grid of small avatars. */
export function FollowersBox({ userId, max = 24 }: { userId: string | null; max?: number }) {
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!userId) {
      setFollowers([]);
      setTotal(0);
      return;
    }
    (async () => {
      const { data: rows, count } = await supabase
        .from("follows")
        .select("follower_id", { count: "exact" })
        .eq("following_id", userId)
        .order("created_at", { ascending: false })
        .limit(max);
      if (cancelled) return;
      const ids = (rows ?? []).map((r) => r.follower_id);
      setTotal(count ?? ids.length);
      if (!ids.length) {
        setFollowers([]);
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
      if (!cancelled) setFollowers(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, max]);

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold tracking-tight">Followers</h3>
        <span className="text-xs text-muted-foreground tabular-nums">{total}</span>
      </div>
      {followers.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">No followers yet.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {followers.map((f) => (
            <Link key={f.id} to="/u/$handle" params={{ handle: f.username }} title={f.username}>
              <img
                src={f.avatar}
                alt={f.username}
                loading="lazy"
                className="h-9 w-9 rounded-md object-cover ring-1 ring-border transition hover:ring-primary"
              />
            </Link>
          ))}
          {total > followers.length && (
            <span className="self-center text-[11px] text-muted-foreground">
              +{total - followers.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
