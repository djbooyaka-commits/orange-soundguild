export function curatorPoolMembership(spotifyCount: number, lastfmCount: number) {
  const playlistCount = spotifyCount + lastfmCount;
  return { joined: playlistCount > 0, playlistCount };
}