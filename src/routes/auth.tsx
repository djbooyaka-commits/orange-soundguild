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
      { property: "og:url", content: "https://orange-soundguild.lovable.app/auth" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://orange-soundguild.lovable.app/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [refCode, setRefCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [agreedTos, setAgreedTos] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/" });
  }, [user, loading, navigate]);

  // Capture ?ref=CODE from URL and remember it (so it survives Google OAuth round-trip too)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("ref");
    if (q) {
      const clean = q.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
      setRefCode(clean);
      try {
        window.sessionStorage.setItem("ref_code", clean);
      } catch {
        /* ignore */
      }
      setMode("signup");
    } else {
      try {
        const stored = window.sessionStorage.getItem("ref_code");
        if (stored) setRefCode(stored);
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
            data: refCode ? { ref_code: refCode } : undefined,
          },
        });
        if (error) throw error;
        try {
          window.sessionStorage.removeItem("ref_code");
        } catch {
          /* ignore */
        }
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

  const onGoogle = async () => {
    if (mode === "signup" && !agreedTos) {
      toast.error("You must agree to the Terms of Service to create an account.");
      return;
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
          soundwave
        </Link>

        <h1 className="text-2xl font-bold tracking-tight">
          {mode === "signin" ? "Welcome back" : "Create account"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin" ? "Sign in to upload and like tracks." : "Join to share your sound."}
        </p>

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

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "signin" ? "No account?" : "Already have one?"}{" "}
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
