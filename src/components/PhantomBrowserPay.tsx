import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import bs58 from "bs58";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "@tanstack/react-router";
import { verifyArtistPayment } from "@/lib/api/artist-payment.functions";
import { buildPhantomTransaction } from "@/lib/api/phantom-tx.functions";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  signAndSendTransaction: (
    txOrOpts: unknown,
  ) => Promise<{ signature: string }>;
  request?: (args: { method: string; params: unknown }) => Promise<{ signature: string }>;
};

function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    solana?: PhantomProvider;
    phantom?: { solana?: PhantomProvider };
  };
  const p = w.phantom?.solana ?? w.solana;
  return p?.isPhantom ? p : null;
}

type Props = { token: "USDC" | "SOL" };

export function PhantomBrowserPay({ token }: Props) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const build = useServerFn(buildPhantomTransaction);
  const verify = useServerFn(verifyArtistPayment);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const pay = async () => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    const provider = getPhantom();
    if (!provider) {
      toast.error("Phantom not detected. Install the Phantom browser extension.");
      window.open("https://phantom.app/download", "_blank");
      return;
    }

    setBusy(true);
    try {
      setStatus("Connecting to Phantom…");
      const { publicKey } = await provider.connect();
      const payer = publicKey.toString();

      setStatus("Preparing transaction…");
      const { transactionBase58 } = await build({ data: { payer, token } });

      setStatus("Approve in Phantom…");
      let signature: string;
      if (provider.request) {
        const res = await provider.request({
          method: "signAndSendTransaction",
          params: { message: transactionBase58 },
        });
        signature = res.signature;
      } else {
        // Fallback: decode + submit via signAndSendTransaction with raw bytes
        const bytes = bs58.decode(transactionBase58);
        const res = await provider.signAndSendTransaction(bytes);
        signature = res.signature;
      }

      setStatus("Activating your artist access…");
      const r = await verify({ data: { signature, token } });
      toast.success(
        `You're an artist! Active until ${new Date(r.expiresAt).toLocaleDateString()}.`,
      );
      navigate({ to: "/" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Payment failed";
      toast.error(msg);
    } finally {
      setBusy(false);
      setStatus("");
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={pay}
        disabled={busy}
        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background shadow-sm transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {busy ? status || "Working…" : "Pay with Phantom extension"}
      </button>
      <p className="text-center text-[11px] text-muted-foreground">
        Uses your Phantom browser extension — no signature copy-paste needed.
      </p>
    </div>
  );
}

export default PhantomBrowserPay;
