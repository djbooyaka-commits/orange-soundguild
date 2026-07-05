import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Upload, Music2, BarChart3, Users, PlayCircle, Settings } from "lucide-react";
import { Navbar } from "@/components/Navbar";

// ============================================================
// EDIT THE WELCOME CONTENT BELOW — safe to change any text here
// ============================================================
const WELCOME = {
  headline: "Welcome to Orange Sound Guild",
  subhead:
    "You're officially an artist. Here's a quick tour so you can get your first track live in minutes.",
  intro:
    "Your artist account unlocks unlimited uploads, a public profile fans can follow, and the tools to grow your audience. Take a minute to set things up — it pays off fast.",
  steps: [
    {
      icon: Settings,
      title: "1. Finish your profile",
      body: "Add an avatar, a short bio, and your links. Fans check your profile before hitting follow, so make it count.",
      cta: { label: "Edit profile", to: "/library" as const },
    },
    {
      icon: Upload,
      title: "2. Upload your first track",
      body: "Drop an MP3 or WAV, add cover art, pick a genre, and publish. Tracks appear on your artist page instantly.",
      cta: { label: "Upload a track", to: "/library" as const },
    },
    {
      icon: Music2,
      title: "3. Build a playlist",
      body: "Group your releases or curate favorites into playlists. Great for EPs, albums, or themed sets.",
      cta: { label: "Go to Library", to: "/library" as const },
    },
    {
      icon: Users,
      title: "4. Share your artist page",
      body: "Your profile URL is your home base. Share it on socials so fans can follow, like, and comment.",
      cta: { label: "View your page", to: "/library" as const },
    },
  ],
  tips: [
    { icon: PlayCircle, title: "Plays & likes", body: "Every stream and like is tracked. Watch what's landing." },
    { icon: BarChart3, title: "Top 100 chart", body: "The most-played tracks site-wide land on the Top 100 — a great goal." },
    { icon: Sparkles, title: "Keep publishing", body: "Consistency beats perfection. Regular uploads keep your page fresh." },
  ],
  footerNote:
    "Artist access renews every 30 days from your last payment. Manage it anytime from the Upgrade page.",
};
// ============================================================
// END EDITABLE CONTENT
// ============================================================

export const Route = createFileRoute("/artist-welcome")({
  head: () => ({
    meta: [
      { title: "Welcome, Artist — Orange Sound Guild" },
      {
        name: "description",
        content:
          "Welcome to Orange Sound Guild. Learn how to set up your artist profile, upload tracks, and grow your audience.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Welcome, Artist — Orange Sound Guild" },
      {
        property: "og:description",
        content: "Get started as an artist on Orange Sound Guild.",
      },
      { property: "og:url", content: "https://orange-soundguild.lovable.app/artist-welcome" },
    ],
    links: [{ rel: "canonical", href: "https://orange-soundguild.lovable.app/artist-welcome" }],
  }),
  component: ArtistWelcomePage,
  errorComponent: ({ error }) => <div role="alert" className="p-6">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function ArtistWelcomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{WELCOME.headline}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">{WELCOME.subhead}</p>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-base text-muted-foreground">
          {WELCOME.intro}
        </p>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-semibold">Getting started</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {WELCOME.steps.map(({ icon: Icon, title, body, cta }) => (
              <div key={title} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="font-semibold">{title}</div>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{body}</p>
                <Link
                  to={cta.to}
                  className="mt-4 inline-flex items-center text-sm font-medium text-primary hover:underline"
                >
                  {cta.label} →
                </Link>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-semibold">Good to know</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {WELCOME.tips.map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-2xl border border-border bg-card/60 p-5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-3 font-semibold">{title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">{WELCOME.footerNote}</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              to="/library"
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Go to your Library
            </Link>
            <Link
              to="/"
              className="rounded-full border border-border px-5 py-2 text-sm font-semibold hover:bg-muted"
            >
              Explore the site
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
