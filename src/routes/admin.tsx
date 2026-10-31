import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { publicOrigin } from "@/lib/utils";
import { Loader2, Save, RotateCcw, ShieldAlert, Plus, Trash2, Receipt, Ticket, Copy, Users, Megaphone } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { RoyaltyPoolAdmin } from "@/components/RoyaltyPoolAdmin";
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
  errorComponent: ({ error }) => <div role="alert" className="p-6">{(error as Error).message}</div>,
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

const ADMIN_TABS = [
  { id: "page", label: "Artist Welcome page" },
  { id: "users", label: "Users" },
  { id: "ads", label: "Ad scripts" },
  { id: "royalties", label: "Royalty pool" },
  { id: "accounting", label: "Site accounting" },
] as const;

type AdminTab = (typeof ADMIN_TABS)[number]["id"];

function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const isAdmin = useIsAdmin();
  const [tab, setTab] = useState<AdminTab>("page");
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
      <main className="mx-auto max-w-3xl px-4 py-10 pb-40 sm:px-6">
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
            <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-card/50 p-2">
              {ADMIN_TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={
                    "rounded-full px-4 py-2 text-sm font-semibold transition " +
                    (tab === t.id
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted")
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "page" && (
              <>
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

                <PioneerInvites />

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
              </>
            )}

            {tab === "users" && <UsersAdmin />}
            {tab === "ads" && <AdScriptsAdmin />}
            {tab === "royalties" && <RoyaltyPoolAdmin />}
            {tab === "accounting" && <SiteAccounting />}
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



function SiteAccounting() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SiteExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    spent_on: new Date().toISOString().slice(0, 10),
    category: "hosting",
    description: "",
    amount: "",
    note: "",
  });

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from("site_expenses")
      .select("id, spent_on, category, description, amount_cents, note")
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as SiteExpense[]);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function addRow(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const amt = Number(form.amount);
    if (!form.description.trim()) {
      toast.error("Add a short description");
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("site_expenses").insert({
      user_id: user.id,
      spent_on: form.spent_on,
      category: form.category,
      description: form.description.trim(),
      amount_cents: Math.round(amt * 100),
      note: form.note.trim() || null,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Expense added");
    setForm((f) => ({ ...f, description: "", amount: "", note: "" }));
    void reload();
  }

  async function removeRow(id: string) {
    if (!confirm("Delete this expense?")) return;
    const { error } = await supabase.from("site_expenses").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((r) => r.filter((x) => x.id !== id));
    toast.success("Deleted");
  }

  const total = rows.reduce((s, r) => s + r.amount_cents, 0);
  const byCategory = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + r.amount_cents;
    return acc;
  }, {});

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Receipt className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Site accounting</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Log every dollar spent running the site. Only admins can see these entries.
      </p>

      <div className="mb-5 rounded-xl border border-border bg-background/60 p-4">
        <div className="text-xs uppercase text-muted-foreground">Total spent</div>
        <div className="mt-1 text-3xl font-bold tracking-tight">{fmtUsd(total)}</div>
        {Object.keys(byCategory).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(byCategory)
              .sort((a, b) => b[1] - a[1])
              .map(([cat, cents]) => (
                <span
                  key={cat}
                  className="rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs"
                >
                  <span className="font-medium capitalize">{cat}</span>{" "}
                  <span className="text-muted-foreground">{fmtUsd(cents)}</span>
                </span>
              ))}
          </div>
        )}
      </div>

      <form onSubmit={addRow} className="mb-6 grid gap-3 sm:grid-cols-6">
        <div className="sm:col-span-2">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Date</div>
          <input
            type="date"
            className={inputCls}
            value={form.spent_on}
            onChange={(e) => setForm({ ...form, spent_on: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Category</div>
          <select
            className={inputCls}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c} className="capitalize">
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Amount (USD)</div>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0.00"
            className={inputCls}
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div className="sm:col-span-3">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Description</div>
          <input
            className={inputCls}
            placeholder="e.g. Domain renewal"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="sm:col-span-3">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">Note (optional)</div>
          <input
            className={inputCls}
            placeholder="Invoice #, vendor, etc."
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
        <div className="sm:col-span-6">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add expense
          </button>
        </div>
      </form>

      <div className="overflow-hidden rounded-xl border border-border">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No expenses logged yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Category</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                    {r.spent_on}
                  </td>
                  <td className="px-3 py-2 capitalize">{r.category}</td>
                  <td className="px-3 py-2">
                    <div>{r.description}</div>
                    {r.note && (
                      <div className="text-xs text-muted-foreground">{r.note}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    {fmtUsd(r.amount_cents)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removeRow(r.id)}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

type PioneerInvite = {
  id: string;
  code: string;
  used_by: string | null;
  used_at: string | null;
  created_at: string;
};

function PioneerInvites() {
  const [rows, setRows] = useState<PioneerInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setLoading(true);
    const { data, error } = await supabase
      .from("pioneer_invites")
      .select("id, code, used_by, used_at, created_at")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as PioneerInvite[]);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function createInvite() {
    setBusy(true);
    const { data, error } = await supabase.rpc("create_pioneer_invite");
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Invite created: ${data}`);
    void reload();
  }

  async function removeInvite(id: string) {
    if (!confirm("Delete this invite?")) return;
    const { error } = await supabase.from("pioneer_invites").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((r) => r.filter((x) => x.id !== id));
  }

  async function copyLink(code: string) {
    const url = `${publicOrigin()}/auth?pioneer=${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Ticket className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Pioneer invites</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Pioneer accounts can upload up to 5 tracks and use the referral system.
        They must upgrade to Artist to unlock more uploads or once they become
        royalty-eligible.
      </p>

      <button
        onClick={createInvite}
        disabled={busy}
        className="mb-4 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        Generate invite code
      </button>

      <div className="overflow-hidden rounded-xl border border-border">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No invites yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Created</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                  <td className="px-3 py-2">
                    {r.used_by ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        Used {r.used_at ? new Date(r.used_at).toLocaleDateString() : ""}
                      </span>
                    ) : (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                        Available
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => copyLink(r.code)}
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Copy invite link"
                        title="Copy invite link"
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => removeInvite(r.id)}
                        className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

type AdminUser = {
  id: string;
  username: string | null;
  avatar_url: string | null;
  account_type: "fan" | "artist" | "superfan" | "pioneer";
  created_at: string;
};

const ACCOUNT_TYPES: AdminUser["account_type"][] = ["fan", "artist", "superfan", "pioneer"];

function UsersAdmin() {
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [refs, setRefs] = useState<Record<string, string | null>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    const [{ data, error }, { data: refRows }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, username, avatar_url, account_type, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase.rpc("admin_list_referrers"),
    ]);
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data ?? []) as AdminUser[]);
    const map: Record<string, string | null> = {};
    for (const r of (refRows ?? []) as { user_id: string; referrer_username: string | null }[]) {
      map[r.user_id] = r.referrer_username;
    }
    setRefs(map);
  }

  useEffect(() => {
    void reload();
  }, []);

  async function changeType(id: string, next: AdminUser["account_type"]) {
    setSavingId(id);
    const { error } = await supabase.rpc("admin_set_account_type", {
      _user_id: id,
      _type: next,
    });
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((r) => r.map((u) => (u.id === id ? { ...u, account_type: next } : u)));
    toast.success(`Account changed to ${next}`);
  }

  async function saveReferrer(id: string) {
    const value = (drafts[id] ?? "").trim();
    setSavingId(id);
    const { error } = await supabase.rpc("admin_set_referrer", {
      _user_id: id,
      _referrer: value,
    });
    setSavingId(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setDrafts((d) => {
      const n = { ...d };
      delete n[id];
      return n;
    });
    await reload();
    toast.success(value ? "Referrer updated" : "Referrer cleared");
  }

  const filtered = q.trim()
    ? rows.filter((u) => (u.username ?? "").toLowerCase().includes(q.trim().toLowerCase()))
    : rows;


  return (
    <section className="rounded-2xl border border-border bg-card/50 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Users className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Users</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        View every user and change their account type. Set anyone to Pioneer to grant upload access (5-track limit).
      </p>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search username…"
        className={`${inputCls} mb-4`}
      />

      <div className="overflow-hidden rounded-xl border border-border">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No users match.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Joined</th>
                <th className="px-3 py-2 text-left">Account type</th>
                <th className="px-3 py-2 text-left">Referred by</th>

              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-3 py-2">
                    <Link
                      to="/u/$handle"
                      params={{ handle: u.username ?? u.id.slice(0, 8) }}
                      className="font-medium hover:text-primary"
                    >
                      {u.username ?? "(no name)"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="inline-flex items-center gap-2">
                      <select
                        value={u.account_type}
                        onChange={(e) =>
                          changeType(u.id, e.target.value as AdminUser["account_type"])
                        }
                        disabled={savingId === u.id}
                        className="rounded-md border border-border bg-background px-2 py-1 text-sm capitalize"
                      >
                        {ACCOUNT_TYPES.map((t) => (
                          <option key={t} value={t} className="capitalize">
                            {t}
                          </option>
                        ))}
                      </select>
                      {savingId === u.id && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={drafts[u.id] ?? refs[u.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [u.id]: e.target.value }))
                        }
                        placeholder="username or code"
                        className="w-40 rounded-md border border-border bg-background px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => saveReferrer(u.id)}
                        disabled={savingId === u.id || drafts[u.id] === undefined}
                        className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted disabled:opacity-40"
                      >
                        Save
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

type AdSlotDef = {
  key: string;
  label: string;
  description: string;
};

const AD_SLOTS: AdSlotDef[] = [
  {
    key: "ad_script_home",
    label: "Home page banner",
    description: "Injected into the ad slot on the home page hero (and mobile fallback).",
  },
  {
    key: "ad_script_st_rooms",
    label: "S.T. Rooms banners",
    description: "Injected at the top and bottom of the S.T. Rooms page.",
  },
  {
    key: "ad_script_beta_room",
    label: "Last.fm stream room banner",
    description: "Injected near the top of every Last.fm (beta) stream tracker room.",
  },
  {
    key: "ad_script_curator_room",
    label: "Spotify stream tracker banner",
    description: "Injected near the top of the Curator / Spotify stream tracker page.",
  },
];

function AdScriptsAdmin() {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [initial, setInitial] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("site_content")
        .select("key, value")
        .in(
          "key",
          AD_SLOTS.map((s) => s.key),
        );
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast.error(error.message);
        return;
      }
      const next: Record<string, string> = {};
      for (const row of data ?? []) {
        const v = row.value as { code?: string } | string | null;
        next[row.key as string] =
          typeof v === "string" ? v : (v?.code ?? "");
      }
      setValues(next);
      setInitial(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveSlot(key: string) {
    if (!user) return;
    setSavingKey(key);
    const code = values[key] ?? "";
    const { error } = await supabase
      .from("site_content")
      .upsert(
        {
          key,
          value: { code } as never,
          updated_by: user.id,
        },
        { onConflict: "key" },
      );
    setSavingKey(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    setInitial((s) => ({ ...s, [key]: code }));
    toast.success("Ad code saved. Reload pages to see changes.");
  }

  function clearSlot(key: string) {
    setValues((v) => ({ ...v, [key]: "" }));
  }

  return (
    <section className="rounded-2xl border border-border bg-card/50 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Ad scripts</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Paste the raw JavaScript from your ad network for each slot. Leave a
        slot empty to fall back to the built-in default. Do NOT include the{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-xs">
          &lt;script&gt;
        </code>{" "}
        tags — just the JS body.
      </p>

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {AD_SLOTS.map((slot) => {
            const val = values[slot.key] ?? "";
            const dirty = val !== (initial[slot.key] ?? "");
            return (
              <div key={slot.key} className="rounded-lg border border-border p-4">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">{slot.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {slot.description}
                    </div>
                  </div>
                  <code className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {slot.key}
                  </code>
                </div>
                <textarea
                  rows={8}
                  spellCheck={false}
                  className={`${inputCls} mt-3 font-mono text-xs`}
                  placeholder="// Paste ad network JavaScript here"
                  value={val}
                  onChange={(e) =>
                    setValues((v) => ({ ...v, [slot.key]: e.target.value }))
                  }
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => saveSlot(slot.key)}
                    disabled={savingKey === slot.key || !dirty}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {savingKey === slot.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </button>
                  <button
                    onClick={() => clearSlot(slot.key)}
                    className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear
                  </button>
                  {dirty && (
                    <span className="text-xs text-muted-foreground">
                      Unsaved changes
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}


