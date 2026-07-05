import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, RotateCcw, ShieldAlert, Plus, Trash2, Receipt } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import {
  ARTIST_WELCOME_DEFAULTS,
  mergeArtistWelcome,
  type ArtistWelcomeContent,
} from "@/lib/artist-welcome-content";

type SiteExpense = {
  id: string;
  spent_on: string;
  category: string;
  description: string;
  amount_cents: number;
  note: string | null;
};

const EXPENSE_CATEGORIES = [
  "hosting",
  "domain",
  "ai",
  "storage",
  "marketing",
  "design",
  "legal",
  "tools",
  "payouts",
  "other",
];

function fmtUsd(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}


export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Orange Sound Guild" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
  errorComponent: ({ error }) => <div role="alert" className="p-6">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const [content, setContent] = useState<ArtistWelcomeContent>(ARTIST_WELCOME_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("site_content")
        .select("value")
        .eq("key", "artist_welcome")
        .maybeSingle();
      if (cancelled) return;
      setContent(mergeArtistWelcome((data?.value ?? null) as Partial<ArtistWelcomeContent> | null));
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="mx-auto max-w-lg px-6 py-24 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-4 text-2xl font-semibold">Sign in required</h1>
          <p className="mt-2 text-muted-foreground">Sign in to access the admin area.</p>
          <Link
            to="/auth"
            className="mt-6 inline-block rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
          >
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="mx-auto max-w-lg px-6 py-24 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-2xl font-semibold">Admins only</h1>
          <p className="mt-2 text-muted-foreground">
            You don't have access to this page.
          </p>
        </div>
      </div>
    );
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase
      .from("site_content")
      .upsert(
        {
          key: "artist_welcome",
          value: JSON.parse(JSON.stringify(content)),
          updated_by: user!.id,
        },
        { onConflict: "key" },
      );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Artist Welcome page saved");
  }

  function resetDefaults() {
    setContent(ARTIST_WELCOME_DEFAULTS);
    toast.message("Reset to defaults — click Save to publish.");
  }

  function updateStep(i: number, field: "title" | "body", val: string) {
    setContent((c) => ({
      ...c,
      steps: c.steps.map((s, idx) => (idx === i ? { ...s, [field]: val } : s)),
    }));
  }
  function updateTip(i: number, field: "title" | "body", val: string) {
    setContent((c) => ({
      ...c,
      tips: c.tips.map((t, idx) => (idx === i ? { ...t, [field]: val } : t)),
    }));
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Edit the Artist Welcome page. Changes go live instantly.
            </p>
          </div>
          <Link
            to="/artist-welcome"
            className="text-sm font-medium text-primary hover:underline"
          >
            Preview →
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-8">
            <Section title="Header">
              <Field label="Headline">
                <input
                  className={inputCls}
                  value={content.headline}
                  onChange={(e) => setContent({ ...content, headline: e.target.value })}
                />
              </Field>
              <Field label="Subheadline">
                <textarea
                  rows={2}
                  className={inputCls}
                  value={content.subhead}
                  onChange={(e) => setContent({ ...content, subhead: e.target.value })}
                />
              </Field>
              <Field label="Intro paragraph">
                <textarea
                  rows={3}
                  className={inputCls}
                  value={content.intro}
                  onChange={(e) => setContent({ ...content, intro: e.target.value })}
                />
              </Field>
            </Section>

            <Section title="Getting started steps">
              {content.steps.map((step, i) => (
                <div key={i} className="rounded-lg border border-border p-4">
                  <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Step {i + 1}
                  </div>
                  <Field label="Title">
                    <input
                      className={inputCls}
                      value={step.title}
                      onChange={(e) => updateStep(i, "title", e.target.value)}
                    />
                  </Field>
                  <Field label="Body">
                    <textarea
                      rows={2}
                      className={inputCls}
                      value={step.body}
                      onChange={(e) => updateStep(i, "body", e.target.value)}
                    />
                  </Field>
                </div>
              ))}
            </Section>

            <Section title="Good-to-know tips">
              {content.tips.map((tip, i) => (
                <div key={i} className="rounded-lg border border-border p-4">
                  <div className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
                    Tip {i + 1}
                  </div>
                  <Field label="Title">
                    <input
                      className={inputCls}
                      value={tip.title}
                      onChange={(e) => updateTip(i, "title", e.target.value)}
                    />
                  </Field>
                  <Field label="Body">
                    <textarea
                      rows={2}
                      className={inputCls}
                      value={tip.body}
                      onChange={(e) => updateTip(i, "body", e.target.value)}
                    />
                  </Field>
                </div>
              ))}
            </Section>

            <Section title="Footer">
              <Field label="Footer note">
                <textarea
                  rows={2}
                  className={inputCls}
                  value={content.footerNote}
                  onChange={(e) => setContent({ ...content, footerNote: e.target.value })}
                />
              </Field>
            </Section>

            <div className="sticky bottom-4 flex gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
              <button
                onClick={save}
                disabled={saving}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving…" : "Save changes"}
              </button>
              <button
                onClick={resetDefaults}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card/50 p-5">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}
