import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, MousePointer2, Mouse, Unlock, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { paired: boolean; send: (kind: string, payload?: Record<string, unknown>) => Promise<unknown> };

export function PcRemoteControls({ paired, send }: Props) {
  const gesture = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const pending = useRef({ dx: 0, dy: 0 });
  const moving = useRef(false);
  const [dragging, setDragging] = useState(false);
  async function flush() {
    if (moving.current) return;
    moving.current = true;
    try {
      while (pending.current.dx || pending.current.dy) {
        const delta = pending.current;
        pending.current = { dx: 0, dy: 0 };
        await send("mouse_move", delta);
        // Let finger movement collect for ~80ms so the PC gets smooth batches, not a flood.
        await new Promise((r) => setTimeout(r, 80));
      }
    } finally { moving.current = false; }
  }
  return <aside className="min-w-0 space-y-5" aria-label="PC live controls">
    <section className="border-b border-border pb-5">
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><Unlock className="h-4 w-4" /> Lock screen</h2>
      <p className="text-sm text-muted-foreground">Windows may block control at sign-in. Remote password entry is unavailable.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!paired} onClick={() => void send("lift_lock")}><Unlock className="h-4 w-4" /> Lift lock screen</Button>
        <Button size="sm" variant="outline" disabled={!paired} onClick={() => void send("key", { keys: ["tab"] })}><ChevronDown className="h-4 w-4" /> Next field</Button>
        <Button size="sm" variant="outline" disabled={!paired} onClick={() => void send("key", { keys: ["shift", "tab"] })}>Previous field</Button>
        <Button size="sm" variant="outline" disabled={!paired} onClick={() => void send("key", { keys: ["enter"] })}>Enter</Button>
      </div>
    </section>
    <section>
      <h2 className="mb-3 flex items-center gap-2 font-semibold"><Mouse className="h-4 w-4" /> Mouse</h2>
      <div role="application" aria-label="PC trackpad" tabIndex={paired ? 0 : -1}
        className="flex aspect-[2/1] w-full touch-none select-none items-center justify-center rounded-lg border border-border bg-muted text-muted-foreground"
        onPointerDown={(e) => { if (!paired) return; e.currentTarget.setPointerCapture(e.pointerId); gesture.current = { x: e.clientX, y: e.clientY, moved: false }; }}
        onPointerMove={(e) => {
          const g = gesture.current; if (!g) return;
          const dx = Math.round((e.clientX - g.x) * 2), dy = Math.round((e.clientY - g.y) * 2);
          if (!dx && !dy) return;
          pending.current.dx += dx; pending.current.dy += dy;
          gesture.current = { x: e.clientX, y: e.clientY, moved: true };
          void flush();
        }}
        onPointerUp={() => { const g = gesture.current; gesture.current = null; if (g && !g.moved && !dragging) void send("mouse_click", { button: "left" }); }}
        onPointerCancel={() => { gesture.current = null; }}
        onKeyDown={(e) => { const delta: Record<string, number[]> = { ArrowLeft: [-20, 0], ArrowRight: [20, 0], ArrowUp: [0, -20], ArrowDown: [0, 20] }; const d = delta[e.key]; if (paired && d) { e.preventDefault(); void send("mouse_move", { dx: d[0], dy: d[1] }); } }}>
        <MousePointer2 className="h-6 w-6" />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["left", "double", "right"] as const).map((button) => <Button key={button} size="sm" variant="outline" disabled={!paired} onClick={() => void send("mouse_click", { button })}>{button === "left" ? "Click" : button === "double" ? "Double-click" : "Right-click"}</Button>)}
        <Button size="sm" variant={dragging ? "default" : "outline"} disabled={!paired} onClick={() => { const hold = !dragging; setDragging(hold); void send("mouse_hold", { down: hold }); }}>{dragging ? "Release drag" : "Hold drag"}</Button>
        <Button size="icon" variant="outline" title="Scroll up" aria-label="Scroll up" disabled={!paired} onClick={() => void send("scroll", { dy: 3 })}><ArrowUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="outline" title="Scroll down" aria-label="Scroll down" disabled={!paired} onClick={() => void send("scroll", { dy: -3 })}><ArrowDown className="h-4 w-4" /></Button>
      </div>
      {dragging && <p role="status" className="mt-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Holding the mouse button — move on the trackpad to drag, then tap Release drag.</p>}
    </section>
  </aside>;
}