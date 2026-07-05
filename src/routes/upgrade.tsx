import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Sparkles, Upload, BarChart3, Music2, Check, Wallet, Loader2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import { toast } from "sonner";
import {
  buildArtistPaymentTx,
  verifyArtistPayment,
} from "@/lib/api/artist-payment.functions";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  request: (args: {
    method: string;
    params: Record<string, unknown>;
  }) => Promise<{ signature: string; publicKey?: string }>;
};

function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    phantom?: { solana?: PhantomProvider };
    solana?: PhantomProvider;
  };
  const p = w.phantom?.solana ?? w.solana;
  return p?.isPhantom ? p : null;
}

export const Route = createFileRoute("/upgrade")({
  head: () => ({
    meta: [
      { title: "Become an Artist — soundwave" },
      {
        name: "description",
        content:
          "Upgrade to an Artist account for $10/month, paid with Phantom wallet in USDC or SOL.",
      },
      { property: "og:title", content: "Become an Artist — soundwave" },
      {
        property: "og:description",
        content: "Pay $10/mo with Phantom (USDC or SOL) to unlock artist tools.",
      },
    ],
  }),
  component: UpgradePage,
});

const BENEFITS = [
  { icon: Upload, title: "Unlimited uploads", desc: "Publish tracks, EPs, and albums to your artist page." },
  { icon: Music2, title: "Your artist page", desc: "A dedicated profile for fans to follow and discover your music." },
  { icon: BarChart3, title: "Listener insights", desc: "See plays, likes, and how your tracks perform over time." },
  { icon: Sparkles, title: "Full creator tools", desc: "Edit tracks, manage playlists, and pin your best work." },
];

function UpgradePage() {
  const { user } = useAuth();
  const { isArtist, loading: accLoading } = useAccountType();
  const navigate = useNavigate();
  const buildTx = useServerFn(buildArtistPaymentTx);
  const verify = useServerFn(verifyArtistPayment);

  const [token, setToken] = useState<"USDC" | "SOL">("USDC");
  const [wallet, setWallet] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "pay">(null);
  const [solPrice, setSolPrice] = useState<number | null>(null);

  useEffect(() => {
    const p = getPhantom();
    if (!p) return;
    p.connect({ onlyIfTrusted: true })
      .then((r) => setWallet(r.publicKey.toString()))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (token !== "SOL") return;
    fetch("https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd")
      .then((r) => r.json())
      .then((j) => setSolPrice(j?.solana?.usd ?? null))
      .catch(() => {});
  }, [token]);

  const connectWallet = async () => {
    const p = getPhantom();
    if (!p) {
      window.open("https://phantom.app/download", "_blank");
      toast.error("Phantom wallet not detected. Install it and reload.");
      return;
    }
    setBusy("connect");
    try {
      const r = await p.connect();
      setWallet(r.publicKey.toString());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setBusy(null);
    }
  };

  const pay = async () => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    const p = getPhantom();
    if (!p || !wallet) {
      toast.error("Connect Phantom wallet first");
      return;
    }
    setBusy("pay");
    try {
      const q = await buildTx({ data: { token, from: wallet } });
      const res = await p.request({
        method: "signAndSendTransaction",
        params: { message: q.messageBase58 },
      });
      const signature = res.signature;
      toast.info("Confirming payment on Solana…");
      const verified = await verify({ data: { signature, token: q.token } });
      toast.success(
        `You're an artist! Active until ${new Date(verified.expiresAt).toLocaleDateString()}.`,
      );
      navigate({ to: "/" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      toast.error(msg);
    } finally {
      setBusy(null);
    }
  };

  const priceLabel =
    token === "USDC"
      ? "10 USDC"
      : solPrice
        ? `~${(10 / solPrice).toFixed(4)} SOL`
        : "~$10 in SOL";

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <div className="text-center">
          <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Become an artist</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
            Share your sound with the world. Pay $10/month with your Phantom wallet to unlock
            uploads, your artist page, and every creator tool on soundwave.
          </p>
        </div>

        <div className="mt-12 rounded-3xl border border-border bg-card p-8 shadow-sm">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Artist plan
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-5xl font-bold">$10</span>
                <span className="text-lg text-muted-foreground">/month</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Paid on Solana mainnet. 30 days of artist access per payment.
              </p>
            </div>

            <div className="w-full max-w-sm space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-full bg-muted p-1">
                {(["USDC", "SOL"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setToken(t)}
                    className={`h-9 rounded-full text-sm font-semibold transition ${
                      token === t
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Pay in {t}
                  </button>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-background/60 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">You'll pay</span>
                  <span className="font-semibold">{priceLabel}</span>
                </div>
                {token === "SOL" && solPrice && (
                  <div className="mt-1 text-xs text-muted-foreground">
                    SOL price: ${solPrice.toFixed(2)} USD
                  </div>
                )}
              </div>

              {!wallet ? (
                <button
                  onClick={connectWallet}
                  disabled={busy !== null}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
                >
                  {busy === "connect" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Wallet className="h-4 w-4" />
                  )}
                  Connect Phantom
                </button>
              ) : (
                <button
                  onClick={pay}
                  disabled={busy !== null || isArtist || accLoading}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary px-8 text-base font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
                >
                  {busy === "pay" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isArtist ? "You're an artist" : `Pay ${priceLabel}`}
                </button>
              )}

              {wallet && (
                <div className="text-center text-xs text-muted-foreground">
                  Connected: {wallet.slice(0, 4)}…{wallet.slice(-4)}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {BENEFITS.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-4 rounded-2xl border border-border bg-card/60 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-semibold">{title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-border bg-muted/30 p-6">
          <h2 className="font-semibold">What's included</h2>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {[
              "Unlimited track uploads",
              "Public artist profile",
              "Track editing & artwork",
              "Playlist creation",
              "Listener stats",
              "Fan follows & comments",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs text-muted-foreground">
            Payments are on-chain (Solana mainnet). All sales are final — Solana transactions
            can't be reversed.{" "}
            <Link to="/" className="underline hover:text-foreground">
              Back to home
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
