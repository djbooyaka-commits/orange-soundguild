import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Upload, Music2, BarChart3, Users, PlayCircle, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import {
  ARTIST_WELCOME_DEFAULTS,
  mergeArtistWelcome,
  type ArtistWelcomeContent,
} from "@/lib/artist-welcome-content";

const STEP_ICONS = [Settings, Upload, Music2, Users];
const TIP_ICONS = [PlayCircle, BarChart3, Sparkles];

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
      { property: "og:description", content: "Get started as an artist on Orange Sound Guild." },
      { property: "og:url", content: "https://orange-soundguild.lovable.app/artist-welcome" },
    ],
    links: [{ rel: "canonical", href: "https://orange-soundguild.lovable.app/artist-welcome" }],
  }),
  component: ArtistWelcomePage,
  errorComponent: ({ error }) => <div role="alert" className="p-6">{error.message}</div>,
  notFoundComponent: () => <div className="p-6">Not found.</div>,
});

function ArtistWelcomePage() {
  const [content, setContent] = useState<ArtistWelcomeContent>(ARTIST_WELCOME_DEFAULTS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("site_content")
        .select("value")
        .eq("key", "artist_welcome")
        .maybeSingle();
      if (cancelled) return;
      const value = (data?.value ?? null) as Partial<ArtistWelcomeContent> | null;
      setContent(mergeArtistWelcome(value));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <div className="mx-auto mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Sparkles className="h-7 w-7" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">{content.headline}</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">{content.subhead}</p>
        </div>

        <p className="mx-auto mt-10 max-w-2xl text-center text-base text-muted-foreground">
          {content.intro}
        </p>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-semibold">Getting started</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {content.steps.map((step, i) => {
              const Icon = STEP_ICONS[i] ?? Sparkles;
              return (
                <div key={i} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="font-semibold">{step.title}</div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{step.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-12 space-y-4">
          <h2 className="text-2xl font-semibold">Good to know</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {content.tips.map((tip, i) => {
              const Icon = TIP_ICONS[i] ?? Sparkles;
              return (
                <div key={i} className="rounded-2xl border border-border bg-card/60 p-5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="mt-3 font-semibold">{tip.title}</div>
                  <p className="mt-1 text-sm text-muted-foreground">{tip.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="mt-12 flex flex-col items-center gap-4 rounded-2xl border border-border bg-muted/30 p-6 text-center">
          <p className="text-sm text-muted-foreground">{content.footerNote}</p>
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
