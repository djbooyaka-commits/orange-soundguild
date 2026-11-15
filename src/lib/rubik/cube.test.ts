import { test, expect } from "bun:test";
import { solvedCube, applyAlg, parseAlg, invertAlg, isSolved, scramble, currentStage } from "./cube";
test("sexy move six times returns to solved", () => {
  expect(isSolved(applyAlg(solvedCube(), parseAlg("R U R' U' ".repeat(6))))).toBe(true);
});
test("scramble then inverse solves", () => {
  const s = scramble(25);
  expect(isSolved(applyAlg(applyAlg(solvedCube(), s), invertAlg(s)))).toBe(true);
});
test("stage detection", () => {
  expect(currentStage(solvedCube())).toBe(6);
  expect(currentStage(applyAlg(solvedCube(), parseAlg("F R U R' U' F'")))).toBe(3);
  expect(currentStage(applyAlg(solvedCube(), parseAlg("D")))).toBe(0);
});
