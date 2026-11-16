import { Button } from "@/components/ui/button";
import { type Cube, type Move, applyMove, moveName } from "@/lib/rubik/cube";
import { type SolveStep, STAGE_NAMES, describeMove, solveCube } from "@/lib/rubik/solver";

export interface Plan { steps: SolveStep[]; flat: Move[]; stepStart: number[]; states: Cube[]; p: number }

export function makePlan(cube: Cube): Plan {
  const steps = solveCube(cube);
  const flat: Move[] = [];
  const stepStart: number[] = [];
  for (const s of steps) { stepStart.push(flat.length); flat.push(...s.moves); }
  const states = [cube];
  for (const m of flat) states.push(applyMove(states[states.length - 1], m));
  return { steps, flat, stepStart, states, p: 0 };
}
export const stepIndexAt = (plan: Plan) => {
  let i = 0;
  while (i + 1 < plan.stepStart.length && plan.stepStart[i + 1] <= plan.p) i++;
  return i;
};

interface Props {
  plan: Plan | null;
  solved: boolean;
  busy: boolean;
  slow: boolean;
  replanned: boolean;
  onToggleSpeed: () => void;
  onPlay: (moves: Move[]) => void;
  onScramble: () => void;
}

export function SolverPanel({ plan, solved, busy, slow, replanned, onToggleSpeed, onPlay, onScramble }: Props) {
  if (solved || !plan || plan.p >= plan.flat.length) {
    return (
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">{solved ? "Solved! 🎉" : "Solver"}</h2>
        <p className="text-sm text-muted-foreground">
          {solved ? "Your cube is solved. Scramble it and I'll walk you through solving it, one step at a time." : "Working out the next steps…"}
        </p>
        <Button onClick={onScramble}>Scramble a new cube</Button>
      </div>
    );
  }
  const si = stepIndexAt(plan);
  const step = plan.steps[si];
  const start = plan.stepStart[si];
  const end = start + step.moves.length;
  const next = plan.flat[plan.p];
  const pct = Math.round((plan.p / plan.flat.length) * 100);
  let offset = start;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary">
          Stage {step.stage + 1} of 6 · {STAGE_NAMES[step.stage]}
        </span>
        <span className="text-xs text-muted-foreground">Step {si + 1} of {plan.steps.length}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
      {replanned && <p className="text-xs text-muted-foreground">You turned the cube yourself, so I worked out a new plan from here.</p>}
      <h2 className="text-lg font-semibold leading-snug">{step.title}</h2>
      <p className="text-sm text-muted-foreground">{step.detail}</p>

      <div className="space-y-2">
        {step.parts.map((part, pi) => {
          const base = offset;
          offset += part.moves.length;
          return (
            <div key={pi}>
              <div className="text-xs text-muted-foreground">{part.label}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {part.moves.map((m, mi) => {
                  const idx = base + mi;
                  const state = idx < plan.p ? "done" : idx === plan.p ? "next" : "todo";
                  return (
                    <span key={mi} className={
                      "rounded px-2 py-0.5 font-mono text-sm " +
                      (state === "done" ? "bg-muted text-muted-foreground line-through" : state === "next" ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground")
                    }>{moveName(m)}</span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
        <div className="font-mono text-base font-semibold">Next: {moveName(next)}</div>
        <div className="text-muted-foreground">{describeMove(next)}</div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => onPlay([next])}>Do next move</Button>
        <Button size="sm" variant="secondary" disabled={busy} onClick={() => onPlay(plan.flat.slice(plan.p, end))}>Play this step</Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onPlay(plan.flat.slice(plan.p))}>Solve it all</Button>
        <Button size="sm" variant="ghost" onClick={onToggleSpeed}>{slow ? "Speed: slow" : "Speed: normal"}</Button>
      </div>
      <p className="text-xs text-muted-foreground">Want to try yourself? Do the moves with the turn buttons or on a real cube — hold green facing you and yellow on top.</p>

      <details className="rounded-lg border p-2 text-sm">
        <summary className="cursor-pointer font-medium">All steps ({plan.steps.length})</summary>
        <ol className="mt-2 max-h-64 space-y-1 overflow-y-auto pl-1">
          {plan.steps.map((s, i) => (
            <li key={i} className={i === si ? "font-semibold text-primary" : i < si ? "text-muted-foreground line-through" : ""}>
              {i + 1}. {s.title} <span className="font-mono text-xs text-muted-foreground">({s.moves.length} moves)</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}
