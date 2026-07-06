import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { signMany } from "@/lib/signMedia";
import defaultAvatar from "@/assets/avatar.jpg";

export const Route = createFileRoute("/superfans")({
  head: () => ({
    meta: [
      { title: "Superfans — Orange Sound Guild" },
      { name: "description", content: "Discover Superfans and see what they're listening to." },
      { property: "og:title", content: "Superfans on Orange Sound Guild" },
      { property: "og:description", content: "Discover Superfans and see what they're listening to." },
    ],
  }),
  component: SuperfansPage,
});

type Row = { id: string; username: string | null; bio: string | null; avatar_url: string | null };

function SuperfansPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [avatars, setAvatars] = useState<(string | null)[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, bio, avatar_url")
        .eq("account_type", "superfan")
        .order("username", { ascending: true })
        .limit(200);
      if (cancelled) return;
      const list = (data ?? []) as Row[];
      setRows(list);
      const signed = await signMany(list.map((r) => ({ bucket: "avatars" as const, path: r.avatar_url })));
      if (!cancelled) {
        setAvatars(signed);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-40">
      <Navbar />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Superfans</h1>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          Visit a Superfan to see their most played track, artist, and who they follow.
        </p>

        {loading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            No Superfans yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r, i) => (
              <Link
                key={r.id}
                to="/u/$handle"
                params={{ handle: r.username ?? r.id }}
                className="flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
              >
                <img
                  src={avatars[i] ?? defaultAvatar}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">@{r.username ?? "user"}</p>
                  {r.bio && (
                    <p className="truncate text-xs text-muted-foreground">{r.bio}</p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                  <Sparkles className="h-3 w-3" /> Superfan
                </span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
