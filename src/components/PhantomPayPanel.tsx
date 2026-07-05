import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import QRCode from "qrcode";
import { Sparkles, Loader2, ExternalLink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import { useNavigate } from "@tanstack/react-router";
import {
  getPaymentConfig,
  verifyArtistPayment,
} from "@/lib/api/artist-payment.functions";
import { PhantomBrowserPay } from "@/components/PhantomBrowserPay";

type Config = Awaited<ReturnType<typeof getPaymentConfig>>;

export function PhantomPayPanel() {
  const { user } = useAuth();
  const { isArtist } = useAccountType();
  const navigate = useNavigate();
  const loadConfig = useServerFn(getPaymentConfig);
  const verify = useServerFn(verifyArtistPayment);

  const [config, setConfig] = useState<Config | null>(null);
  const [token, setToken] = useState<"USDC" | "SOL">("USDC");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [signature, setSignature] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadConfig().then(setConfig).catch(() => {});
  }, [loadConfig]);

  useEffect(() => {
    if (!config) return;
    const params = new URLSearchParams();
    if (token === "USDC") {
      params.set("amount", String(config.priceUsd));
      params.set("spl-token", config.usdcMint);
    } else if (config.solUsd) {
      params.set("amount", (config.priceUsd / config.solUsd).toFixed(6));
    } else {
      return;
    }
    params.set("label", "Soundwave Artist");
    params.set("message", "30-day artist subscription");
    const url = `solana:${config.receiver}?${params.toString()}`;
    setPayUrl(url);
    QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setQrDataUrl).catch(() => {});
  }, [config, token]);

  const submitSignature = async () => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (!signature.trim()) {
      toast.error("Paste your transaction signature");
      return;
    }
    setBusy(true);
    try {
      const res = await verify({ data: { signature: signature.trim(), token } });
      toast.success(
        `You're an artist! Active until ${new Date(res.expiresAt).toLocaleDateString()}.`,
      );
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const priceLabel =
    token === "USDC"
      ? "10 USDC"
      : config?.solUsd
        ? `~${(10 / config.solUsd).toFixed(4)} SOL`
        : "~$10 in SOL";

  return (
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
      </div>

      {isArtist ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-semibold text-primary">
          <CheckCircle2 className="h-4 w-4" /> You're already an artist
        </div>
      ) : (
        <>
          {config && (
            <PhantomBrowserPay
              token={token}
              receiver={config.receiver}
              usdcMint={config.usdcMint}
              usdcDecimals={config.usdcDecimals}
              priceUsd={config.priceUsd}
              solUsd={config.solUsd}
              rpcUrl={config.rpcUrl}
            />
          )}

          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or scan with phone
            <div className="h-px flex-1 bg-border" />
          </div>

          {qrDataUrl ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-white p-4">
              <img src={qrDataUrl} alt="Scan with Phantom" className="h-56 w-56" />
              <p className="text-center text-xs text-muted-foreground">
                Open Phantom on your phone, tap Scan, and confirm the payment.
              </p>
              {payUrl && (
                <button
                  type="button"
                  onClick={() => {
                    const ua = navigator.userAgent || "";
                    const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
                    if (isMobile) {
                      // Try native Solana Pay protocol handler first
                      window.location.href = payUrl;
                      // Fallback to Phantom universal link after a short delay
                      setTimeout(() => {
                        const ul = `https://phantom.app/ul/v1/pay?request=${encodeURIComponent(payUrl)}`;
                        window.location.href = ul;
                      }, 800);
                    } else {
                      navigator.clipboard?.writeText(payUrl).catch(() => {});
                      toast.info(
                        "Payment link copied. Open Phantom on your phone and paste it, or scan the QR above.",
                      );
                    }
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  Or open Phantom directly <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
          ) : (
            <div className="flex h-56 items-center justify-center rounded-xl border border-border bg-muted/40">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">
              After paying, paste the transaction signature to activate:
            </label>
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="Transaction signature"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={submitSignature}
              disabled={busy || !signature.trim()}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Activate artist access
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default PhantomPayPanel;
