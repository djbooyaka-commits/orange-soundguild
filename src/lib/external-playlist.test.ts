import { test } from "node:test";
import assert from "node:assert/strict";
import { parseApplePlaylistPage, parseTidalApiItems, parseTidalEmbed, tidalPlaylistId } from "./external-playlist.ts";

const applePage = (sections: unknown[]) =>
  `<html><script type="application/json" id="serialized-server-data">${JSON.stringify({
    data: [{ data: { sections } }],
  })}</script></html>`;

test("reads every Apple Music song with its full artist credit and the playlist name", () => {
  const html = applePage([
    { itemKind: "containerDetailHeaderLockup", items: [{ title: "Orange Sound Guild Radio Weekly" }] },
    {
      itemKind: "trackLockup",
      items: [
        { title: "House Thing", artistName: "Rikki Mae & OM BooyakaMix" },
        { title: "Bring It Back", subtitleLinks: [{ title: "Kikoman Antonio" }] },
      ],
    },
    { itemKind: "bubbleLockup", items: [{ title: "Not a song", artistName: "Someone" }] },
  ]);
  assert.deepEqual(parseApplePlaylistPage(html), {
    name: "Orange Sound Guild Radio Weekly",
    tracks: [
      { artist: "Rikki Mae & OM BooyakaMix", name: "House Thing" },
      { artist: "Kikoman Antonio", name: "Bring It Back" },
    ],
  });
});

test("an unreadable Apple Music page gives no songs instead of crashing", () => {
  assert.deepEqual(parseApplePlaylistPage("<html>blocked</html>"), { tracks: [], name: null });
});

test("reads the Tidal playlist id from tidal.com and listen.tidal.com links", () => {
  const id = "685f22b0-6670-4c8a-9533-3f1072e43ff0";
  assert.equal(tidalPlaylistId(`https://tidal.com/playlist/${id}`), id);
  assert.equal(tidalPlaylistId(`https://listen.tidal.com/playlist/${id}?u`), id);
  assert.equal(tidalPlaylistId(`https://tidal.com/browse/playlist/${id}`), id);
  assert.equal(tidalPlaylistId("https://tidal.com/browse/track/12345"), null);
});

test("Tidal songs use the main artist and keep the version in the title", () => {
  const items = parseTidalApiItems({
    items: [
      { title: "Block List (feat. Oddball Savage)", version: null, artist: { name: "OM BooyakaMix" } },
      { title: "Dream2", version: "Remix", artists: [{ name: "Haseena" }] },
      { title: "", artist: { name: "Nobody" } },
    ],
  });
  assert.deepEqual(items, [
    { artist: "OM BooyakaMix", name: "Block List (feat. Oddball Savage)" },
    { artist: "Haseena", name: "Dream2 (Remix)" },
  ]);
});

test("Tidal embed fallback reads songs from the player data", () => {
  const html = `<script>window.tidalCountryCode='BE';window.tidalMediaSessionMetadata={"1":{"album":"A","artist":"Kikoman Antonio","title":"Need To Understand"},"2":{"artist":"x","title":"y \\"z\\""}};</script>`;
  assert.deepEqual(parseTidalEmbed(html), [
    { artist: "Kikoman Antonio", name: "Need To Understand" },
    { artist: "x", name: 'y "z"' },
  ]);
});
