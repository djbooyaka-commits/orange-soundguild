import { describe, it } from "node:test";
import { deepStrictEqual as equal } from "node:assert";
import { parseIsrcQuery } from "./isrc.functions";
describe("parseIsrcQuery", () => {
  it("reads an ISRC with dashes", () => equal(parseIsrcQuery("US-RC1-76-07839"), { kind: "isrc", code: "USRC17607839" }));
  it("reads a UPC", () => equal(parseIsrcQuery("602537351169"), { kind: "upc", code: "602537351169" }));
  it("reads a Spotify album link", () => equal(parseIsrcQuery("https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=x"), { kind: "album", id: "4aawyAB9vmqN3uQ7FjRGTy" }));
  it("treats words as a text search", () => equal(parseIsrcQuery("Hoop").kind, "text"));
});
