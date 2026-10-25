// All Spotify playlists available for submission (Top 100 + genre playlists)
export const SPOTIFY_PLAYLISTS: { label: string; url: string }[] = [
  { label: "Spotify — Pioneer OSG Artist Top 100", url: "https://open.spotify.com/playlist/7eqF5QBIif2l1vPhygo5D2" },
  { label: "Spotify — Electronic OSG", url: "https://open.spotify.com/playlist/2YyW7Is4IYcDHDLj9pgD6r" },
  { label: "Spotify — House OSG", url: "https://open.spotify.com/playlist/5YlvupSOizFaf3jSaBnao2" },
  { label: "Spotify — Tech House OSG", url: "https://open.spotify.com/playlist/0ONyF4oaDRCXbxmFfLHvwH" },
  { label: "Spotify — Drum and Bass OSG", url: "https://open.spotify.com/playlist/2pg7mGn6IL4mADLuEIL0Wn" },
  { label: "Spotify — Afro House OSG", url: "https://open.spotify.com/playlist/4xGLfF8xfgwWACQ3cKFMTh" },
  { label: "Spotify — Afrobeats OSG", url: "https://open.spotify.com/playlist/1zSf4QGvsZ1m3L5U6YfNsf" },
  { label: "Spotify — Hip-Hop OSG", url: "https://open.spotify.com/playlist/51xKogbXRFuNpK92lKSDNx" },
  { label: "Spotify — Lo-fi OSG", url: "https://open.spotify.com/playlist/5ahIniapvTvsoHVjDIg33w" },
  { label: "Spotify — Indie OSG", url: "https://open.spotify.com/playlist/230BlC0Ifpvr5XokfaIZgH" },
  { label: "Spotify — Ambient OSG", url: "https://open.spotify.com/playlist/5Vfv2vXvuaBl9lYhdY6Tga" },
  { label: "Spotify — Jazz OSG", url: "https://open.spotify.com/playlist/3anGG0pJCA7O33i6fQuCka" },
  { label: "Spotify — Techno OSG", url: "https://open.spotify.com/playlist/2lpPDZcwgwErZvasX61Om6" },
  { label: "Spotify — Psytrance OSG", url: "https://open.spotify.com/playlist/2cbeHywboh5bVyDV29mf0k" },
  { label: "Spotify — POP OSG", url: "https://open.spotify.com/playlist/0dGqgXJyGCSVp8E8eTxASv" },
  { label: "Spotify — Rock OSG", url: "https://open.spotify.com/playlist/47nZXoBHtvvYXtuZ5iUGXc" },
  { label: "Spotify — R&B OSG", url: "https://open.spotify.com/playlist/1tICZK79ENqcmSrGrrYDaC" },
];

export const APPLE_PLAYLIST = { label: "Apple Music — Pioneer OSG Artist Top 100", url: "https://music.apple.com/ph/playlist/pioneer-osg-artist-top-100-artist/pl.u-b3b8aj7TKYEGe7b" };
export const YOUTUBE_PLAYLIST = { label: "YouTube Music — Pioneer OSG Artist Top 100", url: "https://music.youtube.com/playlist?list=PLDuxOnqbSQ2U" };
export const TIDAL_PLAYLIST = { label: "Tidal — Pioneer OSG Artist Top 100", url: "https://tidal.com/playlist/74192aba-7563-4520-83b9-33ca73b4527a" };


const ALL = [...SPOTIFY_PLAYLISTS, APPLE_PLAYLIST, YOUTUBE_PLAYLIST, TIDAL_PLAYLIST];

/** Genre of an official OSG playlist link ("Top 100" for the Pioneer list), or "Other". */
export function genreForPlaylistUrl(url: string): string {
  const found = ALL.find((p) => p.url === url);
  if (!found) return "Other";
  if (/top 100/i.test(found.label)) return "Top 100";
  return found.label.replace(/^Spotify — /, "").replace(/ OSG$/, "");
}
