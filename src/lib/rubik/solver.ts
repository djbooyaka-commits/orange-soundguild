// Beginner layer-by-layer solver that explains each step. White on the bottom (D), yellow on top (U), green in front (F).
import { type Cube, type Cubie, type Face, type Move, type Vec, FACE_DIR, MOVE_AXIS, applyAlg, applyMove, parseAlg, rot, isSolved, moveName } from "./cube";

export const COLOR_NAME: Record<Face, string> = { U: "yellow", D: "white", F: "green", B: "blue", R: "red", L: "orange" };
export const SIDE_NAME: Record<Face, string> = { U: "top", D: "bottom", F: "front", B: "back", R: "right", L: "left" };

export interface SolvePart { label: string; moves: Move[] }
export interface SolveStep { stage: number; title: string; detail: string; parts: SolvePart[]; moves: Move[]; focus?: number }

type Side = "F" | "R" | "B" | "L";
const SIDES: Side[] = ["F", "R", "B", "L"];
const RIGHT: Record<Side, Side> = { F: "R", R: "B", B: "L", L: "F" };
const LEFT: Record<Side, Side> = { F: "L", L: "B", B: "R", R: "F" };
const OPP: Record<Side, Side> = { F: "B", B: "F", R: "L", L: "R" };
const FACES: Face[] = ["U", "D", "L", "R", "F", "B"];
const ALL_MOVES: Move[] = FACES.flatMap((face) => ([1, 2, 3] as const).map((turns) => ({ face, turns })));

const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const veq = (a: Vec, b: Vec) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const algText = (m: Move[]) => m.map(moveName).join(" ");
const cname = (f: Face) => COLOR_NAME[f];

export const describeMove = (m: Move) =>
  `Turn the ${SIDE_NAME[m.face]} (${COLOR_NAME[m.face]} center) side ${m.turns === 2 ? "twice" : m.turns === 3 ? "counter-clockwise" : "clockwise"}, as if you were looking straight at it.`;

export function sameCube(a: Cube, b: Cube) {
  return a.every((c, i) => veq(c.pos, b[i].pos) && c.stickers.every((s, j) => veq(s.dir, b[i].stickers[j].dir)));
}
const pieceSolved = (c: Cubie) => c.stickers.every((s) => veq(s.dir, FACE_DIR[s.color]));
const findPiece = (cube: Cube, colors: Face[]) =>
  cube.find((c) => c.stickers.length === colors.length && colors.every((col) => c.stickers.some((s) => s.color === col)))!;
const intact = (cube: Cube, ids: number[]) => ids.every((id) => pieceSolved(cube.find((c) => c.id === id)!));
const sidesAt = (pos: Vec) => SIDES.filter((f) => dot(FACE_DIR[f], pos) === 1);

function where(c: Cubie) {
  const layer = c.pos[1] === 1 ? "top layer" : c.pos[1] === -1 ? "bottom layer" : "middle layer";
  const s = sidesAt(c.pos).map(cname);
  return s.length === 2 ? `${layer}, between the ${s[0]} and ${s[1]} sides` : `${layer}, on the ${s[0]} side`;
}

/** Re-aim an algorithm written for green-front at another front side (a y rotation). */
function frame(alg: string, front: Side): Move[] {
  const map: Record<Face, Face> = { U: "U", D: "D", F: front, R: RIGHT[front], L: LEFT[front], B: OPP[front] };
  return parseAlg(alg).map((m) => ({ face: map[m.face], turns: m.turns }));
}
const frontFor = (a: Side, b: Side): Side => (RIGHT[a] === b ? a : b);
const U_SETUPS: Move[][] = [[], [{ face: "U", turns: 1 }], [{ face: "U", turns: 2 }], [{ face: "U", turns: 3 }]];

// ---------- Stage 1: white cross (optimal per edge via small lookup tables) ----------
const EDGE_SLOTS: Vec[] = [];
for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++)
  if (Math.abs(x) + Math.abs(y) + Math.abs(z) === 2) EDGE_SLOTS.push([x, y, z]);
