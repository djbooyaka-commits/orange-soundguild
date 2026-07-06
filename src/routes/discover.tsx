import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { UserPlus, Trophy, Star } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";

export const Route = createFileRoute("/discover")({
  head: () => ({
    meta: [
      { title: "Discover — Orange Sound Guild" },
      { name: "description", content: "New users, top artists, and top Pioneer artists on Orange Sound Guild." },
      { property: "og:title", content: "Discover — Orange Sound Guild" },
      { property: "og:description", content: "New users, top artists, and top Pioneer artists." },
    ],
  }),
  component: DiscoverPage,
});

type Profile = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  account_type: "fan" | "artist" | "superfan" | "pioneer";
  created_at?: string;
};

type ArtistWithPlays = Profile & { plays: number };

function DiscoverPage() {
  const [newUsers, setNewUsers] = useState<Profile[]>([]);
  const [newAvatars, setNewAvatars] = useState<(string | null)[]>([]);
  const [topArtists, setTopArtists] = useState<ArtistWithPlays[]>([]);
  const [topArtistAvatars, setTopArtistAvatars] = useState<(string | null)[]>([]);
  const [topPioneer, setTopPioneer] = useState<ArtistWithPlays | null>(null);
  const [topPioneerAvatar, setTopPioneerAvatar] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // New users
      const { data: newUsersData } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, account_type, created_at")
        .order("created_at", { ascending: false })
        .limit(24);

      // Tracks with plays, join artist profile
      const { data: trackRows } = await supabase
        .from("tracks")
        .select("user_id, plays_count, profiles!tracks_user_id_fkey(id, username, avatar_url, account_type)")
        .order("plays_count", { ascending: false })
        .limit(500);

      if (cancelled) return;

      const nu = (newUsersData ?? []) as Profile[];
      setNewUsers(nu);

      // Aggregate plays per artist
      const byArtist = new Map<string, ArtistWithPlays>();
      for (const t of (trackRows ?? []) as any[]) {
        const p = t.profiles;
        if (!p) continue;
        if (p.account_type !== "artist" && p.account_type !== "pioneer") continue;
        const existing = byArtist.get(p.id);
        if (existing) {
          existing.plays += t.plays_count ?? 0;
        } else {
          byArtist.set(p.id, {
            id: p.id,
            username: p.username,
            avatar_url: p.avatar_url,
            account_type: p.account_type,
            plays: t.plays_count ?? 0,
          });
        }
      }
      const allRanked = Array.from(byArtist.values()).sort((a, b) => b.plays - a.plays);
      const artists = allRanked.filter((a) => a.account_type === "artist").slice(0, 10);
      const pioneer = allRanked.find((a) => a.account_type === "pioneer") ?? null;

      setTopArtists(artists);
      setTopPioneer(pioneer);

      const [newSigned, artSigned, pioSigned] = await Promise.all([
        signMany(nu.map((r) => ({ bucket: "avatars" as const, path: r.avatar_url }))),
        signMany(artists.map((r) => ({ bucket: "avatars" as const, path: r.avatar_url }))),
        pioneer
          ? signMany([{ bucket: "avatars" as const, path: pioneer.avatar_url }])
          : Promise.resolve([null]),
      ]);
      if (cancelled) return;
      setNewAvatars(newSigned);
      setTopArtistAvatars(artSigned);
      setTopPioneerAvatar(pioSigned[0] ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-40">
      <Navbar />
      <main className="mx-auto max-w-7xl space-y-12 px-4 py-8 sm:px-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Discover</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Fresh faces, the artists everyone's playing, and the Pioneer topping the charts.
          </p>
        </header>

        {/* Top Pioneer artist */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Star className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Top Pioneer Artist</h2>
          </div>
          {loading ? (
            <div className="h-28 animate-pulse rounded-xl bg-muted" />
          ) : topPioneer ? (
            <Link
              to="/u/$handle"
              params={{ handle: topPioneer.username ?? topPioneer.id }}
              className="flex items-center gap-4 rounded-xl border border-primary/40 bg-gradient-to-r from-primary/10 to-transparent p-5 transition hover:border-primary"
            >
              <img
                src={topPioneerAvatar ?? defaultAvatar}
                alt=""
                className="h-20 w-20 shrink-0 rounded-full object-cover ring-2 ring-primary/60"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xl font-bold">@{topPioneer.username ?? "user"}</p>
                <p className="text-sm text-muted-foreground">
                  {topPioneer.plays.toLocaleString()} plays
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                <Star className="h-3 w-3" /> Pioneer
              </span>
            </Link>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No Pioneer artists with plays yet.
            </div>
          )}
        </section>

        {/* Top Artists */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Top Artists</h2>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : topArtists.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No artist plays yet.
            </div>
          ) : (
            <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {topArtists.map((a, i) => (
                <li key={a.id}>
                  <Link
                    to="/u/$handle"
                    params={{ handle: a.username ?? a.id }}
                    className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
                  >
                    <span className="w-6 shrink-0 text-center text-lg font-bold text-muted-foreground">
                      {i + 1}
                    </span>
                    <img
                      src={topArtistAvatars[i] ?? defaultAvatar}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-full object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">@{a.username ?? "user"}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.plays.toLocaleString()} plays
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* New Users */}
        <section>
          <div className="mb-4 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">New Users</h2>
          </div>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : newUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No users yet.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {newUsers.map((u, i) => (
                <Link
                  key={u.id}
                  to="/u/$handle"
                  params={{ handle: u.username ?? u.id }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center transition hover:border-primary/50"
                >
                  <img
                    src={newAvatars[i] ?? defaultAvatar}
                    alt=""
                    className="h-14 w-14 rounded-full object-cover"
                  />
                  <p className="w-full truncate text-sm font-semibold">
                    @{u.username ?? "user"}
                  </p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {u.account_type}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
