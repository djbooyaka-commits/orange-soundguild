import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mp3DurationSeconds, mp4DurationSeconds, playsOverlap, requiredPlayMs } from "./audio-duration.ts";

const close = (v: number | null, want: number, tol: number) =>
  assert.ok(v != null && Math.abs(v - want) <= tol, `expected ~${want}, got ${v}`);

// One MPEG-1 Layer III, 320 kbps, 44.1 kHz, stereo frame header.
const HDR = [0xff, 0xfb, 0xe0, 0x00];
const FRAME_SIZE = Math.floor((1152 / 8) * 320000 / 44100); // 1044

function cbrHead(frames: number) {
  const b = new Uint8Array(FRAME_SIZE * frames);
  for (let f = 0; f < frames; f += 1) b.set(HDR, f * FRAME_SIZE);
  return b;
}

describe("song length", () => {
  it("measures a 320 kbps MP3 from its file size", () => {
    const total = 320000 / 8 * 180; // 3 minutes of 320 kbps audio
    close(mp3DurationSeconds(cbrHead(4), total), 180, 0.1);
  });

  it("skips an ID3 tag before the audio", () => {
    const tagLen = 2000;
    const id3 = new Uint8Array(10 + tagLen);
    id3.set([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, (tagLen >> 7) & 0x7f, tagLen & 0x7f]);
    const head = new Uint8Array(id3.length + FRAME_SIZE * 3);
    head.set(id3);
    head.set(cbrHead(3), id3.length);
    close(mp3DurationSeconds(head, id3.length + 40000 * 240), 240, 0.1);
  });

  it("uses the frame count from a Xing header", () => {
    const head = cbrHead(3);
    const x = 4 + 32;
    head.set([0x58, 0x69, 0x6e, 0x67, 0, 0, 0, 1], x);
    const frames = 9000; // 9000 * 1152 / 44100 ≈ 235.1 s
    head.set([0, 0, (frames >> 8) & 0xff, frames & 0xff], x + 8);
    close(mp3DurationSeconds(head, 99_999_999), 235.1, 0.1);
  });

  it("reads an M4A length", () => {
    const b = new Uint8Array(200);
    const at = 50;
    b.set([0x6d, 0x76, 0x68, 0x64], at); // "mvhd"
    b.set([0, 0, 1000 >> 8, 1000 & 0xff], at + 4 + 4 + 8); // timescale 1000
    const d = 200_500;
    b.set([0, (d >> 16) & 0xff, (d >> 8) & 0xff, d & 0xff], at + 4 + 4 + 12);
    close(mp4DurationSeconds(b), 200.5, 0.001);
  });

  it("returns nothing for files it can't read", () => {
    assert.equal(mp3DurationSeconds(new Uint8Array(500), 500), null);
    assert.equal(mp4DurationSeconds(new Uint8Array(500)), null);
  });
});

describe("full play needed for OSG room points", () => {
  it("a 3-minute song needs close to the full 3 minutes, not 30 seconds", () => {
    assert.equal(requiredPlayMs(180), 172_600);
    assert.ok(requiredPlayMs(180) > 30_000);
  });
  it("a 24-second clip can still earn, after about 21 seconds", () => {
    assert.equal(requiredPlayMs(23.8), 21_420);
  });
  it("a song with an unknown length falls back to 30 seconds", () => {
    assert.equal(requiredPlayMs(null), 30_000);
  });
  it("two songs playing at the same time overlap; back-to-back songs don't", () => {
    assert.equal(playsOverlap(0, 180_000, 90_000, 270_000), true);
    assert.equal(playsOverlap(0, 180_000, 180_000, 360_000), false);
  });
});
