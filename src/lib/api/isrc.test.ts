import { describe, it, expect } from "vitest";
import { parseIsrcQuery } from "./isrc.functions";
describe("parseIsrcQuery", () => {
  it("reads an ISRC with dashes", () => expect(parseIsrcQuery("US-RC1-76-07839")).toEqual({ kind: "isrc", code: "USRC17607839" }));
  it("reads a UPC", () => expect(parseIsrcQuery("602537351169")).toEqual({ kind: "upc", code: "602537351169" }));
  it("reads a Spotify album link", () => expect(parseIsrcQuery("https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=x")).toEqual({ kind: "album", id: "4aawyAB9vmqN3uQ7FjRGTy" }));
  it("treats words as a text search", () => expect(parseIsrcQuery("Hoop").kind).toBe("text"));
});
