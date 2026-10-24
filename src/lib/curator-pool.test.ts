import { describe, expect, test } from "bun:test";
import { curatorPoolMembership } from "./curator-pool";

describe("Curator Pool membership", () => {
  test("an opted-in Spotify playlist makes its curator a member", () => {
    expect(curatorPoolMembership(1, 0)).toEqual({ joined: true, playlistCount: 1 });
  });
  test("an opted-in Last.fm playlist makes its curator a member", () => {
    expect(curatorPoolMembership(0, 1)).toEqual({ joined: true, playlistCount: 1 });
  });
  test("without any opted-in playlists the curator is not a member", () => {
    expect(curatorPoolMembership(0, 0)).toEqual({ joined: false, playlistCount: 0 });
  });
});