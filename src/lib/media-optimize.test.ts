import { test } from "node:test";
import assert from "node:assert/strict";
import { conversionPatch, isValidMp3Target, isWavPath, mp3PathFor } from "./media-optimize";

test("only .wav audio paths are picked up", () => {
  assert.equal(isWavPath("u/1783322263199-Spirit.wav"), true);
  assert.equal(isWavPath("u/1783322263199-Spirit.WAV"), true);
  assert.equal(isWavPath("u/1783322263199-Spirit.mp3"), false);
  assert.equal(isWavPath("u/wavy-song.mp3"), false);
});

test("MP3 goes into the owner's folder with an .mp3 name", () => {
  assert.equal(
    mp3PathFor("owner", "owner/1783322263199-Spirit_Of_The_Age.wav", 1800000000000),
    "owner/1800000000000-Spirit_Of_The_Age.mp3",
  );
});

test("uploaded MP3 must be in the owner's folder", () => {
  assert.equal(isValidMp3Target("owner", "owner/1-a.mp3"), true);
  assert.equal(isValidMp3Target("owner", "other/1-a.mp3"), false);
  assert.equal(isValidMp3Target("owner", "owner/1-a.wav"), false);
  assert.equal(isValidMp3Target("owner", "owner/../other/a.mp3"), false);
});

test("WAV becomes the original download when none is set", () => {
  assert.deepEqual(conversionPatch("o/a.wav", "o/a.mp3", null), {
    audio_url: "o/a.mp3",
    download_lossless_url: "o/a.wav",
  });
});

test("an existing original download is kept", () => {
  assert.deepEqual(conversionPatch("o/a.wav", "o/a.mp3", "o/master.flac"), {
    audio_url: "o/a.mp3",
    download_lossless_url: "o/master.flac",
  });
});