const primary = (p: Vec): Vec => (p[1] !== 0 ? [0, p[1], 0] : [0, 0, p[2]]);
const encEdge = (pos: Vec, dir: Vec) => EDGE_SLOTS.findIndex((s) => veq(s, pos)) * 2 + (veq(dir, primary(pos)) ? 0 : 1);
const EDGE_MOVE: number[][] = ALL_MOVES.map((m) =>
  Array.from({ length: 24 }, (_, st) => {
    let pos = EDGE_SLOTS[st >> 1];
    let dir = st & 1 ? sub(pos, primary(pos)) : primary(pos);
    for (let i = 0; i < m.turns; i++) {
      if (dot(pos, FACE_DIR[m.face]) === 1) {
        const { axis, sign } = MOVE_AXIS[m.face];
        pos = rot(pos, axis, sign); dir = rot(dir, axis, sign);
      }
    }
    return encEdge(pos, dir);
  }));
const P24 = [1, 24, 576, 13824, 331776];
function stepCode(code: number, m: number, k: number) {
  let out = 0;
  for (let i = 0; i < k; i++) out += EDGE_MOVE[m][Math.floor(code / P24[i]) % 24] * P24[i];
  return out;
}
const tables = new Map<string, Uint8Array>();
function crossTable(set: Side[]) {
  const key = set.join("");
  let t = tables.get(key);
  if (t) return t;
  const k = set.length;
  t = new Uint8Array(P24[k]).fill(255);
  const goal = set.reduce((acc, x, i) => acc + encEdge([...FACE_DIR.D].map((v, j) => v + FACE_DIR[x][j]) as Vec, FACE_DIR.D) * P24[i], 0);
  const q = new Int32Array(P24[k]);
  let head = 0, tail = 0;
  t[goal] = 0; q[tail++] = goal;
  while (head < tail) {
    const c = q[head++], d = t[c];
    for (let m = 0; m < 18; m++) {
      const n = stepCode(c, m, k);
      if (t[n] === 255) { t[n] = d + 1; q[tail++] = n; }
    }
  }
  tables.set(key, t);
  return t;
}
function cubeCode(cube: Cube, set: Side[]) {
  return set.reduce((acc, x, i) => {
    const c = findPiece(cube, ["D", x]);
    return acc + encEdge(c.pos, c.stickers.find((s) => s.color === "D")!.dir) * P24[i];
  }, 0);
}

function crossSteps(cube: Cube, steps: SolveStep[]) {
  const placed: Side[] = SIDES.filter((x) => pieceSolved(findPiece(cube, ["D", x])));
  while (placed.length < 4) {
    let best: { e: Side; set: Side[]; d: number } | null = null;
    for (const e of SIDES) {
      if (placed.includes(e)) continue;
      const set = SIDES.filter((s) => placed.includes(s) || s === e);
      const d = crossTable(set)[cubeCode(cube, set)];
      if (!best || d < best.d) best = { e, set, d };
    }
    const { e, set } = best!;
    const t = crossTable(set);
    let code = cubeCode(cube, set);
    const moves: Move[] = [];
    while (t[code] > 0) {
      const m = ALL_MOVES.findIndex((_, i) => t[stepCode(code, i, set.length)] === t[code] - 1);
      moves.push({ ...ALL_MOVES[m] }); code = stepCode(code, m, set.length);
    }
    const piece = findPiece(cube, ["D", e]);
    steps.push({
      stage: 0, title: `White cross: the white–${cname(e)} edge`, focus: piece.id,
      detail: `Find the white–${cname(e)} edge (it's glowing). Right now it's in the ${where(piece)}. These turns bring it down so white faces the bottom and ${cname(e)} lines up with the ${cname(e)} center${placed.length ? ", without breaking the edges you already placed" : ""}.`,
      parts: [{ label: "Moves", moves }], moves,
    });
    cube = applyAlg(cube, moves);
    placed.push(e);
  }
  return cube;
}

