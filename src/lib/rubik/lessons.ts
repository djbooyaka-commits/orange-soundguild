export interface Lesson { title: string; goal: string; steps: string[]; alg?: string; algLabel?: string }
// Beginner layer-by-layer method. Hold white center on the bottom, yellow on top.
export const LESSONS: Lesson[] = [
  { title: "1. White cross", goal: "Make a white plus sign on the bottom, with each edge's side color matching the center next to it.",
    steps: ["Centers never move — they tell you each side's color.", "Find a white edge piece (2 colors). Turn its side until its other color sits above the matching center.", "Turn that face twice (e.g. F2) to drop it to the bottom.", "Repeat for all 4 white edges."],
    alg: "F2", algLabel: "Drop an edge from top to bottom" },
  { title: "2. White corners", goal: "Finish the whole white layer.",
    steps: ["Find a white corner in the top layer.", "Turn the top (U) until it sits directly above where it belongs, at the front-right.", "Repeat the 'sexy move' R U R' U' until the corner drops in correctly (up to 5 times).", "Do the same for all 4 corners."],
    alg: "R U R' U'", algLabel: "Sexy move" },
  { title: "3. Middle layer", goal: "Place the 4 middle edges (no yellow on them).",
    steps: ["Find a top edge with no yellow.", "Turn U until its front color matches the front center.", "If it belongs on the right: U R U' R' U' F' U F", "If it belongs on the left: U' L' U L U F U' F'"],
    alg: "U R U' R' U' F' U F", algLabel: "Insert edge to the right" },
  { title: "4. Yellow cross", goal: "Make a yellow plus on top (side colors don't matter yet).",
    steps: ["Look at the top: you'll see a dot, a corner shape (two yellow edges side by side), or a line.", "Corner shape: hold those two edges at the back-left. Line: hold it going left to right.", "Do F R U R' U' F' and look again. Repeat until you have the cross."],
    alg: "F R U R' U' F'", algLabel: "Yellow cross" },
  { title: "5. Yellow face", goal: "Turn the whole top yellow.",
    steps: ["If exactly one corner is yellow-up, hold it at front-left.", "Do the 'Sune': R U R' U R U2 R'", "Look again and repeat until the top is all yellow."],
    alg: "R U R' U R U2 R'", algLabel: "Sune" },
  { title: "6. Finish the cube", goal: "Put the last corners and edges in place.",
    steps: ["Corners: find two side-by-side corners that match ('headlights'). Hold them at the back and do R' F R' B2 R F' R' B2 R2. Repeat if none.", "Edges: hold a solved side at the back and do R U' R U R U R U' R' U' R2. Repeat until solved."],
    alg: "R U' R U R U R U' R' U' R2", algLabel: "Cycle 3 edges" },
];
export const STAGE_HINT = [
  "Build the white cross on the bottom (Lesson 1).",
  "White cross done! Now insert the white corners (Lesson 2).",
  "White layer done! Now fill the middle layer (Lesson 3).",
  "Two layers done! Make the yellow cross on top (Lesson 4).",
  "Yellow cross done! Make the whole top yellow (Lesson 5).",
  "Almost there! Put the last pieces in place (Lesson 6).",
  "Solved! Great job.",
];
