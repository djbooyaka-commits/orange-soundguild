import { useEffect, useState } from "react";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  createTransferCheckedInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Sparkles, Wallet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import {
  getPaymentConfig,
  verifyArtistPayment,
} from "@/lib/api/artist-payment.functions";

type PhantomProvider = {
  isPhantom?: boolean;
  publicKey: { toString(): string } | null;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{ publicKey: { toString(): string } }>;
  disconnect: () => Promise<void>;
  signAndSendTransaction: (tx: Transaction) => Promise<{ signature: string }>;
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

type Config = Awaited<ReturnType<typeof getPaymentConfig>>;

export default function PhantomPayPanel() {
  const { user } = useAuth();
  const { isArtist, loading: accLoading } = useAccountType();
  const navigate = useNavigate();
  const loadConfig = useServerFn(getPaymentConfig);
  const verify = useServerFn(verifyArtistPayment);

  const [config, setConfig] = useState<Config | null>(null);
  const [token, setToken] = useState<"USDC" | "SOL">("USDC");
  const [wallet, setWallet] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "connect" | "pay">(null);

  useEffect(() => {
    loadConfig().then(setConfig).catch(() => {});
    const p = getPhantom();
    if (!p) return;
    p.connect({ onlyIfTrusted: true })
      .then((r) => setWallet(r.publicKey.toString()))
      .catch(() => {});
  }, [loadConfig]);

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
    if (!p || !wallet || !config) {
      toast.error("Connect Phantom wallet first");
      return;
    }
    setBusy("pay");
    try {
      const conn = new Connection(config.rpcUrl, "confirmed");
      const payer = new PublicKey(wallet);
      const receiver = new PublicKey(config.receiver);
      const tx = new Transaction();

      if (token === "SOL") {
        if (!config.solUsd) throw new Error("SOL price unavailable — try USDC");
        const amount = +(config.priceUsd / config.solUsd).toFixed(6);
        tx.add(
          SystemProgram.transfer({
            fromPubkey: payer,
            toPubkey: receiver,
            lamports: Math.round(amount * LAMPORTS_PER_SOL),
          }),
        );
      } else {
        const mint = new PublicKey(config.usdcMint);
        const fromAta = getAssociatedTokenAddressSync(mint, payer);
        const toAta = getAssociatedTokenAddressSync(mint, receiver);
        try {
          await getAccount(conn, toAta);
        } catch {
          tx.add(createAssociatedTokenAccountInstruction(payer, toAta, receiver, mint));
        }
        tx.add(
          createTransferCheckedInstruction(
            fromAta,
            mint,
            toAta,
            payer,
            BigInt(config.priceUsd * 10 ** config.usdcDecimals),
            config.usdcDecimals,
            [],
            TOKEN_PROGRAM_ID,
          ),
        );
      }

      const { blockhash } = await conn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = payer;

      const { signature } = await p.signAndSendTransaction(tx);
      toast.info("Confirming payment on Solana…");
      await conn.confirmTransaction(signature, "confirmed");
      const verified = await verify({ data: { signature, token } });
      toast.success(
        `You're an artist! Active until ${new Date(verified.expiresAt).toLocaleDateString()}.`,
      );
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(null);
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
        {token === "SOL" && config?.solUsd && (
          <div className="mt-1 text-xs text-muted-foreground">
            SOL price: ${config.solUsd.toFixed(2)} USD
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
          disabled={busy !== null || isArtist || accLoading || !config}
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
  );
}
