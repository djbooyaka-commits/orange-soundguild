import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMove, applyAlg, parseAlg, solvedCube, type Vec } from "./cube";
import { sameCube } from "./solver";
import { swipeToMove, tapToMove, viewMove, viewText } from "./view";

const F: Vec = [0, 0, 1];

test("tapping the front side turns it clockwise", () => {
  assert.deepEqual(tapToMove(F), { face: "F", turns: 1 });
  assert.deepEqual(tapToMove(F, true), { face: "F", turns: 3 });
});

test("swiping the front top row to the right is U'", () => {
  assert.deepEqual(swipeToMove([0, 1, 1], F, [1, 0, 0]), { face: "U", turns: 3 });
});

test("swiping the front right column up is R", () => {
  assert.deepEqual(swipeToMove([1, -1, 1], F, [0, 1, 0]), { face: "R", turns: 1 });
});

test("swiping the front middle row does nothing", () => {
  assert.equal(swipeToMove([0, 0, 1], F, [1, 0, 0]), null);
});

test("a swipe and the opposite swipe cancel out", () => {
  const a = swipeToMove([1, 1, 1], [0, 1, 0], [0, 0, -1])!;
  const b = swipeToMove([1, 1, 1], [0, 1, 0], [0, 0, 1])!;
  assert.ok(sameCube(applyMove(applyMove(solvedCube(), a), b), solvedCube()));
});

test("White on top: the top button turns the white side, and labels swap top/bottom and left/right", () => {
  assert.deepEqual(viewMove({ face: "U", turns: 1 }, true), { face: "D", turns: 1 });
  assert.deepEqual(viewMove({ face: "R", turns: 3 }, true), { face: "L", turns: 3 });
  assert.deepEqual(viewMove({ face: "F", turns: 2 }, true), { face: "F", turns: 2 });
  assert.equal(viewText("Repeat R U R' U' with white on the bottom, back-left.", true), "Repeat L D L' D' with white on the top, back-right.");
  assert.equal(viewText("Turn the top (U), then F2 B2.", true), "Turn the bottom (D), then F2 B2.");
  assert.equal(viewText("Look at the Lesson", true), "Look at the Lesson");
  assert.equal(viewText("R U", false), "R U");
});

test("White-on-top letters still solve the same cube when read back", () => {
  const alg = parseAlg("R U R' U' F2 L D'");
  const shown = alg.map((m) => viewMove(m, true));
  assert.ok(sameCube(applyAlg(solvedCube(), shown.map((m) => viewMove(m, true))), applyAlg(solvedCube(), alg)));
});
