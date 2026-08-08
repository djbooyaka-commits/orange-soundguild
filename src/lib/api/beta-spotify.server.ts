// Server-only Spotify helpers for the BETA stream tracker sandbox.
// Deliberately duplicated from the live tracker so the working system is untouched.

async function getCreds(userId: string, supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from("spotify_user_apps")
    .select("client_id, client_secret")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.client_id && data?.client_secret) {
    return { clientId: data.client_id as string, clientSecret: data.client_secret as string };
  }
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("Spotify not configured");
  return { clientId, clientSecret };
}

/** Returns a valid access token for the user, refreshing if needed, or null if not connected. */
export async function getBetaAccessToken(
  userId: string,
  supabaseAdmin: any,
): Promise<string | null> {
  const { data: conn } = await supabaseAdmin
    .from("spotify_connections")
    .select("user_id, access_token, refresh_token, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn) return null;

  if (Date.now() < new Date(conn.expires_at).getTime() - 30_000) {
    return conn.access_token as string;
  }

  const { clientId, clientSecret } = await getCreds(userId, supabaseAdmin);
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
    }),
  });
  if (!res.ok) {
    console.error(`Beta Spotify refresh failed [${res.status}]: ${await res.text()}`);
    return null;
  }
  const json = await res.json();
  const newAccess = json.access_token as string;
  await supabaseAdmin
    .from("spotify_connections")
    .update({
      access_token: newAccess,
      refresh_token: (json.refresh_token as string) || conn.refresh_token,
      expires_at: new Date(Date.now() + (json.expires_in as number) * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  return newAccess;
}

/** Pages backwards through recently-played until `afterMs` is reached. */
export async function fetchRecentlyPlayed(accessToken: string, afterMs: number) {
  const items: any[] = [];
  let before: number | null = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL("https://api.spotify.com/v1/me/player/recently-played");
    url.searchParams.set("limit", "50");
    if (before == null) url.searchParams.set("after", String(afterMs));
    else url.searchParams.set("before", String(before));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`Beta recently-played failed [${res.status}]: ${text}`);
      return {
        items,
        error: res.status === 403 ? "spotify_account_not_allowed" : `spotify_${res.status}`,
      };
    }
    const body = await res.json();
    const pageItems: any[] = body.items ?? [];
    if (pageItems.length === 0) break;
    items.push(...pageItems);
    const oldest = Math.min(...pageItems.map((i) => new Date(i.played_at).getTime()));
    if (pageItems.length < 50 || oldest <= afterMs) break;
    before = oldest;
  }
  return { items, error: null as string | null };
}

export function parseSpotifyTrackId(input: string): string | null {
  const raw = input.trim();
  const uri = raw.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (uri) return uri[1];
  const url = raw.match(/open\.spotify\.com\/(?:[a-z-]+\/)?track\/([A-Za-z0-9]{22})/);
  if (url) return url[1];
  if (/^[A-Za-z0-9]{22}$/.test(raw)) return raw;
  return null;
}

export function parseSpotifyPlaylistId(input: string): string | null {
  const raw = input.trim();
  const uri = raw.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (uri) return uri[1];
  const url = raw.match(/open\.spotify\.com\/(?:[a-z-]+\/)?playlist\/([A-Za-z0-9]+)/);
  if (url) return url[1];
  if (/^[A-Za-z0-9]{16,}$/.test(raw)) return raw;
  return null;
}

/** Client-credentials token — enough to read public playlists (no user OAuth). */
export async function getBetaAppToken(): Promise<string | null> {
  const clientId = process.env["SPOTIFY_CLIENT_ID"];
  const clientSecret = process.env["SPOTIFY_CLIENT_SECRET"];
  if (!clientId || !clientSecret) return null;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });
  if (!res.ok) {
    console.error(`Beta app token failed [${res.status}]`);
    return null;
  }
  const json = await res.json();
  return (json.access_token as string) ?? null;
}

