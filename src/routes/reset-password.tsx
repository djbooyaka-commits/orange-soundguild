import { createFileRoute, useNavigate, Link, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Music2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Orange Sound Guild" },
      {
        name: "description",
        content: "Set a new password for your Orange Sound Guild account.",
      },
      {
        property: "og:title",
        content: "Reset password — Orange Sound Guild",
      },
      {
        property: "og:description",
        content: "Set a new password for your Orange Sound Guild account.",
      },
      { property: "og:url", content: "https://orange-soundguild.lovable.app/reset-password" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: "https://orange-soundguild.lovable.app/reset-password" }],
  }),
  beforeLoad: async () => {
    // This route is reached from the email recovery link, which contains
    // a valid session via the type=recovery hash. We allow it to load
    // without a prior session so the user can set a new password.
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Detect the recovery flow: Supabase puts type=recovery in the URL hash.
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
    if (params.get("type") !== "recovery") {
      // Not a recovery link — nothing useful to do here. Send home.
      navigate({ to: "/" });
    }
  }, [navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Password updated. You can sign in with your new password.");
      // Sign out the recovery session so the user signs in fresh.
      await supabase.auth.signOut();
      setTimeout(() => navigate({ to: "/auth" }), 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset password");
    } finally {
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

        {done ? (
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight">Password reset</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Your password has been updated. Redirecting to sign in…
            </p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold tracking-tight">Set a new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a new password for your account.
            </p>

            <form onSubmit={onSubmit} className="mt-6 space-y-3">
              <input
                type="password"
                required
                minLength={6}
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
              <input
                type="password"
                required
                minLength={6}
                placeholder="Confirm new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
              />
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground hover:brightness-105 disabled:opacity-50"
              >
                {busy ? "Updating…" : "Update password"}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              <Link to="/auth" className="font-medium text-primary hover:underline">
                Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
