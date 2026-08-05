import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";

const TITLE = "How to Promote Your Independent Music in 2026";
const DESCRIPTION =
  "A practical independent music promotion guide for 2026: build release momentum, use charts and genre discovery, grow superfans, and turn streams into royalties.";
const URL = "https://orangesoundguild.com/guide/promotion";

export const Route = createFileRoute("/guide/promotion")({
  head: () => ({
    meta: [
      { title: `${TITLE} — Orange Sound Guild` },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          mainEntityOfPage: URL,
          publisher: { "@type": "Organization", name: "Orange Sound Guild" },
        }),
      },
    ],
  }),
  component: PromotionGuidePage,
});

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">
        {n}. {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-6">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

function PromotionGuidePage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <header className="border-b border-border pb-6">
          <h1 className="text-4xl font-bold tracking-tight">{TITLE}</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Promotion in 2026 is less about one big launch day and more about steady, repeatable
            momentum. This guide walks through a release cycle you can actually run on your own —
            using Orange Sound Guild's charts, genre discovery, and superfan tools alongside your
            social channels.
          </p>
        </header>

        <Section n={1} title="Set up a release page people can share">
          <p>
            Every track you upload to Orange Sound Guild gets its own shareable link with artwork
            and a rich social preview, so the link looks like a release — not a bare URL — when it
            lands in a chat, a story, or a post.
          </p>
          <Bullets
            items={[
              "Upload high-resolution cover art; it is the first thing people see in a shared link.",
              "Tag the correct genre so your track surfaces in genre-based discovery.",
              "Use one canonical link everywhere instead of a different URL per platform.",
              "Share your referral-enabled track link so listeners who sign up are credited to you.",
            ]}
          />
          <p>
            <Link to="/discover" className="font-medium text-foreground underline">
              Browse discovery
            </Link>{" "}
            to see how genre tags shape what listeners find.
          </p>
        </Section>

        <Section n={2} title="Build a release calendar, not a release day">
          <p>
            Consistency outperforms intensity. A single-track drop every four to six weeks gives
            you more chances to be discovered than one album dropped in silence.
          </p>
          <Bullets
            items={[
              "Two weeks out: teaser clip and pre-save/pre-share push to your closest listeners.",
              "Release day: track link, artwork, and a short story about how the record was made.",
              "Week one: short-form video using the strongest 15 seconds of the song.",
              "Week two to four: playlist pitches, collaborations, and a behind-the-scenes post.",
            ]}
          />
        </Section>

        <Section n={3} title="Use charts as a promotion loop">
          <p>
            Charts are social proof you can promote. Momentum on the{" "}
            <Link to="/top100" className="font-medium text-foreground underline">
              Top 100
            </Link>{" "}
            gives your audience a concrete reason to press play again and to send the track to a
            friend.
          </p>
          <Bullets
            items={[
              "Ask for plays with a specific goal (\"help us crack the Top 100 this week\") rather than a generic \"check out my song\".",
              "Screenshot chart positions and post them — progress is more shareable than a plain link.",
              "Watch which genres you chart strongest in and lean into that audience on your next release.",
            ]}
          />
        </Section>

        <Section n={4} title="Turn listeners into superfans">
          <p>
            A small group of committed listeners will outperform a large passive following. Give
            people a reason to move from casual play to active support.
          </p>
          <Bullets
            items={[
              "Reply to comments on your tracks — conversation converts listeners into regulars.",
              "Offer free download codes to early supporters and price paid downloads for the rest.",
              "Post updates so your audience hears from you between releases.",
              "Collaborate: tracks credited to multiple artists appear on every collaborator's page.",
            ]}
          />
          <p>
            See how supporter tiers work on the{" "}
            <Link to="/superfans" className="font-medium text-foreground underline">
              Superfans page
            </Link>
            .
          </p>
        </Section>

        <Section n={5} title="Pitch playlists the right way">
          <p>
            Playlist placement still moves the needle, but curators receive far more submissions
            than they can play. Make yours easy to say yes to.
          </p>
          <Bullets
            items={[
              "Pitch tracks that fit the playlist's existing sound, not just your favourite song.",
              "Keep the message short: artist, genre, one-line description, one link.",
              "Follow the curator and the artists already on the playlist before you submit.",
              "Respect resubmission windows — pitching the same track repeatedly gets you ignored.",
            ]}
          />
        </Section>

        <Section n={6} title="Measure what actually worked">
          <p>
            At the end of each cycle, look at plays, saves, and follows rather than impressions.
            Repeat the two things that produced the most repeat listeners and drop the rest.
          </p>
          <Bullets
            items={[
              "Which channel sent the most plays in week one?",
              "Which post produced follows, not just views?",
              "Which genre or collaborator brought in new listeners?",
              "How much of your streaming activity converted into royalties?",
            ]}
          />
        </Section>

        <section className="mt-12 rounded-lg border border-border p-6">
          <h2 className="text-lg font-semibold tracking-tight">Start your next release here</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Upload a track, tag its genre, and share the link — everything in this guide runs on
            top of that one step.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm font-medium">
            <Link
              to="/auth"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
            >
              Create an artist account
            </Link>
            <Link
              to="/top100"
              className="rounded-md border border-border px-4 py-2 text-foreground"
            >
              See the Top 100
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
