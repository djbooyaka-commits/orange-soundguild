import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, Lightformer, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { type Cube, type Face, type Move, FACE_DIR, MOVE_AXIS, applyQuarter, inLayer } from "@/lib/rubik/cube";

const COLORS: Record<Face, string> = { U: "#ffd500", D: "#f4f4f4", F: "#009b48", B: "#0046ad", R: "#b71234", L: "#ff5800" };
const TURN_SECONDS = 0.22;

export interface CubeHandle { cube: Cube; queue: Move[]; onCommit: (c: Cube) => void }

function Cubie({ c }: { c: Cube[number] }) {
  return (
    <group position={c.pos}>
      <RoundedBox args={[0.96, 0.96, 0.96]} radius={0.08} smoothness={2}>
        <meshStandardMaterial color="#111" roughness={0.5} />
      </RoundedBox>
      {c.stickers.map((s, i) => {
        const size: [number, number, number] = s.dir.map((d) => (d ? 0.02 : 0.8)) as [number, number, number];
        return (
          <mesh key={i} position={s.dir.map((d) => d * 0.485) as [number, number, number]}>
            <boxGeometry args={size} />
            <meshStandardMaterial color={COLORS[s.color]} roughness={0.35} />
          </mesh>
        );
      })}
    </group>
  );
}

function Rig({ handle, version }: { handle: React.MutableRefObject<CubeHandle>; version: number }) {
  const turning = useRef<THREE.Group>(null);
  const anim = useRef<{ face: Face; t: number } | null>(null);
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

  useFrame((_, delta) => {
    const h = handle.current;
    if (!anim.current && h.queue.length) {
      const m = h.queue[0];
      anim.current = { face: m.face, t: 0 };
      h.onCommit(h.cube); // re-render to split the layer
      return;
    }
    const a = anim.current;
    if (!a || !turning.current) return;
    a.t = Math.min(1, a.t + Math.min(delta, 0.05) / TURN_SECONDS);
    const { axis, sign } = MOVE_AXIS[a.face];
    const ease = a.t < 0.5 ? 2 * a.t * a.t : 1 - Math.pow(-2 * a.t + 2, 2) / 2;
    turning.current.setRotationFromAxisAngle(new THREE.Vector3(...axis), sign * (Math.PI / 2) * ease);
    if (a.t >= 1) {
      turning.current.rotation.set(0, 0, 0);
      const m = h.queue[0];
      h.cube = applyQuarter(h.cube, a.face);
      if (m.turns > 1) m.turns = (m.turns - 1) as 1 | 2; else h.queue.shift();
      anim.current = null;
      h.onCommit(h.cube);
    }
  });

  return (
    <group>
      <group ref={turning}>{moving.map((c) => <Cubie key={c.id} c={c} />)}</group>
      {still.map((c) => <Cubie key={c.id} c={c} />)}
    </group>
  );
}
void FACE_DIR;

export default function CubeScene({ handle, version }: { handle: React.MutableRefObject<CubeHandle>; version: number }) {
  return (
    <div className="h-full w-full" data-scene-ready>
      <Canvas camera={{ position: [4.2, 3.6, 5.2], fov: 40 }} dpr={[1, 2]}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 8, 5]} intensity={1.6} />
        <Environment>
          <Lightformer intensity={2} position={[0, 5, 0]} scale={[10, 10, 1]} />
          <Lightformer intensity={1} position={[-5, 1, -1]} rotation-y={Math.PI / 2} scale={[20, 1, 1]} />
        </Environment>
        <Rig handle={handle} version={version} />
        <OrbitControls enablePan={false} minDistance={5} maxDistance={12} />
      </Canvas>
    </div>
  );
}
