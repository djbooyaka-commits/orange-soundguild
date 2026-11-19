// Player-facing view helpers: White-on-top orientation and tap/swipe gestures on the 3D cube.
import { type Face, type Move, type Vec, FACE_DIR } from "./cube";
import { COLOR_NAME, SIDE_NAME } from "./solver";

/** White-on-top shows the cube turned over (half turn about the front axis): top<->bottom, left<->right. */
const FLIP: Record<Face, Face> = { U: "D", D: "U", L: "R", R: "L", F: "F", B: "B" };

/** A cube move as the player sees it (and back again: the mapping is its own inverse). Turn direction is unchanged. */
export const viewMove = (m: Move, whiteTop: boolean): Move => (whiteTop ? { face: FLIP[m.face], turns: m.turns } : m);

const WORD: Record<string, string> = { top: "bottom", bottom: "top", left: "right", right: "left", Top: "Bottom", Bottom: "Top", Left: "Right", Right: "Left" };
/** Rewrite solver/lesson text for the White-on-top view: swaps top/bottom, left/right and move letters (R U R' -> L D L'). */
export function viewText(s: string, whiteTop: boolean): string {
  if (!whiteTop) return s;
  return s.replace(/\b(top|bottom|left|right|Top|Bottom|Left|Right)\b|(?<![A-Za-z0-9])([UDLR])(?=(?:2|')?(?![A-Za-z0-9]))/g,
    (_, word: string | undefined, face: string | undefined) => (word ? WORD[word] : FLIP[face as Face]));
}

/** Plain-words move description in the player's view (color names always follow the real center). */
export function describeViewMove(m: Move, whiteTop: boolean): string {
  const v = viewMove(m, whiteTop);
  return `Turn the ${SIDE_NAME[v.face]} (${COLOR_NAME[m.face]} center) side ${m.turns === 2 ? "twice" : m.turns === 3 ? "counter-clockwise" : "clockwise"}, as if you were looking straight at it.`;
}

const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const faceOfDir = (d: Vec) => (Object.keys(FACE_DIR) as Face[]).find((f) => FACE_DIR[f].every((v, i) => v === d[i]))!;

/** Tapping a sticker turns the side it sits on clockwise (counter-clockwise when reverse is set). */
export const tapToMove = (normal: Vec, reverse = false): Move => ({ face: faceOfDir(normal), turns: reverse ? 3 : 1 });

/** The four directions a sticker can be swiped along (perpendicular to its outward normal). */
export const swipeDirections = (normal: Vec): Vec[] =>
  ([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as Vec[]).filter((t) => t.every((v, i) => !(v && normal[i])));

/**
 * Swiping the sticker at cubie `pos` (facing `normal`) along `dir` turns the outer layer that moves that way.
 * Returns null for a middle-row swipe, which has no single-side turn.
 */
export function swipeToMove(pos: Vec, normal: Vec, dir: Vec): Move | null {
  const axis = cross(normal, dir); // turning +90deg about this axis carries the sticker along dir
  const k = axis.findIndex((v) => v !== 0);
  if (k < 0 || pos[k] === 0) return null;
  const out: Vec = [0, 0, 0];
  out[k] = pos[k];
  const face = faceOfDir(out);
  // Clockwise is -90deg about the side's outward normal.
  return { face, turns: out[k] === axis[k] ? 3 : 1 };
}
