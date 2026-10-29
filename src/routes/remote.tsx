import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Smartphone } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { PhoneRemote } from "@/components/PhoneRemote";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import { useIsAdmin } from "@/hooks/useIsAdmin";

export const Route = createFileRoute("/remote")({
  head: () => ({ meta: [
    { title: "Phone Remote — Orange Sound Guild" },
    { name: "description", content: "See and control your paired Android phone from Orange Sound Guild." },
    { property: "og:title", content: "Phone Remote — Orange Sound Guild" },
    { property: "og:description", content: "Control your Android phone from the web." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: RemotePage,
});

function RemotePage() {
  const { user, loading } = useAuth();
  const { accountType, loading: typeLoading } = useAccountType();
  const isAdmin = useIsAdmin();
  const allowed = isAdmin || accountType === "artist" || accountType === "superfan";
  return <div className="min-h-screen bg-background"><Navbar /><main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
    <header className="mb-8"><div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary"><Smartphone className="h-5 w-5" /> Orange Sound Guild</div><h1 className="text-3xl font-bold">Phone Remote</h1>
      <p className="mt-2 text-muted-foreground">Click the screen to tap, drag to swipe, hold to long-press.</p></header>
    {loading || (user && typeLoading) ? <Loader2 aria-label="Loading account" className="h-6 w-6 animate-spin text-muted-foreground" />
      : !user ? <section><h2 className="text-xl font-semibold">Sign in to control your phone</h2><Button asChild className="mt-5"><Link to="/auth">Sign in</Link></Button></section>
      : !allowed ? <section><h2 className="text-xl font-semibold">Phone Remote is for Artist and Superfan members</h2><p className="mt-2 text-muted-foreground">Upgrade your account to use Phone Remote.</p><Button asChild className="mt-5"><Link to="/upgrade">Upgrade</Link></Button></section>
      : <PhoneRemote userId={user.id} />}
  </main></div>;
}
