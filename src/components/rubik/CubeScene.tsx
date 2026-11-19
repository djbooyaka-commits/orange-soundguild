import { useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Environment, Lightformer, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { type Cube, type Face, type Move, type Vec, FACE_DIR, MOVE_AXIS, applyMove, applyQuarter, inLayer } from "@/lib/rubik/cube";
import { swipeDirections, swipeToMove, tapToMove } from "@/lib/rubik/view";

/** Pixels a press must travel before it counts as a swipe instead of a tap. */
const SWIPE_PX = 14;
type Grab = (c: Cube[number], normal: Vec, e: ThreeEvent<PointerEvent>) => void;

const COLORS: Record<Face, string> = { U: "#ffd500", D: "#f4f4f4", F: "#009b48", B: "#0046ad", R: "#b71234", L: "#ff5800" };
const TURN_SECONDS = 0.22;

export interface CubeHandle { cube: Cube; queue: Move[]; onCommit: (c: Cube) => void; turnSeconds?: number }

function Cubie({ c, glow, onGrab }: { c: Cube[number]; glow?: boolean; onGrab?: Grab }) {
  return (
    <group position={c.pos}>
      {/* The body only blocks presses so they never reach stickers hidden behind it. */}
      <RoundedBox args={[0.96, 0.96, 0.96]} radius={0.08} smoothness={2} onPointerDown={onGrab ? (e) => e.stopPropagation() : undefined}>
        <meshStandardMaterial color={glow ? "#ff7a00" : "#111"} emissive={glow ? "#ff7a00" : "#000"} emissiveIntensity={glow ? 0.9 : 0} roughness={0.5} />
      </RoundedBox>
      {c.stickers.map((s, i) => {
        const size: [number, number, number] = s.dir.map((d) => (d ? 0.02 : 0.8)) as [number, number, number];
        return (
          <mesh key={i} position={s.dir.map((d) => d * 0.485) as [number, number, number]}
            onPointerDown={onGrab ? (e) => { e.stopPropagation(); onGrab(c, s.dir, e); } : undefined}>
            <boxGeometry args={size} />
            <meshStandardMaterial color={COLORS[s.color]} roughness={0.35} />
          </mesh>
        );
      })}
    </group>
  );
}

function Rig({ handle, version, highlightId }: { handle: React.MutableRefObject<CubeHandle>; version: number; highlightId?: number }) {
  const turning = useRef<THREE.Group>(null);
  const anim = useRef<{ face: Face; t: number; dir: 1 | -1 } | null>(null);
  const cube = handle.current.cube;
  const face = anim.current?.face;
  const [moving, still] = useMemo(() => {
    if (!face) return [[], cube];
    return [cube.filter((c) => inLayer(c, face)), cube.filter((c) => !inLayer(c, face))];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cube, face, version]);
  const forceRef = useRef(0);
  const [, setTick] = [0, (n: number) => { forceRef.current = n; }];
  void setTick;

  // Tap a side to turn it; swipe across a row to turn that row. Dragging empty space still spins the view.
  const root = useRef<THREE.Group>(null);
  const { camera, gl, controls } = useThree() as unknown as { camera: THREE.Camera; gl: THREE.WebGLRenderer; controls: { enabled: boolean } | null };
  const grab = useRef<{ x: number; y: number; pos: Vec; normal: Vec; reverse: boolean; done: boolean } | null>(null);
  const idle = () => !anim.current && !handle.current.queue.length;
  const onGrab: Grab = (c, normal, e) => {
    if (!idle()) return;
    grab.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY, pos: c.pos, normal, reverse: e.nativeEvent.button === 2 || e.nativeEvent.shiftKey, done: false };
    if (controls) controls.enabled = false;
  };
  useEffect(() => {
    const el = gl.domElement;
    const toScreen = (v: THREE.Vector3) => {
      const p = root.current!.localToWorld(v.clone()).project(camera);
      return [p.x * el.clientWidth / 2, -p.y * el.clientHeight / 2];
    };
    const move = (ev: PointerEvent) => {
      const g = grab.current;
      if (!g || g.done || !root.current) return;
      const dx = ev.clientX - g.x, dy = ev.clientY - g.y;
      if (Math.hypot(dx, dy) < SWIPE_PX) return;
      g.done = true;
      const base = new THREE.Vector3(...g.pos).addScaledVector(new THREE.Vector3(...g.normal), 0.5);
      const [bx, by] = toScreen(base);
      let best: { dir: Vec; score: number } | null = null;
      for (const dir of swipeDirections(g.normal)) {
        const [tx, ty] = toScreen(base.clone().addScaledVector(new THREE.Vector3(...dir), 0.5));
        const len = Math.hypot(tx - bx, ty - by) || 1;
        const score = ((tx - bx) * dx + (ty - by) * dy) / len;
        if (!best || score > best.score) best = { dir, score };
      }
      const m = best && swipeToMove(g.pos, g.normal, best.dir);
      if (m && idle()) handle.current.queue.push(m);
    };
    const up = () => {
      const g = grab.current;
      if (!g) return;
      if (!g.done && idle()) handle.current.queue.push(tapToMove(g.normal, g.reverse));
      grab.current = null;
      if (controls) controls.enabled = true;
    };
    const noMenu = (ev: Event) => ev.preventDefault();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    el.addEventListener("contextmenu", noMenu);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      el.removeEventListener("contextmenu", noMenu);
    };
  }, [camera, gl, controls, handle]);

  useFrame((_, delta) => {
    const h = handle.current;
    if (!anim.current && h.queue.length) {
      const m = h.queue[0];
      anim.current = { face: m.face, t: 0, dir: m.turns === 3 ? -1 : 1 }; // counter-clockwise turns animate backwards, not as three turns
      h.onCommit(h.cube); // re-render to split the layer
      return;
    }
    const a = anim.current;
    if (!a || !turning.current) return;
    a.t = Math.min(1, a.t + Math.min(delta, 0.05) / (h.turnSeconds ?? TURN_SECONDS));
    const { axis, sign } = MOVE_AXIS[a.face];
    const ease = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
    turning.current.setRotationFromAxisAngle(new THREE.Vector3(...axis), a.dir * sign * (Math.PI / 2) * ease);
    if (a.t >= 1) {
      turning.current.rotation.set(0, 0, 0);
      const m = h.queue[0];
      if (a.dir < 0) { h.cube = applyMove(h.cube, { face: a.face, turns: 3 }); h.queue.shift(); }
      else { h.cube = applyQuarter(h.cube, a.face); if (m.turns > 1) m.turns = (m.turns - 1) as 1 | 2; else h.queue.shift(); }
      anim.current = null;
      h.onCommit(h.cube);
    }
  });

  return (
    <group ref={root}>
      <group ref={turning}>{moving.map((c) => <Cubie key={c.id} c={c} glow={c.id === highlightId} />)}</group>
      {still.map((c) => <Cubie key={c.id} c={c} glow={c.id === highlightId} onGrab={onGrab} />)}
    </group>
  );
}

