import { test } from "node:test";
import assert from "node:assert/strict";
import { solvedCube, applyAlg, parseAlg, invertAlg, isSolved, scramble, currentStage } from "./cube";
test("sexy move six times returns to solved", () => {
  assert.equal(isSolved(applyAlg(solvedCube(), parseAlg("R U R' U' ".repeat(6)))), true);
});
test("scramble then inverse solves", () => {
  const s = scramble(25);
  assert.equal(isSolved(applyAlg(applyAlg(solvedCube(), s), invertAlg(s))), true);
});
test("stage detection", () => {
  assert.equal(currentStage(solvedCube()), 6);
  assert.equal(currentStage(applyAlg(solvedCube(), parseAlg("F R U R' U' F'"))), 3);
  assert.equal(currentStage(applyAlg(solvedCube(), parseAlg("D"))), 0);
});
