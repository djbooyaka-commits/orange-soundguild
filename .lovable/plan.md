## What we're building

On the Curator page, Superfans submit Spotify playlists. Any signed-in user can connect their Spotify account. Whenever they stream a track *in full* from a submitted playlist, they earn 1 point.

## User flow

1. Superfan visits `/curator` → "My playlists" section → paste a Spotify playlist URL → saved to their list.
2. Any user visits `/curator` → "Connect Spotify" button → OAuth → returns connected.
3. When a connected user opens the site, we poll Spotify's `recently-played` in the background. For every track whose playback context matches a submitted curator playlist, we insert a stream-point row (deduped by `played_at`).
4. Points are shown to the listener ("Your Curator points"). Curators see total points earned across their playlists.

## Database

- `curator_playlists`: `curator_id`, `spotify_playlist_id`, `name`, `image_url`
- `spotify_connections`: `user_id` PK, `access_token`, `refresh_token`, `expires_at`, `scope`, `last_polled_at`, `spotify_user_id`
- `stream_points`: `user_id`, `curator_playlist_id`, `spotify_track_id`, `spotify_track_name`, `played_at`, unique on (`user_id`, `spotify_track_id`, `played_at`)

RLS: curators manage own playlists (public read of `name/image/curator_id`); `spotify_connections` — owner-only, tokens NEVER exposed to client (all reads server-side); `stream_points` — user reads own; curator reads points tied to their playlists via a security-definer view/RPC.

## Spotify OAuth

- Secrets: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`.
- Redirect URI: `https://orangesoundguild.com/api/public/spotify/callback` (user must add this to Spotify Dashboard).
- Scopes: `user-read-recently-played user-read-email`.
- Server route `/api/public/spotify/callback`: exchanges code, stores tokens keyed to the signed-in user (uses a short-lived signed `state` param carrying `user_id`).
- Server fn `getSpotifyAuthUrl` (auth required): returns URL with state.
- Server fn `pollSpotifyRecent` (auth required): refreshes token if expired, GETs `/me/player/recently-played?limit=50&after=last_polled_at`, filters items where `context.type === 'playlist'` and `context.uri`'s playlist id is in `curator_playlists`, inserts stream-points (ON CONFLICT DO NOTHING). Note: Spotify's `recently-played` only lists tracks played >30s, which is the standard "full stream" signal.

## UI

- `/curator`: unchanged gating (superfan for adding playlists).
- New section for everyone (any signed-in user): "Track your listens" card with Connect / Connected state and points total.
- Superfan section: "My submitted playlists" list + add form + total points earned.
- On mount for connected users: fire-and-forget `pollSpotifyRecent()`.

## Files

- Migration for 3 tables + RPCs (`add_curator_playlist`, `get_curator_points_for_me`, `get_curator_points_earned`).
- `src/lib/api/spotify.functions.ts`: `getSpotifyAuthUrl`, `pollSpotifyRecent`, `disconnectSpotify`, `getMySpotifyStatus`.
- `src/lib/api/curator.functions.ts`: `addCuratorPlaylist`, `removeCuratorPlaylist`, `listMyCuratorPlaylists`, `getCuratorEarnedPoints`.
- `src/routes/api/public/spotify/callback.ts`: OAuth callback.
- `src/routes/curator.tsx`: expanded with the sections above.
- `src/components/SpotifyConnectCard.tsx`, `src/components/CuratorPlaylistManager.tsx`.

## What you'll need to do after I build

1. Create app at developer.spotify.com/dashboard.
2. Add redirect URI: `https://orangesoundguild.com/api/public/spotify/callback` (and the preview URL if you want to test in preview).
3. Paste Client ID + Secret into the secure form I'll open.
