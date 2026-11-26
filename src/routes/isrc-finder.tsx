import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Navbar } from "@/components/Navbar";
import { AdSlotScript } from "@/components/AdSlotScript";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Search } from "lucide-react";
import { toast } from "sonner";
import { lookupIsrc, type IsrcResult, type IsrcTrack } from "@/lib/api/isrc.functions";

export const Route = createFileRoute("/isrc-finder")({
  head: () => ({
    meta: [
      { title: "Free ISRC & UPC Finder — Orange Sound Guild" },
      { name: "description", content: "Find song ISRC codes and album UPC barcodes for free on Orange Sound Guild. Search by title, Spotify link or code. No sign-in required." },
      { property: "og:title", content: "Free ISRC & UPC Finder — Orange Sound Guild" },
      { property: "og:description", content: "Find song ISRC codes and album UPC barcodes by title, Spotify link or code. Free public lookup, no sign-in required." },
      { property: "og:url", content: "https://orangesoundguild.com/isrc-finder" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Free ISRC & UPC Finder — Orange Sound Guild" },
      { name: "twitter:description", content: "Free public lookup for song ISRC codes and album UPC barcodes. No sign-in required." },
    ],
    links: [{ rel: "canonical", href: "https://orangesoundguild.com/isrc-finder" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: "Orange Sound Guild ISRC & UPC Finder",
        url: "https://orangesoundguild.com/isrc-finder",
        description: "A free public tool to look up song ISRC codes and album UPC barcodes using Spotify links, titles or codes.",
        applicationCategory: "MultimediaApplication",
        operatingSystem: "Any",
        browserRequirements: "Requires a web browser and internet connection",
        offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        publisher: { "@type": "Organization", name: "Orange Sound Guild", url: "https://orangesoundguild.com" },
      }),
    }],
  }),
  component: IsrcFinder,
});

function CodeChip({ label, code }: { label: string; code: string | null }) {
  if (!code) return <span className="text-xs text-muted-foreground">{label}: not listed</span>;
  return (
    <button type="button" onClick={() => { navigator.clipboard.writeText(code); toast.success(`${label} copied`); }}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 font-mono text-xs hover:bg-accent">
      <span className="text-muted-foreground">{label}</span>{code}<Copy className="h-3 w-3" />
    </button>
  );
}

function TrackRow({ t, showArt = true }: { t: IsrcTrack; showArt?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
      {showArt && t.image && <img src={t.image} alt="" className="h-12 w-12 rounded object-cover" loading="lazy" />}
      {!showArt && <span className="w-6 text-right text-xs text-muted-foreground">{t.trackNumber}</span>}
      <div className="min-w-0 flex-1">
        <a href={t.url} target="_blank" rel="noreferrer" className="block truncate font-medium hover:underline">{t.name}</a>
        <p className="truncate text-xs text-muted-foreground">{t.artists}{showArt && t.album ? ` · ${t.album}` : ""}{showArt && t.released ? ` · ${t.released}` : ""}</p>
      </div>
      <CodeChip label="ISRC" code={t.isrc} />
    </div>
  );
}

function IsrcFinder() {
  const lookup = useServerFn(lookupIsrc);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"track" | "album">("track");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<IsrcResult | null>(null);

  const run = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try { setRes(await lookup({ data: { q, type } })); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <AdSlotScript contentKey="ad_script_isrc_top" hideWhenEmpty className="mb-6" />
        <h1 className="text-3xl font-bold">ISRC & UPC Finder</h1>
        <p className="mt-1 text-sm text-muted-foreground">Search a song or album name, paste a Spotify link, or enter an ISRC/UPC to find what it belongs to.</p>
        <form onSubmit={run} className="mt-6 space-y-3">
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Song, album, Spotify link, ISRC or UPC" />
            <Button type="submit" disabled={busy}><Search className="mr-1 h-4 w-4" />{busy ? "Searching…" : "Find"}</Button>
          </div>
          <div className="flex gap-2 text-sm">
            {(["track", "album"] as const).map((k) => (
              <Button key={k} type="button" size="sm" variant={type === k ? "default" : "outline"} onClick={() => setType(k)}>
                {k === "track" ? "Songs (ISRC)" : "Albums (UPC)"}
              </Button>
            ))}
          </div>
        </form>
        <AdSlotScript contentKey="ad_script_isrc_middle" hideWhenEmpty className="mt-6" />

        <section className="mt-6 space-y-3">
          {res?.error && <p className="text-sm text-destructive">{res.error}</p>}
          {res && !res.error && !res.tracks.length && !res.albums.length && <p className="text-sm text-muted-foreground">No results found.</p>}
          {res?.tracks.map((t) => <TrackRow key={t.id} t={t} />)}
          {res?.albums.map((a) => (
            <div key={a.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex gap-4">
                {a.image && <img src={a.image} alt="" className="h-24 w-24 rounded object-cover" loading="lazy" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <a href={a.url} target="_blank" rel="noreferrer" className="block text-lg font-semibold hover:underline">{a.name}</a>
                  <p className="text-sm text-muted-foreground">{a.artists}{a.released ? ` · ${a.released}` : ""}{a.label ? ` · ${a.label}` : ""} · {a.totalTracks} tracks</p>
                  <div className="flex flex-wrap gap-2 pt-1"><CodeChip label="UPC" code={a.upc} />{a.ean && <CodeChip label="EAN" code={a.ean} />}</div>
                </div>
              </div>
              <div className="mt-3 space-y-2">{a.tracks.map((t) => <TrackRow key={t.id} t={t} showArt={false} />)}</div>
            </div>
          ))}
        </section>
        <section aria-labelledby="codes-heading" className="mt-10 border-t border-border pt-8">
          <h2 id="codes-heading" className="text-xl font-semibold">Song ISRC codes & album UPC barcodes</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Orange Sound Guild’s free ISRC & UPC Finder looks up existing recording and release identifiers from Spotify’s catalog. It does not issue new codes or assign identifiers to music uploaded to Orange Sound Guild.
          </p>
          <div className="mt-6 space-y-5 text-sm leading-relaxed">
            <div>
              <h3 className="font-semibold">What is an ISRC?</h3>
              <p className="mt-1 text-muted-foreground">An International Standard Recording Code is a 12-character identifier for a specific sound recording. Different recordings or versions of a song can have different ISRCs.</p>
            </div>
            <div>
              <h3 className="font-semibold">What is a UPC?</h3>
              <p className="mt-1 text-muted-foreground">A Universal Product Code identifies a release, such as a single, EP or album. A release’s tracks have their own ISRCs, while the release has a UPC or other barcode such as an EAN.</p>
            </div>
            <div>
              <h3 className="font-semibold">Does this Finder require an account?</h3>
              <p className="mt-1 text-muted-foreground">The Finder is free and public. No Orange Sound Guild account or Spotify sign-in is required.</p>
            </div>
            <div>
              <h3 className="font-semibold">Why might a code be missing?</h3>
              <p className="mt-1 text-muted-foreground">Results depend on the identifiers available in Spotify’s catalog. Music not listed there may not appear, and some releases do not expose every code. For missing identifiers, check with the artist’s distributor or record label.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
