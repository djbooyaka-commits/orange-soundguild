import { test } from "node:test";
import assert from "node:assert/strict";
import { solvedCube, applyAlg, isSolved, scramble, currentStage } from "./cube";
import { solveCube } from "./solver";

function rng(seed: number) { return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648); }

test("solved cube needs no steps", () => {
  assert.equal(solveCube(solvedCube()).length, 0);
});

test("solver solves 150 random scrambles and stages never go backwards", { timeout: 30000 }, () => {
  const r = rng(42);
  for (let i = 0; i < 150; i++) {
    let cube = applyAlg(solvedCube(), scramble(25, r));
    const steps = solveCube(cube);
    let prevStage = 0;
    for (const s of steps) {
      assert.ok(s.stage >= prevStage, "steps follow the lesson order");
      prevStage = s.stage;
      cube = applyAlg(cube, s.moves);
      assert.ok(currentStage(cube) >= s.stage, "each step keeps earlier stages done");
    }
    assert.equal(isSolved(cube), true, `scramble ${i} solved`);
  }
});

test("no step wastes moves by turning the same side twice in a row", () => {
  const r = rng(7);
  for (let i = 0; i < 60; i++) {
    for (const s of solveCube(applyAlg(solvedCube(), scramble(25, r)))) {
      for (let j = 1; j < s.moves.length; j++) assert.notEqual(s.moves[j].face, s.moves[j - 1].face, s.title);
    }
  }
});
