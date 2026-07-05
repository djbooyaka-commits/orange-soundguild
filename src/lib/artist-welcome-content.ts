// Default content for the Artist Welcome page.
// Admins can override any of these fields via the /admin page.
// The shape must stay in sync with the admin form and artist-welcome route.

export type ArtistWelcomeStep = { title: string; body: string };
export type ArtistWelcomeTip = { title: string; body: string };

export type ArtistWelcomeContent = {
  headline: string;
  subhead: string;
  intro: string;
  steps: ArtistWelcomeStep[];
  tips: ArtistWelcomeTip[];
  footerNote: string;
};

export const ARTIST_WELCOME_DEFAULTS: ArtistWelcomeContent = {
  headline: "Welcome to Orange Sound Guild",
  subhead:
    "You're officially an artist. Here's a quick tour so you can get your first track live in minutes.",
  intro:
    "Your artist account unlocks unlimited uploads, a public profile fans can follow, and the tools to grow your audience. Take a minute to set things up — it pays off fast.",
  steps: [
    {
      title: "1. Finish your profile",
      body: "Add an avatar, a short bio, and your links. Fans check your profile before hitting follow, so make it count.",
    },
    {
      title: "2. Upload your first track",
      body: "Drop an MP3 or WAV, add cover art, pick a genre, and publish. Tracks appear on your artist page instantly.",
    },
    {
      title: "3. Build a playlist",
      body: "Group your releases or curate favorites into playlists. Great for EPs, albums, or themed sets.",
    },
    {
      title: "4. Share your artist page",
      body: "Your profile URL is your home base. Share it on socials so fans can follow, like, and comment.",
    },
  ],
  tips: [
    { title: "Plays & likes", body: "Every stream and like is tracked. Watch what's landing." },
    { title: "Top 100 chart", body: "The most-played tracks site-wide land on the Top 100 — a great goal." },
    { title: "Keep publishing", body: "Consistency beats perfection. Regular uploads keep your page fresh." },
  ],
  footerNote:
    "Artist access renews every 30 days from your last payment. Manage it anytime from the Upgrade page.",
};

export function mergeArtistWelcome(
  override: Partial<ArtistWelcomeContent> | null | undefined,
): ArtistWelcomeContent {
  if (!override) return ARTIST_WELCOME_DEFAULTS;
  return {
    headline: override.headline ?? ARTIST_WELCOME_DEFAULTS.headline,
    subhead: override.subhead ?? ARTIST_WELCOME_DEFAULTS.subhead,
    intro: override.intro ?? ARTIST_WELCOME_DEFAULTS.intro,
    steps:
      Array.isArray(override.steps) && override.steps.length > 0
        ? override.steps.map((s, i) => ({
            title: s?.title ?? ARTIST_WELCOME_DEFAULTS.steps[i]?.title ?? "",
            body: s?.body ?? ARTIST_WELCOME_DEFAULTS.steps[i]?.body ?? "",
          }))
        : ARTIST_WELCOME_DEFAULTS.steps,
    tips:
      Array.isArray(override.tips) && override.tips.length > 0
        ? override.tips.map((t, i) => ({
            title: t?.title ?? ARTIST_WELCOME_DEFAULTS.tips[i]?.title ?? "",
            body: t?.body ?? ARTIST_WELCOME_DEFAULTS.tips[i]?.body ?? "",
          }))
        : ARTIST_WELCOME_DEFAULTS.tips,
    footerNote: override.footerNote ?? ARTIST_WELCOME_DEFAULTS.footerNote,
  };
}
