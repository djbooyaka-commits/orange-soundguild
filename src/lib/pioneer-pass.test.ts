import { test } from "node:test";
import assert from "node:assert/strict";
import { pioneerHasEnoughTracks, pioneerTracksNeeded } from "./pioneer-pass.ts";

test("a Pioneer with 4 uploaded tracks does not unlock the free pass", () => {
  assert.equal(pioneerHasEnoughTracks(4), false);
  assert.equal(pioneerTracksNeeded(4), 1);
});
test("a Pioneer with 5 uploaded tracks unlocks the free pass", () => {
  assert.equal(pioneerHasEnoughTracks(5), true);
  assert.equal(pioneerTracksNeeded(5), 0);
});
test("a Pioneer with no uploads needs 5 tracks", () => {
  assert.equal(pioneerTracksNeeded(0), 5);
});
