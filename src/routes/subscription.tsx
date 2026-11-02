import { createFileRoute, Link } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, CreditCard, Loader2, RefreshCw } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getMySubscription } from "@/lib/api/artist-payment.functions";
import { renewalExpiration, subscriptionDaysRemaining } from "@/lib/subscription";

const PaypalPayPanel = lazy(() => import("@/components/PaypalPayPanel"));
const PhantomPayPanel = lazy(() => import("@/components/PhantomPayPanel"));

export const Route = createFileRoute("/subscription")({
  head: () => ({ meta: [
    { title: "Subscription & renewal — Orange Sound Guild" },
    { name: "description", content: "View your Orange Sound Guild plan and expiration, and renew Artist or Superfan access with PayPal or Phantom." },
    { property: "og:title", content: "Subscription & renewal — Orange Sound Guild" },
    { property: "og:description", content: "Manage your Artist or Superfan subscription and renew without losing remaining days." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: SubscriptionPage,
});

function SubscriptionPage() {
  const { user, loading } = useAuth();
  const loadSubscription = useServerFn(getMySubscription);
  const query = useQuery({ queryKey: ["subscription", user?.id], queryFn: () => loadSubscription(), enabled: Boolean(user) });
  const [paymentMethod, setPaymentMethod] = useState<"paypal" | "phantom">("paypal");
  const subscription = query.data?.subscription;
  const tier = subscription?.tier === "superfan" ? "superfan" : "artist";
  const label = tier === "artist" ? "Artist" : "Superfan";
  const daysLeft = subscriptionDaysRemaining(subscription?.expires_at ?? null);
  const paidAccount = query.data?.accountType === "artist" || query.data?.accountType === "superfan";
  const canRenew = Boolean(subscription || paidAccount);
  const renewTier = subscription ? tier : query.data?.accountType === "superfan" ? "superfan" : "artist";
  const renewLabel = renewTier === "artist" ? "Artist" : "Superfan";
  const loadingView = <div role="status" className="flex items-center gap-2 py-8 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading subscription…</div>;
  return <div className="min-h-screen bg-background pb-32">
    <Navbar />
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8 flex items-center gap-3"><CreditCard className="h-7 w-7 text-primary" /><h1 className="text-3xl font-bold">Subscription</h1></div>
      {loading ? loadingView : !user ? <section className="space-y-4"><p className="text-muted-foreground">Sign in to view and renew your subscription.</p><Button asChild><Link to="/auth">Sign in</Link></Button></section>
        : query.isPending ? loadingView
        : query.isError ? <section role="alert" className="space-y-4"><p className="text-destructive">Could not load your subscription.</p><Button variant="outline" onClick={() => query.refetch()}><RefreshCw /> Try again</Button></section>
        : <>
          <section className="border-y border-border py-6">
            <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">{canRenew ? `${subscription ? label : renewLabel} plan` : query.data?.accountType === "pioneer" ? "Pioneer Artist" : "Free membership"}</h2>
              <span className={daysLeft > 0 ? "font-medium text-success" : "text-muted-foreground"}>{subscription ? daysLeft > 0 ? "Active" : "Expired" : "No paid subscription recorded"}</span></div>
            {subscription && <dl className="mt-6 grid gap-5 sm:grid-cols-2"><div><dt className="flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="h-4 w-4" /> Expiration date</dt><dd className="mt-1 font-semibold">{new Date(subscription.expires_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</dd></div><div><dt className="text-sm text-muted-foreground">Days remaining</dt><dd className="mt-1 font-semibold">{daysLeft} {daysLeft === 1 ? "day" : "days"}</dd></div></dl>}
          </section>
          {canRenew ? <section className="pt-8">
            <h2 className="text-xl font-semibold">Renew {renewLabel} — ${renewTier === "artist" ? 10 : 5}</h2>
            <p className="mt-2 text-sm text-muted-foreground">30 days per payment. No automatic renewal. Renewing early keeps your remaining days.</p>
            <p className="mt-2 text-sm">After renewal: <strong>{new Date(renewalExpiration(subscription?.expires_at ?? null)).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</strong></p>
            <div role="group" aria-label="Payment method" className="my-6 flex gap-2">
              <Button variant={paymentMethod === "paypal" ? "default" : "outline"} aria-pressed={paymentMethod === "paypal"} onClick={() => setPaymentMethod("paypal")}>PayPal</Button>
              <Button variant={paymentMethod === "phantom" ? "default" : "outline"} aria-pressed={paymentMethod === "phantom"} onClick={() => setPaymentMethod("phantom")}>Phantom</Button>
            </div>
            <div className="max-w-sm"><Suspense fallback={loadingView}>{paymentMethod === "paypal" ? <PaypalPayPanel tier={renewTier} onSuccess={() => { void query.refetch(); }} /> : <PhantomPayPanel tier={renewTier} renewal onSuccess={() => { void query.refetch(); }} />}</Suspense></div>
          </section> : <section className="space-y-4 pt-8"><p className="text-muted-foreground">Artist — $10 per 30 days · Superfan — $5 per 30 days</p><Button asChild><Link to="/upgrade">Choose a paid plan</Link></Button></section>}
        </>}
    </main>
  </div>;
}