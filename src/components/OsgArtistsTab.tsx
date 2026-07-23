import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Music, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listMyCuratorInvitees } from "@/lib/api/curator-invites.functions";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";

type Artist = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  account_type: "artist" | "pioneer";
};

export function OsgArtistsTab() {
  const listInvitees = useServerFn(listMyCuratorInvitees);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [avatars, setAvatars] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const invitees = (await listInvitees()) ?? [];
      const acceptedIds = invitees
        .filter((i) => i.status === "accepted")
        .map((i) => i.user_id);

      if (acceptedIds.length === 0) {
        if (!cancelled) {
          setArtists([]);
          setAvatars([]);
          setLoading(false);
        }
        return;
      }

      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, account_type")
        .in("id", acceptedIds)
        .in("account_type", ["artist", "pioneer"])
        .order("username", { ascending: true });
      if (cancelled) return;
      const list = (data ?? []) as Artist[];
      setArtists(list);
      const signed = await signMany(
        list.map((r) => ({ bucket: "avatars" as const, path: r.avatar_url })),
      );
      if (!cancelled) {
        setAvatars(signed);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listInvitees]);

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <h2 className="font-semibold">OSG Artists</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Artist and Pioneer accounts from your tracked users. Add more from the Curator tab.
      </p>

      {loading ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : artists.length === 0 ? (
        <div className="mt-4 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No tracked artists yet. Share your invite link from the Curator tab to add artists here.
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {artists.map((a, i) => (
            <Link
              key={a.id}
              to="/u/$handle"
              params={{ handle: a.username ?? a.id }}
              className="flex items-center gap-3 rounded-lg border border-border p-3 transition hover:border-primary/50"
            >
              <img
                src={avatars[i] ?? defaultAvatar}
                alt=""
                className="h-12 w-12 shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">@{a.username ?? "user"}</p>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {a.account_type === "pioneer" ? (
                    <>
                      <Star className="h-3 w-3 text-primary" /> Pioneer
                    </>
                  ) : (
                    <>
                      <Music className="h-3 w-3" /> Artist
                    </>
                  )}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
