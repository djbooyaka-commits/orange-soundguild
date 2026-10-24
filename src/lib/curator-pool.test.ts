import { describe, it as test } from "node:test";
import { deepStrictEqual as equal } from "node:assert";
import { curatorPoolMembership } from "./curator-pool";

describe("Curator Pool membership", () => {
  test("an opted-in Spotify playlist makes its curator a member", () => {
    equal(curatorPoolMembership(1, 0), { joined: true, playlistCount: 1 });
  });
  test("an opted-in Last.fm playlist makes its curator a member", () => {
    equal(curatorPoolMembership(0, 1), { joined: true, playlistCount: 1 });
  });
  test("without any opted-in playlists the curator is not a member", () => {
    equal(curatorPoolMembership(0, 0), { joined: false, playlistCount: 0 });
  });
});