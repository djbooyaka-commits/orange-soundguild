import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import QRCode from "qrcode";
import { Loader2, ShoppingCart, Ticket, ExternalLink, Copy, Sparkles, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getPaypalConfig, getPaymentConfig } from "@/lib/api/artist-payment.functions";
import {
  createTrackPaypalOrder,
  captureTrackPaypalOrder,
  verifyTrackSolanaPayment,
  claimTrackCode,
} from "@/lib/api/track-sales.functions";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@tanstack/react-router";

type Tab = "paypal" | "phantom" | "code";

export function BuyTrackDialog({
  trackId,
  priceCents,
  title,
  children,
  onOwned,
}: {
  trackId: string;
  priceCents: number;
  title: string;
  children: React.ReactNode;
  onOwned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("paypal");
  const { user } = useAuth();
  const navigate = useNavigate();

  const priceUsd = priceCents / 100;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" /> Buy "{title}"
          </DialogTitle>
          <DialogDescription>
            ${priceUsd.toFixed(2)} · one-time download (WAV if the artist provided it, otherwise MP3).
          </DialogDescription>
        </DialogHeader>

        {!user ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Sign in to buy or redeem a code.</p>
            <button
              onClick={() => navigate({ to: "/auth" })}
              className="h-10 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground"
            >
              Sign in
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1 text-xs font-semibold">
              {(["paypal", "phantom", "code"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`h-8 rounded-full transition ${
                    tab === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {t === "paypal" ? "PayPal" : t === "phantom" ? "Phantom" : "Code"}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {tab === "paypal" && (
                <PaypalBuy trackId={trackId} priceUsd={priceUsd} onOwned={() => { onOwned(); setOpen(false); }} />
              )}
              {tab === "phantom" && (
                <PhantomBuy trackId={trackId} priceUsd={priceUsd} onOwned={() => { onOwned(); setOpen(false); }} />
              )}
              {tab === "code" && (
                <CodeRedeem
                  onOwned={() => {
                    onOwned();
                    setOpen(false);
                  }}
                />
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PaypalBuy({
  trackId,
  priceUsd,
  onOwned,
}: {
  trackId: string;
  priceUsd: number;
  onOwned: () => void;
}) {
  const loadCfg = useServerFn(getPaypalConfig);
  const createOrder = useServerFn(createTrackPaypalOrder);
  const capture = useServerFn(captureTrackPaypalOrder);
  const [cfg, setCfg] = useState<{ clientId: string; mode: "sandbox" | "live" } | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadCfg()
      .then((c: { clientId: string; mode: "sandbox" | "live" }) => setCfg({ clientId: c.clientId, mode: c.mode }))
      .catch(() => setCfg({ clientId: "", mode: "sandbox" }));
  }, [loadCfg]);

  if (!cfg) return <div className="flex h-24 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (!cfg.clientId)
    return <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">PayPal is not configured.</div>;

  return (
    <div className="space-y-3">
      {cfg.mode === "sandbox" && (
        <p className="text-xs text-muted-foreground">Sandbox mode — no real money charged.</p>
      )}
      <PayPalScriptProvider options={{ clientId: cfg.clientId, currency: "USD", intent: "capture" }}>
        <PayPalButtons
          style={{ layout: "vertical", label: "pay", shape: "rect" }}
          disabled={status === "processing" || status === "success"}
          forceReRender={[trackId, priceUsd]}
          createOrder={async () => {
            setStatus("processing");
            setMessage(null);
            const { orderId } = await createOrder({ data: { trackId } });
            return orderId;
          }}
          onApprove={async (d) => {
            try {
              await capture({ data: { orderId: d.orderID, trackId } });
              setStatus("success");
              setMessage("Payment received. Your download is ready.");
              setTimeout(onOwned, 900);
            } catch (e) {
              setStatus("error");
              setMessage(e instanceof Error ? e.message : "Capture failed");
            }
          }}
          onCancel={() => setStatus("idle")}
          onError={(err) => {
            setStatus("error");
            setMessage(err instanceof Error ? err.message : "PayPal error");
          }}
        />
      </PayPalScriptProvider>
      {message && (
        <div
          className={`rounded-md border p-2 text-xs ${
            status === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400"
              : "border-destructive/40 bg-destructive/5 text-destructive"
          }`}
        >
          {message}
        </div>
      )}
    </div>
  );
}

function PhantomBuy({
  trackId,
  priceUsd,
  onOwned,
}: {
  trackId: string;
  priceUsd: number;
  onOwned: () => void;
}) {
  const loadCfg = useServerFn(getPaymentConfig);
  const verify = useServerFn(verifyTrackSolanaPayment);
  const [cfg, setCfg] = useState<Awaited<ReturnType<typeof getPaymentConfig>> | null>(null);
  const [token, setToken] = useState<"USDC" | "SOL">("SOL");
  const [qr, setQr] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadCfg().then(setCfg).catch(() => setCfg(null));
  }, [loadCfg]);

  const payUrl = useMemo(() => {
    if (!cfg) return null;
    const parts: string[] = [];
    if (token === "USDC") {
      parts.push(`amount=${priceUsd}`);
      parts.push(`spl-token=${cfg.usdcMint}`);
    } else if (cfg.solUsd) {
      parts.push(`amount=${(priceUsd / cfg.solUsd).toFixed(6)}`);
    } else return null;
    return `solana:${cfg.receiver}?${parts.join("&")}`;
  }, [cfg, token, priceUsd]);

  useEffect(() => {
    setQr(null);
    if (!payUrl) return;
    QRCode.toDataURL(payUrl, { width: 220, margin: 1 }).then(setQr).catch(() => {});
  }, [payUrl]);

  const submit = async () => {
    if (!signature.trim()) {
      toast.error("Paste transaction signature");
      return;
    }
    setBusy(true);
    try {
      await verify({ data: { signature: signature.trim(), token, trackId } });
      toast.success("Payment verified — download ready");
      onOwned();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const solAmount = cfg?.solUsd ? (priceUsd / cfg.solUsd).toFixed(6) : null;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1 text-xs font-semibold">
        {(["USDC", "SOL"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setToken(t)}
            className={`h-8 rounded-full transition ${
              token === t ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            Pay in {t}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-background/60 px-3 py-2 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">You'll pay</span>
          <span className="font-semibold">
            {token === "USDC" ? `${priceUsd} USDC` : solAmount ? `~${solAmount} SOL` : `~$${priceUsd}`}
          </span>
        </div>
      </div>
      {qr ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-white p-3">
          <img src={qr} alt="Scan with Phantom" className="h-48 w-48" />
          {cfg && (
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(cfg.receiver).catch(() => {});
                toast.success("Wallet copied");
              }}
              className="inline-flex items-center gap-1 text-[11px] text-slate-700 hover:underline"
            >
              {cfg.receiver.slice(0, 6)}…{cfg.receiver.slice(-6)} <Copy className="h-3 w-3" />
            </button>
          )}
          {payUrl && (
            <button
              type="button"
              onClick={() => {
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent || "");
                if (isMobile) window.location.href = payUrl;
                else {
                  navigator.clipboard?.writeText(payUrl).catch(() => {});
                  toast.info("Link copied — open Phantom on your phone.");
                }
              }}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
            >
              Open Phantom <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl border border-border bg-muted/40">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      <input
        value={signature}
        onChange={(e) => setSignature(e.target.value)}
        placeholder="Transaction signature"
        className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary"
      />
      <button
        onClick={submit}
        disabled={busy || !signature.trim()}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Confirm payment
      </button>
    </div>
  );
}

function CodeRedeem({ onOwned }: { onOwned: () => void }) {
  const claim = useServerFn(claimTrackCode);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    try {
      await claim({ data: { code: code.trim() } });
      toast.success("Code redeemed — download ready");
      onOwned();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Got a free-download code from the artist? Enter it below.
      </p>
      <div className="flex items-center gap-2">
        <Ticket className="h-4 w-4 text-primary" />
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ABCDE12345"
          className="h-10 flex-1 rounded-md border border-border bg-background px-3 font-mono text-sm uppercase outline-none focus:border-primary"
        />
      </div>
      <button
        type="submit"
        disabled={busy || !code.trim()}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Redeem code
      </button>
    </form>
  );
}
