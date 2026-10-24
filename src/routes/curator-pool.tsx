import { createFileRoute, Link } from "@tanstack/react-router";
import { Coins, Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { CuratorPoolEarnings } from "@/components/CuratorPoolEarnings";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/curator-pool")({
  head: () => ({ meta: [
    { title: "Your Curator Pool earnings — Orange Sound Guild" },
    { name: "description", content: "View your Orange Sound Guild Curator Pool membership, estimated earnings, available balance and cashout requests." },
    { property: "og:title", content: "Your Curator Pool earnings — Orange Sound Guild" },
    { property: "og:description", content: "Curator Pool membership, earnings and cashouts on Orange Sound Guild." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  component: CuratorPoolPage,
  errorComponent: ({ reset }) => <main className="mx-auto max-w-4xl px-4 py-12"><h1 className="text-2xl font-bold">Curator Pool couldn't load</h1><Button onClick={reset} className="mt-4">Try again</Button></main>,
});

function CuratorPoolPage() {
  const { user, loading } = useAuth();
  return <div className="min-h-screen bg-background"><Navbar /><main className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
    <header className="mb-8"><div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary"><Coins className="h-5 w-5" /> Orange Sound Guild</div><h1 className="text-3xl font-bold">Curator Pool</h1></header>
    {loading ? <Loader2 aria-label="Loading account" className="h-6 w-6 animate-spin text-muted-foreground" /> : user ? <CuratorPoolEarnings userId={user.id} /> : <section><h2 className="text-xl font-semibold">Sign in to see your pool earnings</h2><Button asChild className="mt-5"><Link to="/auth">Sign in</Link></Button></section>}
  </main></div>;
}