// ---------- Generic "try setups + algorithm" helper ----------
interface Candidate { parts: SolvePart[]; note: string }
const flat = (c: Candidate) => c.parts.flatMap((p) => p.moves);
function firstWorking(cube: Cube, cands: Candidate[], ok: (c: Cube) => boolean) {
  return cands.map((c) => ({ c, n: flat(c).length })).sort((a, b) => a.n - b.n).find(({ c }) => ok(applyAlg(cube, flat(c))))?.c ?? null;
}
const setupPart = (u: Move[], why: string): SolvePart[] => (u.length ? [{ label: why, moves: u }] : []);
const solvedIds = (cube: Cube, pred: (c: Cubie) => boolean) => cube.filter((c) => pred(c) && pieceSolved(c)).map((c) => c.id);

// ---------- Stage 2: white corners ----------
const SEXY = "R U R' U'";
function cornerSteps(cube: Cube, steps: SolveStep[]) {
  const pairs: [Side, Side][] = [["F", "R"], ["R", "B"], ["B", "L"], ["L", "F"]];
  for (const [a, b] of pairs) {
    const colors: Face[] = ["D", a, b];
    let piece = findPiece(cube, colors);
    if (pieceSolved(piece)) continue;
    const keep = solvedIds(cube, (c) => c.pos[1] === -1 && c.stickers.length > 1);
    const startWhere = where(piece);
    const pre: SolvePart[] = [];
    let work = cube;
    if (piece.pos[1] === -1) {
      const [p, q] = sidesAt(piece.pos);
      const pop = frame(SEXY, frontFor(p, q));
      pre.push({ label: "Lift it out", moves: pop });
      work = applyAlg(work, pop);
      piece = findPiece(work, colors);
    }
    const trig = frame(SEXY, frontFor(a, b));
    const cands: Candidate[] = [];
    for (const u of U_SETUPS) for (let n = 1; n <= 5; n++)
      cands.push({ note: String(n), parts: [...setupPart(u, "Move it above its spot"), { label: `Repeat ${algText(trig)} ×${n}`, moves: Array.from({ length: n }, () => trig).flat() }] });
    const pick = firstWorking(work, cands, (c) => pieceSolved(findPiece(c, colors)) && intact(c, keep));
    if (!pick) throw new Error("corner stage failed");
    const parts = [...pre, ...pick.parts];
    const moves = parts.flatMap((p) => p.moves);
    const hasSetup = pick.parts.length > 1;
    steps.push({
      stage: 1, title: `White corners: the white–${cname(a)}–${cname(b)} corner`, focus: piece.id, parts, moves,
      detail: [
        `Find the white–${cname(a)}–${cname(b)} corner (it's glowing) in the ${startWhere}. Its home is the bottom corner between the ${cname(a)} and ${cname(b)} centers.`,
        pre.length ? "It's stuck in the bottom layer the wrong way, so first lift it up to the top." : "",
        hasSetup ? "Turn the top so the corner sits right above its home." : "",
        `Then repeat ${algText(trig)} (the "sexy move" done from the ${cname(frontFor(a, b))} side) ${pick.note} time${pick.note === "1" ? "" : "s"} until it drops in with white on the bottom.`,
      ].filter(Boolean).join(" "),
    });
    cube = applyAlg(cube, moves);
  }
  return cube;
}