export async function fetchBetaPlaylistMeta(token: string, playlistId: string) {
  const res = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}?fields=name,images(url)`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const json = await res.json();
  return {
    name: (json.name as string) ?? "Playlist",
    imageUrl: (json.images?.[0]?.url as string | undefined) ?? null,
  };
}

type PublicPlaylistEntity = {
  name?: string;
  title?: string;
  coverArt?: { sources?: Array<{ url?: string }> };
  trackList?: Array<{ uri?: string; title?: string; subtitle?: string }>;
};

type PublicPlaylistPage = {
  entity: PublicPlaylistEntity | null;
  accessToken: string | null;
};

type PublicPlaylistApiTrack = {
  name?: string;
  uri?: string;
  artists?: { items?: Array<{ profile?: { name?: string } }> };
};

type PublicPlaylistApiPage = {
  data?: {
    playlistV2?: {
      content?: {
        items?: Array<{ itemV2?: { data?: PublicPlaylistApiTrack } }>;
        totalCount?: number;
      };
    };
  };
};

async function fetchBetaPublicPlaylistPage(playlistId: string): Promise<PublicPlaylistPage> {
  const res = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) return { entity: null, accessToken: null };

  const html = await res.text();
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/,
  );
  if (!match?.[1]) return { entity: null, accessToken: null };

  try {
    const page = JSON.parse(match[1]) as {
      props?: {
        pageProps?: {
          state?: {
            data?: { entity?: PublicPlaylistEntity };
            settings?: { session?: { accessToken?: string } };
          };
        };
      };
    };
    const state = page.props?.pageProps?.state;
    return {
      entity: state?.data?.entity ?? null,
      accessToken: state?.settings?.session?.accessToken ?? null,
    };
  } catch {
    return { entity: null, accessToken: null };
  }
}

async function fetchBetaPublicPlaylist(playlistId: string): Promise<PublicPlaylistEntity | null> {
  return (await fetchBetaPublicPlaylistPage(playlistId)).entity;
}

export async function fetchBetaPublicPlaylistMeta(playlistId: string) {
  const entity = await fetchBetaPublicPlaylist(playlistId);
  if (!entity) return null;
  return {
    name: entity.name ?? entity.title ?? "Playlist",
    imageUrl: entity.coverArt?.sources?.[0]?.url ?? null,
  };
}

export async function fetchBetaPublicPlaylistTracks(
  playlistId: string,
): Promise<Array<{ id: string; name: string; artist: string }>> {
  const { entity, accessToken } = await fetchBetaPublicPlaylistPage(playlistId);

  const seen = new Set<string>();
  const out: Array<{ id: string; name: string; artist: string }> = [];
  const push = (t: { id: string; name: string; artist: string }) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    out.push(t);
  };

  for (const track of entity?.trackList ?? []) {
    const id = track.uri?.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1];
    if (id) push({ id, name: track.title ?? "", artist: track.subtitle ?? "" });
  }

  // The embed payload only ships the first 100 tracks. Spotify's REST playlist
  // endpoint now rate-limits this public token for hours at a time, so page the
  // same public data source used by Spotify's web player instead.
  if (accessToken) {
    const pageSize = 100;
    for (let offset = out.length; offset < 10_000; offset += pageSize) {
      const res = await fetch("https://api-partner.spotify.com/pathfinder/v2/query", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "app-platform": "WebPlayer",
        },
        body: JSON.stringify({
          variables: {
            uri: `spotify:playlist:${playlistId}`,
            offset,
            limit: pageSize,
            includeEpisodeContentRatingsV2: true,
          },
          operationName: "fetchPlaylistContents",
          extensions: {
            persistedQuery: {
              version: 1,
              sha256Hash: "e4b2953f160e58e38ac025d79b5a9b3aceee5c4c716598e9830bfceb69faff5f",
            },
          },
        }),
      });
      if (!res.ok) {
        console.error(`Beta public playlist page failed [${res.status}] at offset ${offset}`);
        break;
      }

      const body = (await res.json()) as PublicPlaylistApiPage;
      const content = body.data?.playlistV2?.content;
      const items = content?.items ?? [];
      for (const item of items) {
        const track = item.itemV2?.data;
        const id = track?.uri?.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1];
        if (!id) continue;
        push({
          id,
          name: track?.name ?? "",
          artist: (track?.artists?.items ?? [])
            .map((artist) => artist.profile?.name)
            .filter((name): name is string => Boolean(name))
            .join(", "),
        });
      }

      const total = content?.totalCount ?? offset + items.length;
      if (items.length < pageSize || offset + items.length >= total) break;
    }
  }

  return out;
}


export async function fetchBetaPlaylistTracks(
  token: string,
  playlistId: string,
): Promise<{ items: Array<{ id: string; name: string; artist: string }>; error: string | null }> {
  const out: Array<{ id: string; name: string; artist: string }> = [];
  // Spotify now returns 403 on the legacy /tracks list endpoint; /items is the supported one
  // and requires a user-authorized token (client-credentials gets 401).
  let url: string | null =
    `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100&additional_types=track`;
  // Page through the entire playlist (100 pages x 100 = up to 10k tracks).
  for (let page = 0; page < 100 && url; page++) {
    let res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok && page === 0) {
      // Some tokens/playlists still only work on the legacy /tracks endpoint.
      res = await fetch(
        `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100&additional_types=track`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
    }
    if (!res.ok) {
      console.error(`Beta playlist items failed [${res.status}] for ${playlistId}`);
      return { items: out, error: `spotify_${res.status}` };
    }
    const body: any = await res.json();
    for (const it of body.items ?? []) {
      const t = it?.track;
      if (!t?.id) continue;
      out.push({
        id: t.id as string,
        name: (t.name as string) ?? "",
        artist: ((t.artists ?? []).map((a: any) => a.name).join(", ") as string) ?? "",
      });
    }
    url = (body.next as string | null) ?? null;
  }
  return { items: out, error: null };
}

export async function betaPlaylistContainsTrack(
  token: string,
  playlistId: string,
  trackId: string,
): Promise<boolean> {
  const { items } = await fetchBetaPlaylistTracks(token, playlistId);
  return items.some((t) => t.id === trackId);
}

export async function betaAddTrackToPlaylist(
  token: string,
  playlistId: string,
  trackId: string,
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`https://api.spotify.com/v1/playlists/${playlistId}/items`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uris: [`spotify:track:${trackId}`] }),
  });
  if (!res.ok) return { ok: false, error: `spotify_${res.status}` };

  return { ok: true };
}
