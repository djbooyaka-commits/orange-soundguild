import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BASE_URL = "https://orangesoundguild.com";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

const STATIC_ENTRIES: SitemapEntry[] = [
  { path: "/", changefreq: "daily", priority: "1.0" },
  { path: "/top100", changefreq: "daily", priority: "0.9" },
  { path: "/discover", changefreq: "daily", priority: "0.8" },
  { path: "/posts", changefreq: "hourly", priority: "0.7" },
  { path: "/superfans", changefreq: "monthly", priority: "0.5" },
  { path: "/search", changefreq: "weekly", priority: "0.6" },
  { path: "/upgrade", changefreq: "monthly", priority: "0.4" },
  { path: "/auth", changefreq: "yearly", priority: "0.3" },
  { path: "/terms", changefreq: "yearly", priority: "0.3" },
];

const enc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const seg = (s: string) => encodeURIComponent(s);

function publicClient() {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key =
    process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

async function dynamicEntries(): Promise<SitemapEntry[]> {
  const supabase = publicClient();
  if (!supabase) return [];
  const entries: SitemapEntry[] = [];

  try {
    const [tracksRes, profilesRes] = await Promise.all([
      supabase
        .from("tracks")
        .select("id, album, user_id, created_at")
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("profiles").select("id, username").limit(5000),
    ]);

    const handleById = new Map<string, string>();
    for (const p of profilesRes.data ?? []) {
      if (p.username) handleById.set(p.id, p.username);
    }

    for (const handle of handleById.values()) {
      entries.push({ path: `/u/${seg(handle)}`, changefreq: "weekly", priority: "0.7" });
    }

    const albums = new Set<string>();
    for (const t of tracksRes.data ?? []) {
      entries.push({
        path: `/t/${t.id}`,
        lastmod: t.created_at ? new Date(t.created_at).toISOString().slice(0, 10) : undefined,
        changefreq: "weekly",
        priority: "0.8",
      });
      const handle = handleById.get(t.user_id);
      if (handle && t.album) {
        const path = `/album/${seg(handle)}/${seg(t.album)}`;
        if (!albums.has(path)) {
          albums.add(path);
          entries.push({ path, changefreq: "weekly", priority: "0.6" });
        }
      }
    }
  } catch {
    return entries;
  }

  return entries;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries = [...STATIC_ENTRIES, ...(await dynamicEntries())];

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${enc(BASE_URL + e.path)}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=1800",
          },
        });
      },
    },
  },
});
