// Pure Rubik's cube model: 26 cubies, each with integer position and stickers keyed by outward direction.
export type Vec = [number, number, number];
export type Face = "U" | "D" | "L" | "R" | "F" | "B";
export interface Sticker { dir: Vec; color: Face }
export interface Cubie { id: number; pos: Vec; stickers: Sticker[] }
export type Cube = Cubie[];

export const FACE_DIR: Record<Face, Vec> = {
  U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1],
};
// Clockwise as seen looking at that face.
export const MOVE_AXIS: Record<Face, { axis: Vec; sign: 1 | -1 }> = {
  U: { axis: [0, 1, 0], sign: -1 }, D: { axis: [0, -1, 0], sign: -1 },
  R: { axis: [1, 0, 0], sign: -1 }, L: { axis: [-1, 0, 0], sign: -1 },
  F: { axis: [0, 0, 1], sign: -1 }, B: { axis: [0, 0, -1], sign: -1 },
};

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const eq = (a: Vec, b: Vec) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

/** Rotate v by sign*90deg about unit axis a. */
export function rot(v: Vec, a: Vec, sign: number): Vec {
  const c = cross(a, v), d = dot(a, v);
  return [sign * c[0] + a[0] * d, sign * c[1] + a[1] * d, sign * c[2] + a[2] * d].map((n) => n + 0) as Vec;
}

export function solvedCube(): Cube {
  const cube: Cube = [];
  let id = 0;
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const pos: Vec = [x, y, z];
    const stickers = (Object.keys(FACE_DIR) as Face[])
      .filter((f) => dot(FACE_DIR[f], pos) === 1)
      .map((f) => ({ dir: FACE_DIR[f], color: f }));
    cube.push({ id: id++, pos, stickers });
  }
  return cube;
}

export interface Move { face: Face; turns: 1 | 2 | 3 }

export function parseAlg(alg: string): Move[] {
  return alg.trim().split(/\s+/).filter(Boolean).map((t) => {
    const face = t[0] as Face;
    if (!(face in FACE_DIR)) throw new Error(`Bad move ${t}`);
    const turns = t.includes("2") ? 2 : t.includes("'") ? 3 : 1;
    return { face, turns };
  });
}
export const moveName = (m: Move) => m.face + (m.turns === 2 ? "2" : m.turns === 3 ? "'" : "");
export const invertAlg = (moves: Move[]): Move[] =>
  [...moves].reverse().map((m) => ({ face: m.face, turns: (4 - m.turns) as 1 | 2 | 3 }));

export const inLayer = (c: Cubie, face: Face) => dot(c.pos, FACE_DIR[face]) === 1;

export function applyQuarter(cube: Cube, face: Face): Cube {
  const { axis, sign } = MOVE_AXIS[face];
  return cube.map((c) => inLayer(c, face)
    ? { ...c, pos: rot(c.pos, axis, sign), stickers: c.stickers.map((s) => ({ ...s, dir: rot(s.dir, axis, sign) })) }
    : c);
}
export function applyMove(cube: Cube, m: Move): Cube {
  let c = cube;
  for (let i = 0; i < m.turns; i++) c = applyQuarter(c, m.face);
  return c;
}
export const applyAlg = (cube: Cube, moves: Move[]) => moves.reduce(applyMove, cube);

/** Random scramble with no same-face repeats; rng injected for tests. */
export function scramble(len = 20, rng: () => number = Math.random): Move[] {
  const faces: Face[] = ["U", "D", "L", "R", "F", "B"];
  const out: Move[] = [];
  while (out.length < len) {
    const face = faces[Math.floor(rng() * 6)];
    if (out.length && out[out.length - 1].face === face) continue;
    out.push({ face, turns: (1 + Math.floor(rng() * 3)) as 1 | 2 | 3 });
  }
  return out;
}

const cubieSolved = (c: Cubie) => c.stickers.every((s) => eq(s.dir, FACE_DIR[s.color]));
export const isSolved = (cube: Cube) => cube.every(cubieSolved);

/** Stages of the beginner method; white on the bottom (D), yellow on top (U). */
export type Stage = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export function currentStage(cube: Cube): Stage {
  const isEdge = (c: Cubie) => c.stickers.length === 2;
  const bottom = cube.filter((c) => c.pos[1] === -1 && c.stickers.length > 1);
  const middle = cube.filter((c) => c.pos[1] === 0 && c.stickers.length > 1);
  const top = cube.filter((c) => c.pos[1] === 1);
  if (!bottom.filter(isEdge).every(cubieSolved)) return 0;
  if (!bottom.every(cubieSolved)) return 1;
  if (!middle.every(cubieSolved)) return 2;
  const upYellow = (c: Cubie) => c.stickers.some((s) => s.color === "U" && eq(s.dir, FACE_DIR.U));
  if (!top.filter(isEdge).every(upYellow)) return 3;
  if (!top.every(upYellow)) return 4;
  if (!isSolved(cube)) return 5;
  return 6;
}