/** Curved arrow floating over the face that turns next: shows which way to spin. */
function TurnArrow({ move }: { move: Move }) {
  const q = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...FACE_DIR[move.face])), [move.face]);
  const n = FACE_DIR[move.face];
  const cw = move.turns !== 3;
  return (
    <group position={[n[0] * 1.62, n[1] * 1.62, n[2] * 1.62]} quaternion={q}>
      <group scale={[cw ? -1 : 1, 1, 1]}>
        <mesh>
          <torusGeometry args={[0.95, 0.07, 8, 48, Math.PI * 1.5]} />
          <meshBasicMaterial color="#ff3b1f" />
        </mesh>
        <mesh position={[0.05, -0.95, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.2, 0.4, 16]} />
          <meshBasicMaterial color="#ff3b1f" />
        </mesh>
      </group>
      {move.turns === 2 && (
        <mesh position={[0, 0, 0.02]}><circleGeometry args={[0.18, 24]} /><meshBasicMaterial color="#ff3b1f" /></mesh>
      )}
    </group>
  );
}

export default function CubeScene({ handle, version, highlightId, nextMove, whiteTop }: { handle: React.MutableRefObject<CubeHandle>; version: number; highlightId?: number; nextMove?: Move; whiteTop?: boolean }) {
  return (
    <div className="h-full w-full" data-scene-ready>
      <Canvas camera={{ position: [4.2, 3.6, 5.2], fov: 40 }} dpr={[1, 2]}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1.6} />
        <Environment>
          <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
          <Lightformer intensity={1} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        </Environment>
        <group rotation={[0, 0, whiteTop ? Math.PI : 0]}>
          <Rig handle={handle} version={version} highlightId={highlightId} />
          {nextMove && !handle.current.queue.length && <TurnArrow move={nextMove} />}
        </group>
        <OrbitControls makeDefault enablePan={false} minDistance={5} maxDistance={12} />
      </Canvas>
    </div>
  );
}