// ---------- Stage 3: middle layer ----------
const INSERT_RIGHT = "U R U' R' U' F' U F";
const INSERT_LEFT = "U' L' U L U F U' F'";
function middleSteps(cube: Cube, steps: SolveStep[]) {
  const pairs: [Side, Side][] = [["F", "R"], ["R", "B"], ["B", "L"], ["L", "F"]];
  for (const [a, b] of pairs) {
    const colors: Face[] = [a, b];
    let piece = findPiece(cube, colors);
    if (pieceSolved(piece)) continue;
    const keep = solvedIds(cube, (c) => c.pos[1] !== 1 && c.stickers.length > 1);
    const startWhere = where(piece);
    const pre: SolvePart[] = [];
    let work = cube;
    if (piece.pos[1] === 0) {
      const [p, q] = sidesAt(piece.pos);
      const pop = frame(INSERT_RIGHT, frontFor(p, q));
      pre.push({ label: "Pop it out to the top", moves: pop });
      work = applyAlg(work, pop);
      piece = findPiece(work, colors);
    }
    const cands: Candidate[] = [];
    for (const u of U_SETUPS) for (const x of SIDES) {
      cands.push({ note: `right|${x}`, parts: [...setupPart(u, "Line it up"), { label: `Insert right from ${cname(x)}`, moves: frame(INSERT_RIGHT, x) }] });
      cands.push({ note: `left|${x}`, parts: [...setupPart(u, "Line it up"), { label: `Insert left from ${cname(x)}`, moves: frame(INSERT_LEFT, x) }] });
    }
    const pick = firstWorking(work, cands, (c) => pieceSolved(findPiece(c, colors)) && intact(c, keep));
    if (!pick) throw new Error("middle stage failed");
    const [dirn, x] = pick.note.split("|") as ["right" | "left", Side];
    const other = dirn === "right" ? RIGHT[x] : LEFT[x];
    const parts = [...pre, ...pick.parts];
    const moves = parts.flatMap((p) => p.moves);
    steps.push({
      stage: 2, title: `Middle layer: the ${cname(a)}–${cname(b)} edge`, focus: piece.id, parts, moves,
      detail: [
        `Find the ${cname(a)}–${cname(b)} edge (it's glowing) in the ${startWhere}. It belongs in the middle layer between the ${cname(a)} and ${cname(b)} centers.`,
        pre.length ? "It's in the middle layer but in the wrong place or flipped, so first pop it up to the top with the insert move." : "",
        pick.parts.length > 1 ? `Turn the top so its side sticker matches the ${cname(x)} center.` : `Its side sticker already matches the ${cname(x)} center.`,
        `Face the ${cname(x)} side and insert it to the ${dirn}, toward ${cname(other)}.`,
      ].filter(Boolean).join(" "),
    });
    cube = applyAlg(cube, moves);
  }
  return cube;
}

// ---------- Last layer: repeat one algorithm with top-turn setups ----------
const yellowUp = (c: Cubie) => c.stickers.some((s) => s.color === "U" && veq(s.dir, FACE_DIR.U));
const topEdges = (cube: Cube) => cube.filter((c) => c.pos[1] === 1 && c.stickers.length === 2);
const topCorners = (cube: Cube) => cube.filter((c) => c.pos[1] === 1 && c.stickers.length === 3);

function chain(cube: Cube, alg: Move[], maxN: number, goal: (c: Cube) => boolean, finalU: boolean): { chunks: Move[][]; final: Move[] } | null {
  const finals = finalU ? U_SETUPS : [[]];
  for (let n = 0; n <= maxN; n++) {
    const rec = (c: Cube, left: number, acc: Move[][]): { chunks: Move[][]; final: Move[] } | null => {
      if (left === 0) {
        for (const f of finals) if (goal(applyAlg(c, f))) return { chunks: acc, final: f };
        return null;
      }
      for (const u of U_SETUPS) {
        const chunk = [...u, ...alg];
        const r = rec(applyAlg(c, chunk), left - 1, [...acc, chunk]);
        if (r) return r;
      }
      return null;
    };
    const r = rec(cube, n, []);
    if (r) return r;
  }
  return null;
}
function splitChunk(chunk: Move[], algLen: number, why: string, label: string): SolvePart[] {
  const setup = chunk.slice(0, chunk.length - algLen);
  return [...setupPart(setup, why), { label, moves: chunk.slice(chunk.length - algLen) }];
}

function yellowCrossShape(cube: Cube) {
  const up = topEdges(cube).filter(yellowUp);
  if (up.length === 4) return "a yellow cross";
  if (up.length === 0) return "just a yellow dot in the middle";
  const [p, q] = up;
  return dot(p.pos, q.pos) === 1 ? "an L shape" : "a yellow line";
}

