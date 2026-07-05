import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";
import { PlaylistsSection } from "@/components/PlaylistsSection";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Your Library — soundwave" },
      { name: "description", content: "Your saved and created playlists on soundwave." },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const { user, loading } = useAuth();

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navbar />
      <main className="mx-auto mt-8 max-w-7xl px-4 sm:px-6">
        <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Your Library</h1>

        {loading ? (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : !user ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              Sign in to view your library and save playlists from other artists.
            </p>
            <Link
              to="/auth"
              className="mt-4 inline-flex h-10 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105"
            >
              Sign in
            </Link>
          </div>
        ) : (
          <>
            <h2 className="mb-4 text-lg font-bold tracking-tight">Playlists</h2>
            <PlaylistsSection userId={user.id} isOwner={true} />
          </>
        )}
      </main>
    </div>
  );
}
