import { useEffect, useState } from "react";
import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import {
  getPaypalConfig,
  createPaypalOrder,
  capturePaypalOrder,
} from "@/lib/api/artist-payment.functions";

export default function PaypalPayPanel() {
  const navigate = useNavigate();
  const createOrder = useServerFn(createPaypalOrder);
  const captureOrder = useServerFn(capturePaypalOrder);
  const loadConfig = useServerFn(getPaypalConfig);

  const [cfg, setCfg] = useState<{ clientId: string; mode: "sandbox" | "live" } | null>(null);
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    loadConfig()
      .then((c) => setCfg({ clientId: c.clientId, mode: c.mode }))
      .catch((e: unknown) => {
        setStatus("error");
        setMessage(e instanceof Error ? e.message : "Failed to load PayPal");
      });
  }, [loadConfig]);

  if (!cfg) {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-border bg-muted/30">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!cfg.clientId) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        PayPal is not configured.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {cfg.mode === "sandbox" && (
        <p className="text-xs text-muted-foreground">
          PayPal is running in sandbox mode — no real money will be charged.
        </p>
      )}
      <PayPalScriptProvider
        options={{
          clientId: cfg.clientId,
          currency: "USD",
          intent: "capture",
        }}
      >
        <PayPalButtons
          style={{ layout: "vertical", label: "pay", shape: "rect" }}
          disabled={status === "processing" || status === "success"}
          createOrder={async () => {
            setStatus("processing");
            setMessage(null);
            const { orderId } = await createOrder();
            return orderId;
          }}
          onApprove={async (data) => {
            try {
              const res = await captureOrder({ data: { orderId: data.orderID } });
              setStatus("success");
              setMessage(
                `Payment received. Artist access active until ${new Date(
                  res.expiresAt,
                ).toLocaleDateString()}.`,
              );
              setTimeout(() => navigate({ to: "/" }), 1800);
            } catch (e: unknown) {
              setStatus("error");
              setMessage(e instanceof Error ? e.message : "Capture failed");
            }
          }}
          onCancel={() => {
            setStatus("idle");
            setMessage(null);
          }}
          onError={(err) => {
            setStatus("error");
            setMessage(err instanceof Error ? err.message : "PayPal error");
          }}
        />
      </PayPalScriptProvider>

      {status === "success" && message && (
        <div className="flex items-start gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-700 dark:text-green-400">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {status === "error" && message && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
