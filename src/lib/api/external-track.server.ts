/** Reads track title/artist for YouTube, Tidal, Apple Music and OSG links. */
export async function resolveExternalTrack(
  platform: string,
  url: string,
  supabaseAdmin: any,
): Promise<{ name: string; artist: string | null } | null> {
  try {
    if (platform === "osg") {
      const id = url.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0];
      if (!id) return null;
      const { data: t } = await supabaseAdmin.from("tracks").select("title, profiles(username)").eq("id", id).maybeSingle();
      if (!t) return null;
      return { name: t.title as string, artist: ((t as any).profiles?.username as string | null) ?? "Artist" };
    }
    if (platform === "youtube") {
      const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`);
      if (!r.ok) return null;
      const j = (await r.json()) as { title?: string; author_name?: string };
      if (!j.title) return null;
      const parts = j.title.split(/\s+[-–—]\s+/);
      if (parts.length >= 2) return { artist: parts[0].trim(), name: parts.slice(1).join(" - ").replace(/\s*[([](official|lyric|audio|video)[^)\]]*[)\]]/gi, "").trim() };
      return { name: j.title.trim(), artist: (j.author_name ?? "").replace(/\s*-\s*Topic$/i, "").trim() || null };
    }
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36", Accept: "text/html" },
    });
    if (r.ok) {
      const html = (await r.text()).slice(0, 300_000);
      const m = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ?? html.match(/<title>([^<]+)<\/title>/i);
      if (m) {
        const t = m[1].replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
          .replace(/\s+on Apple Music$/i, "").replace(/\s*\|\s*TIDAL$/i, "").trim();
        const by = t.match(/^(.+?)\s+(?:by|-)\s+(.+)$/i);
        if (by && !/^(tidal|apple music)$/i.test(t)) return { name: by[1].trim(), artist: by[2].trim() };
        if (t && !/^(tidal|apple music)$/i.test(t)) return { name: t, artist: null };
      }
    }
    // Fallback: slug from the URL path
    const seg = new URL(url).pathname.split("/").filter(Boolean);
    const slug = seg.find((p, i) => seg[i - 1] === "song" || seg[i - 1] === "album") ?? null;
    if (slug && !/^\d+$/.test(slug)) return { name: decodeURIComponent(slug).replace(/-/g, " "), artist: null };
    return { name: url.slice(0, 200), artist: null };
  } catch {
    return null;
  }
}
