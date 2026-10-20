import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Music2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";


export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Orange Sound Guild" },
      { name: "description", content: "Sign in to upload, save playlists and share music on Orange Sound Guild." },
      { property: "og:title", content: "Sign in — Orange Sound Guild" },
      { property: "og:description", content: "Sign in to upload, save playlists and share music on Orange Sound Guild." },
      { property: "og:url", content: "https://orangesoundguild.com/auth" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://orangesoundguild.com/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [refCode, setRefCode] = useState("");
  const [pioneerCode, setPioneerCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreedTos, setAgreedTos] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);


  useEffect(() => {
    if (!loading && user) {
      // Persist TOS acceptance for OAuth signups where sessionStorage was set pre-redirect
      try {
        const flag = window.sessionStorage.getItem("tos_accepted_at");
        if (flag) {
          supabase
            .from("profiles")
            .update({ tos_accepted: true, tos_accepted_at: flag })
            .eq("id", user.id)
            .then(() => {
              try { window.sessionStorage.removeItem("tos_accepted_at"); } catch { /* ignore */ }
            });
        }
      } catch { /* ignore */ }
      try {
        const pendingInvite = window.sessionStorage.getItem("pending_curator_invite");
        if (pendingInvite) {
          window.sessionStorage.removeItem("pending_curator_invite");
          window.location.assign(`/curator?invite=${encodeURIComponent(pendingInvite)}`);
          return;
        }
      } catch { /* ignore */ }
      navigate({ to: "/" });
    }
  }, [user, loading, navigate]);

  // Capture ?ref=CODE and ?pioneer=CODE from URL and remember them (survive Google OAuth round-trip)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("ref");
    if (q) {
      const clean = q.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
      setRefCode(clean);
      try {
        window.localStorage.setItem("ref_code", clean);
      } catch {
        /* ignore */
      }
      setMode("signup");
    } else {
      try {
        const stored = window.localStorage.getItem("ref_code");
        if (stored) setRefCode(stored);
      } catch {
        /* ignore */
      }
    }
    const pi = params.get("pioneer");
    if (pi) {
      const cleanPi = pi.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16);
      setPioneerCode(cleanPi);
      try {
        window.localStorage.setItem("pioneer_code", cleanPi);
      } catch {
        /* ignore */
      }
      setMode("signup");
    } else {
      try {
        const stored = window.localStorage.getItem("pioneer_code");
        if (stored) setPioneerCode(stored);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const onEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && !agreedTos) {
      toast.error("You must agree to the Terms of Service to create an account.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              tos_accepted: true,
              tos_accepted_at: new Date().toISOString(),
              ...(refCode ? { ref_code: refCode } : {}),
              ...(pioneerCode ? { pioneer_code: pioneerCode } : {}),
            },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email if confirmation is required.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
    } finally {
      setBusy(false);
    }
  };

  const onForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setForgotSent(true);
      toast.success("Reset link sent. Check your email.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    if (mode === "signup" && !agreedTos) {
      toast.error("You must agree to the Terms of Service to create an account.");
      return;
    }
    if (mode === "signup") {
      try { window.sessionStorage.setItem("tos_accepted_at", new Date().toISOString()); } catch { /* ignore */ }
    }
    setBusy(true);
    const r = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (r.error) {
      toast.error(r.error instanceof Error ? r.error.message : "Google sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-elegant)]">
        <Link to="/" className="mb-6 flex items-center gap-2 text-lg font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Music2 className="h-4 w-4" />
          </span>
          Orange Sound Guild
        </Link>

        <h1 className="text-2xl font-bold tracking-tight">
          {mode === "signin" ? "Welcome back" : mode === "signup" ? "Create account" : "Reset password"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin" ? "Sign in to upload and like tracks." : mode === "signup" ? "Join to share your sound." : "We'll email you a link to set a new password."}
        </p>

        {mode === "signup" && (
          <div className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            <div className="mb-1 font-semibold text-foreground">How to join:</div>
            <ol className="list-decimal space-y-0.5 pl-4">
              <li>Tick the box to agree to the Terms of Service.</li>
              <li>Continue with Google, or enter an email and a password (6+ characters).</li>
              <li>Tap <span className="font-medium text-foreground">Sign up</span>. If asked, confirm via the email we send you.</li>
            </ol>
          </div>
        )}

        {mode !== "forgot" && (
          <>
            <button
              type="button"
              onClick={onGoogle}
              disabled={busy || (mode === "signup" && !agreedTos)}
              className="mt-6 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              Continue with Google
            </button>

            <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> or <div className="h-px flex-1 bg-border" />
            </div>
          </>
        )}

        {mode === "forgot" ? (
          forgotSent ? (
            <div className="mt-6 rounded-md border border-border bg-muted/40 p-4 text-center text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{email}</span>, a reset link is on its way. Check your inbox and follow the link to set a new password.
            </div>
          ) : (
            <form onSubmit={onForgot} className="mt-6 space-y-3">
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:brightness-105 disabled:opacity-50"
              >
                {busy ? "Sending…" : "Send reset link"}
              </button>
            </form>
          )
        ) : (
          <form onSubmit={onEmail} className="space-y-3">
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            <input
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Referral code (optional)"
                value={refCode}
                onChange={(e) => setRefCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-mono uppercase tracking-widest outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            )}
            {mode === "signup" && (
              <input
                type="text"
                placeholder="Pioneer invite code (optional)"
                value={pioneerCode}
                onChange={(e) => setPioneerCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 16))}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-mono uppercase tracking-widest outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
            )}
            {mode === "signup" && (
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={agreedTos}
                  onChange={(e) => setAgreedTos(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
                />
                <span>
                  I agree to the{" "}
                  <Link to="/terms" target="_blank" className="font-medium text-primary hover:underline">
                    Terms of Service
                  </Link>
                  .
                </span>
              </label>
            )}
            <button
              type="submit"
              disabled={busy || (mode === "signup" && !agreedTos)}
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:brightness-105 disabled:opacity-50"
            >
              {mode === "signin" ? "Sign in" : "Sign up"}
            </button>
          </form>
        )}

        {mode === "signin" && (
          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => { setMode("forgot"); setForgotSent(false); }}
              className="text-xs font-medium text-primary hover:underline"
            >
              Forgot password?
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "signin" ? "No account?" : mode === "signup" ? "Already have one?" : "Remembered it?"}{" "}
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-medium text-primary hover:underline"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
