import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { type Cube, type Face, type Move, solvedCube, scramble, parseAlg, invertAlg, moveName, currentStage, applyAlg, isSolved } from "@/lib/rubik/cube";
import { sameCube } from "@/lib/rubik/solver";
import { SolverPanel, makePlan, stepIndexAt, type Plan } from "@/components/rubik/SolverPanel";
import { LESSONS, STAGE_HINT } from "@/lib/rubik/lessons";
import type { CubeHandle } from "@/components/rubik/CubeScene";

const CubeScene = lazy(() => import("@/components/rubik/CubeScene"));

export const Route = createFileRoute("/games/rubik")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Learn to Solve a Rubik's Cube — Orange Sound Guild" },
      { name: "description", content: "Play a 3D Rubik's Cube and let the step-by-step solver show you exactly how to solve your own scramble, with lessons and a timer." },
      { property: "og:title", content: "Learn to Solve a Rubik's Cube — Orange Sound Guild" },
      { property: "og:description", content: "Interactive 3D cube with a step-by-step solver that teaches you how to solve your scramble." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: RubikPage,
});

const FACES: Face[] = ["U", "D", "L", "R", "F", "B"];
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${((ms / 1000) % 60).toFixed(2).padStart(5, "0")}`;

function RubikPage() {
  const handle = useRef<CubeHandle>({ cube: solvedCube(), queue: [], onCommit: () => {} });
  const [cube, setCube] = useState<Cube>(handle.current.cube);
  const [version, setVersion] = useState(0);
  const [lesson, setLesson] = useState(0);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const [best, setBest] = useState<number | null>(null);
  const [lastTime, setLastTime] = useState<number | null>(null);
  const [scrambleText, setScrambleText] = useState("");
  const [tab, setTab] = useState<"solver" | "lessons">("solver");
  const [plan, setPlan] = useState<Plan | null>(null);
  const planRef = useRef<Plan | null>(null);
  planRef.current = plan;
  const [replanned, setReplanned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(true);
  const [assisted, setAssisted] = useState(false);

  useEffect(() => {
    const b = localStorage.getItem("osg-rubik-best");
    if (b) setBest(Number(b));
    handle.current.onCommit = (c) => { setCube(c); setVersion((v) => v + 1); setBusy(handle.current.queue.length > 0); };
  }, []);

  const stage = currentStage(cube);
  useEffect(() => {
    if (startAt && stage === 6 && !handle.current.queue.length) {
      const t = Date.now() - startAt;
      setStartAt(null); setLastTime(t);
      if (!assisted && (!best || t < best)) { setBest(t); localStorage.setItem("osg-rubik-best", String(t)); }
    }
  }, [stage, startAt, best, assisted]);

  // Keep the solver plan in step with the cube: advance on expected moves, re-plan when the player goes their own way.
  useEffect(() => {
    if (tab !== "solver") return;
    if (isSolved(cube)) { setPlan(null); return; }
    const midTurn = handle.current.queue.length > 0;
    const cur = planRef.current;
    if (cur) {
      for (let j = cur.p; j < cur.states.length; j++) {
        if (sameCube(cube, cur.states[j])) { if (j !== cur.p) setPlan({ ...cur, p: j }); return; }
      }
      if (midTurn) return;
      setReplanned(true);
    }
    setPlan(makePlan(cube));
  }, [cube, version, tab]);
  useEffect(() => { handle.current.turnSeconds = slow ? 0.6 : 0.22; }, [slow]);
  useEffect(() => {
    if (!startAt) return;
    const id = setInterval(() => setNow(Date.now()), 50);
    return () => clearInterval(id);
  }, [startAt]);

  const play = useCallback((moves: Move[]) => { handle.current.queue.push(...moves.map((m) => ({ ...m }))); }, []);
  const setInstant = (c: Cube) => { handle.current.queue = []; handle.current.cube = c; setPlan(null); setReplanned(false); setCube(c); setVersion((v) => v + 1); };

  const doScramble = () => {
    const s = scramble(20);
    setScrambleText(s.map(moveName).join(" "));
    setInstant(applyAlg(solvedCube(), s));
    setStartAt(Date.now()); setNow(Date.now()); setLastTime(null); setAssisted(false); setTab("solver");
  };
  const solverPlay = (moves: Move[]) => { setAssisted(true); setReplanned(false); setBusy(true); play(moves); };
  const demo = (alg: string) => {
    const m = parseAlg(alg);
    setStartAt(null);
    setInstant(applyAlg(solvedCube(), invertAlg(m)));
    setTimeout(() => play(m), 400);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const f = e.key.toUpperCase() as Face;
      if (FACES.includes(f) && !(e.target instanceof HTMLInputElement)) play([{ face: f, turns: e.shiftKey ? 3 : 1 }]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [play]);

  const L = LESSONS[lesson];
  const focus = tab === "solver" && plan && plan.p < plan.flat.length ? plan.steps[stepIndexAt(plan)].focus : undefined;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <h1 className="text-2xl font-bold tracking-tight">Rubik's Cube School</h1>
        <p className="text-sm text-muted-foreground">Scramble the cube and the solver shows you exactly how to solve it, step by step. Drag to spin the cube; turn sides with the buttons or keys U D L R F B (hold Shift to turn backwards).</p>
        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_380px]">
          <section>
            <div className="aspect-square w-full max-h-[560px] rounded-xl border bg-card">
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading cube…</div>}>
                <CubeScene handle={handle} version={version} highlightId={focus} />
              </Suspense>
            </div>
            <div className="mt-3 grid grid-cols-6 gap-2">
              {FACES.map((f) => <Button key={f} variant="secondary" onClick={() => play([{ face: f, turns: 1 }])}>{f}</Button>)}
              {FACES.map((f) => <Button key={f + "'"} variant="outline" onClick={() => play([{ face: f, turns: 3 }])}>{f}'</Button>)}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={doScramble}>Scramble &amp; start timer</Button>
              <Button variant="outline" onClick={() => { setStartAt(null); setInstant(solvedCube()); setScrambleText(""); }}>Reset</Button>
              <span className="ml-auto font-mono text-lg">{startAt ? fmt(now - startAt) : lastTime ? fmt(lastTime) : "0:00.00"}</span>
              {best && <span className="text-xs text-muted-foreground">Best {fmt(best)}</span>}
              {assisted && startAt && <span className="text-xs text-muted-foreground">(with solver help)</span>}
            </div>
            {scrambleText && <p className="mt-2 font-mono text-xs text-muted-foreground">Scramble: {scrambleText}</p>}
            <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
              <strong>Hint:</strong> {STAGE_HINT[stage]}
              {stage < 6 && <Button size="sm" variant="link" onClick={() => { setLesson(stage); setTab("lessons"); }}>Open lesson {stage + 1}</Button>}
            </div>
          </section>
          <aside className="rounded-xl border bg-card p-4">
            <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              <Button size="sm" variant={tab === "solver" ? "default" : "ghost"} onClick={() => setTab("solver")}>Show me how</Button>
              <Button size="sm" variant={tab === "lessons" ? "default" : "ghost"} onClick={() => setTab("lessons")}>Lessons</Button>
            </div>
            {tab === "solver" ? (
              <SolverPanel plan={plan} solved={stage === 6} busy={busy} slow={slow} replanned={replanned}
                onToggleSpeed={() => setSlow((v) => !v)} onPlay={solverPlay} onScramble={doScramble} />
            ) : (<>
            <div className="flex flex-wrap gap-1">
              {LESSONS.map((l, i) => (
                <Button key={i} size="sm" variant={i === lesson ? "default" : "ghost"} onClick={() => setLesson(i)}>{i + 1}</Button>
              ))}
            </div>
            <h2 className="mt-3 text-lg font-semibold">{L.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{L.goal}</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">{L.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            {L.alg && (
              <div className="mt-4 rounded-lg bg-muted p-3">
                <div className="text-xs text-muted-foreground">{L.algLabel}</div>
                <div className="font-mono text-base">{L.alg}</div>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => demo(L.alg!)}>Watch it</Button>
                  <Button size="sm" variant="outline" onClick={() => play(parseAlg(L.alg!))}>Do it on my cube</Button>
                </div>
              </div>
            )}
            <p className="mt-4 text-xs text-muted-foreground">Hold the cube with white on the bottom and yellow on top. A letter means turn that side clockwise as if you were looking at it; ' means counter-clockwise; 2 means twice.</p>
            </>)}
          </aside>
        </div>
      </main>
    </div>
  );
}