function lastLayer(cube: Cube, steps: SolveStep[]) {
  // Stage 4: yellow cross
  const fru = parseAlg("F R U R' U' F'");
  const cross = chain(cube, fru, 3, (c) => topEdges(c).every(yellowUp), false);
  if (!cross) throw new Error("yellow cross failed");
  for (const chunk of cross.chunks) {
    const shape = yellowCrossShape(cube);
    const tip = shape === "an L shape" ? " Hold the L at the back-left." : shape === "a yellow line" ? " Hold the line going left to right." : "";
    steps.push({ stage: 3, title: "Yellow cross", parts: splitChunk(chunk, fru.length, "Hold it the right way", "F R U R' U' F'"), moves: chunk,
      detail: `Look at the top: you have ${shape} (ignore the corners).${tip} Then do F R U R' U' F'.` });
    cube = applyAlg(cube, chunk);
  }
  // Stage 5: yellow face (Sune)
  const sune = parseAlg("R U R' U R U2 R'");
  const face = chain(cube, sune, 4, (c) => topCorners(c).every(yellowUp), false);
  if (!face) throw new Error("yellow face failed");
  for (const chunk of face.chunks) {
    const n = topCorners(cube).filter(yellowUp).length;
    steps.push({ stage: 4, title: "Yellow face", parts: splitChunk(chunk, sune.length, "Turn the top", "Sune: R U R' U R U2 R'"), moves: chunk,
      detail: `${n} of the 4 top corners show yellow on top.${n === 1 ? " Put that yellow corner at the front-left." : ""} Then do the Sune: R U R' U R U2 R'. Repeat until the whole top is yellow.` });
    cube = applyAlg(cube, chunk);
  }
  // Stage 6a: corners into place
  const aperm = parseAlg("R' F R' B2 R F' R' B2 R2");
  const corners = chain(cube, aperm, 3, (c) => topCorners(c).every(pieceSolved), true);
  if (!corners) throw new Error("corner perm failed");
  for (const chunk of corners.chunks) {
    steps.push({ stage: 5, title: "Last corners", parts: splitChunk(chunk, aperm.length, "Hold it the right way", "R' F R' B2 R F' R' B2 R2"), moves: chunk,
      detail: "Now move the yellow corners to their correct spots. Look for two corners next to each other whose side colors match (\"headlights\") and hold them at the back. Then do R' F R' B2 R F' R' B2 R2." });
    cube = applyAlg(cube, chunk);
  }
  if (corners.final.length) {
    steps.push({ stage: 5, title: "Line up the corners", parts: [{ label: "Turn the top", moves: corners.final }], moves: corners.final,
      detail: "Turn the top layer so every corner matches the side colors around it." });
    cube = applyAlg(cube, corners.final);
  }
  // Stage 6b: edges into place
  const uperm = parseAlg("R U' R U R U R U' R' U' R2");
  const edges = chain(cube, uperm, 4, isSolved, true);
  if (!edges) throw new Error("edge perm failed");
  for (const chunk of edges.chunks) {
    steps.push({ stage: 5, title: "Last edges", parts: splitChunk(chunk, uperm.length, "Hold it the right way", "R U' R U R U R U' R' U' R2"), moves: chunk,
      detail: "Last part! If one side is completely finished, hold it at the back. Then do R U' R U R U R U' R' U' R2 to cycle the last three edges." });
    cube = applyAlg(cube, chunk);
  }
  if (edges.final.length) {
    steps.push({ stage: 5, title: "Final turn", parts: [{ label: "Turn the top", moves: edges.final }], moves: edges.final,
      detail: "Turn the top layer one last time and the cube is solved!" });
    cube = applyAlg(cube, edges.final);
  }
  return cube;
}

/** Full beginner-method solution from any position, as human-sized steps. */
export function solveCube(cube: Cube): SolveStep[] {
  const steps: SolveStep[] = [];
  if (isSolved(cube)) return steps;
  let c = crossSteps(cube, steps);
  c = cornerSteps(c, steps);
  c = middleSteps(c, steps);
  c = lastLayer(c, steps);
  if (!isSolved(c)) throw new Error("solver did not finish");
  return steps.filter((s) => s.moves.length);
}

export const STAGE_NAMES = ["White cross", "White corners", "Middle layer", "Yellow cross", "Yellow face", "Finish the cube"];
void applyMove;
