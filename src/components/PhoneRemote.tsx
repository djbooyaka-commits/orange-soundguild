import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Video, VideoOff, Circle, Globe, Home, Loader2, Plus, Power, Rocket, Square, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Device = {
  id: string; name: string; pairing_code: string; paired: boolean; pairing_expires_at: string;
  screen_width: number; screen_height: number; last_frame: string | null; last_seen: string | null;
};
const DEVICE_COLS = "id, name, pairing_code, paired, pairing_expires_at, screen_width, screen_height, last_frame, last_seen";
type Command = { id: string; kind: string; payload: unknown; status: string; result: string | null; created_at: string };

const APPS = [
  { label: "Spotify", pkg: "com.spotify.music" },
  { label: "YouTube", pkg: "com.google.android.youtube" },
  { label: "Chrome", pkg: "com.android.chrome" },
  { label: "TIDAL", pkg: "com.aspiro.tidal" },
  { label: "Apple Music", pkg: "com.apple.android.music" },
];

const isOnline = (d: Device) => !!d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 30_000;

export function PhoneRemote({ userId }: { userId: string }) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [activeId, setActiveId] = useState<string>("");
  const [commands, setCommands] = useState<Command[]>([]);
  const [url, setUrl] = useState("");
  const [pkg, setPkg] = useState("");
  const [text, setText] = useState("");
  const [, tick] = useState(0);
  const dragStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const dragPct = useRef<{ x: number; y: number } | null>(null);
  const [marks, setMarks] = useState<{ id: number; x: number; y: number; long: boolean }[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [live, setLive] = useState<"off" | "connecting" | "on">("off");
  const [trail, setTrail] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  const loadDevices = useCallback(async () => {
    const { data } = await supabase.from("remote_devices").select(DEVICE_COLS).order("created_at");
    const list = (data ?? []) as Device[];
    setDevices(list);
    setActiveId((cur) => (list.some((d) => d.id === cur) ? cur : list[0]?.id ?? ""));
  }, []);

  useEffect(() => { void loadDevices(); }, [loadDevices]);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(i); }, []);

  useEffect(() => {
    if (!activeId) return;
    void supabase.from("remote_commands").select("*").eq("device_id", activeId)
      .order("created_at", { ascending: false }).limit(15)
      .then(({ data }) => setCommands((data ?? []) as Command[]));
    const ch = supabase.channel(`remote-${activeId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "remote_devices", filter: `id=eq.${activeId}` },
        (p) => setDevices((ds) => ds?.map((d) => (d.id === activeId ? { ...d, ...(p.new as Device) } : d)) ?? ds))
      .on("postgres_changes", { event: "*", schema: "public", table: "remote_commands", filter: `device_id=eq.${activeId}` },
        (p) => {
          const row = p.new as Command;
          if (!row?.id) return;
          setCommands((cs) => [row, ...cs.filter((c) => c.id !== row.id)].slice(0, 15));
        })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [activeId]);

  const device = devices?.find((d) => d.id === activeId);
  const paired = !!device?.paired;

  // Tell the phone someone is watching so it streams its screen (it idles otherwise).
  useEffect(() => {
    if (!activeId || !paired) return;
    const beat = () => void supabase.from("remote_devices")
      .update({ watch_until: new Date(Date.now() + 20_000).toISOString() }).eq("id", activeId);
    beat();
    const i = setInterval(beat, 8000);
    return () => clearInterval(i);
  }, [activeId, paired]);

  // Realtime can't carry large frames, so poll the latest screen while watching.
  const refreshFrame = useCallback(async () => {
    if (!activeId) return;
    const { data } = await supabase.from("remote_devices")
      .select("last_frame, last_seen, screen_width, screen_height").eq("id", activeId).maybeSingle();
    if (!data) return;
    setDevices((ds) => ds?.map((d) => (d.id === activeId && (d.last_frame !== data.last_frame || d.last_seen !== data.last_seen) ? { ...d, ...(data as Partial<Device>) } : d)) ?? ds);
  }, [activeId]);
  useEffect(() => {
    if (!activeId || !paired) return;
    void refreshFrame();
    const i = setInterval(() => { if (!document.hidden) void refreshFrame(); }, 1000);
    return () => clearInterval(i);
  }, [activeId, paired, refreshFrame]);

  async function addDevice() {
    const { error } = await supabase.from("remote_devices").insert({ owner_id: userId });
    if (error) return toast.error(error.message);
    await loadDevices();
  }
  async function newCode(id: string) {
    const bytes = crypto.getRandomValues(new Uint8Array(4));
    const code = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
    const { error } = await supabase.from("remote_devices").update({
      pairing_code: code, paired: false, device_token_hash: null, last_frame: null,
      pairing_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    await loadDevices();
  }
  async function removeDevice(id: string) {
    if (!confirm("Remove this phone?")) return;
    await supabase.from("remote_devices").delete().eq("id", id);
    await loadDevices();
  }
  async function rename(id: string, name: string) {
    await supabase.from("remote_devices").update({ name }).eq("id", id);
  }
  function stopLive() {
    pcRef.current?.close(); pcRef.current = null; dcRef.current = null; setLive("off");
  }
  useEffect(() => () => stopLive(), [activeId]);

  async function goLive() {
    if (!device) return;
    stopLive();
    setLive("connecting");
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    pcRef.current = pc;
    pc.addTransceiver("video", { direction: "recvonly" });
    const dc = pc.createDataChannel("control");
    dc.onopen = () => { dcRef.current = dc; };
    dc.onclose = () => { if (dcRef.current === dc) dcRef.current = null; };
    pc.ontrack = (e) => {
      if (videoRef.current) { videoRef.current.srcObject = e.streams[0] ?? new MediaStream([e.track]); void videoRef.current.play().catch(() => {}); }
      setLive("on");
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        if (pcRef.current === pc) { stopLive(); toast.error("Live video stopped. Showing pictures instead."); }
      }
    };
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise<void>((res) => {
      if (pc.iceGatheringState === "complete") return res();
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") res(); };
      setTimeout(res, 3000);
    });
    const session = crypto.randomUUID();
    const { error } = await supabase.from("remote_commands").insert({
      device_id: device.id, owner_id: userId, kind: "webrtc_offer",
      payload: { session, sdp: pc.localDescription?.sdp ?? "" } as never,
    });
    if (error) { stopLive(); return toast.error(error.message); }
    const deadline = Date.now() + 25_000;
    while (pcRef.current === pc && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 700));
      const { data } = await supabase.from("remote_devices").select("webrtc_answer").eq("id", device.id).maybeSingle();
      try {
        const a = data?.webrtc_answer ? (JSON.parse(data.webrtc_answer) as { session: string; sdp: string }) : null;
        if (a?.session === session) { await pc.setRemoteDescription({ type: "answer", sdp: a.sdp }); return; }
      } catch { /* keep waiting */ }
    }
    if (pcRef.current === pc) {
      stopLive();
      toast.error("The phone didn't answer. On the phone, open OSG Remote and tap \"Start live video\" first.");
    }
  }

  async function send(kind: string, payload: Record<string, unknown> = {}) {
    if (!device) return;
    const dc = dcRef.current;
    if (dc && dc.readyState === "open") { dc.send(JSON.stringify({ kind, payload })); return; }
    const { error } = await supabase.from("remote_commands").insert({ device_id: device.id, owner_id: userId, kind, payload: payload as never });
    if (error) return toast.error(error.message);
    // Fast burst: check for the new screen every 300 ms for ~2.5 s after an action.
    for (let ms = 300; ms <= 2400; ms += 300) setTimeout(() => void refreshFrame(), ms);
  }

  function toPhone(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - r.left) / r.width) * (device?.screen_width ?? 1080)),
      y: Math.round(((e.clientY - r.top) / r.height) * (device?.screen_height ?? 2400)),
    };
  }
  function pct(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  }
  function mark(x: number, y: number, long = false) {
    const id = Date.now() + Math.random();
    setMarks((ms) => [...ms, { id, x, y, long }]);
    setTimeout(() => setMarks((ms) => ms.filter((m) => m.id !== id)), 700);
  }
  function onDown(e: React.PointerEvent<HTMLDivElement>) {
    dragStart.current = { ...toPhone(e), t: Date.now() };
    dragPct.current = pct(e);
  }
  function onMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = dragPct.current; if (!p) return;
    const c = pct(e);
    if (Math.hypot(c.x - p.x, c.y - p.y) > 2) setTrail({ x1: p.x, y1: p.y, x2: c.x, y2: c.y });
  }
  function onUp(e: React.PointerEvent<HTMLDivElement>) {
    const s = dragStart.current; dragStart.current = null;
    const p = dragPct.current; dragPct.current = null;
    if (!s || !p) return;
    const end = toPhone(e);
    const c = pct(e);
    const dist = Math.hypot(end.x - s.x, end.y - s.y);
    const ms = Date.now() - s.t;
    if (dist > 30) {
      setTrail({ x1: p.x, y1: p.y, x2: c.x, y2: c.y });
      setTimeout(() => setTrail(null), 500);
      mark(c.x, c.y);
      void send("swipe", { x1: s.x, y1: s.y, x2: end.x, y2: end.y, duration: Math.max(100, ms) });
    } else {
      setTrail(null);
      mark(p.x, p.y, ms > 600);
      if (ms > 600) void send("long_press", { x: s.x, y: s.y });
      else void send("tap", { x: s.x, y: s.y });
    }
  }

  if (devices === null) return <Loader2 aria-label="Loading phones" className="h-6 w-6 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {devices.map((d) => (
          <Button key={d.id} variant={d.id === activeId ? "default" : "outline"} size="sm" onClick={() => setActiveId(d.id)}>
            <Circle className={`h-2.5 w-2.5 ${isOnline(d) ? "fill-primary text-primary" : "text-muted-foreground"}`} /> {d.name}
          </Button>
        ))}
        <Button variant="outline" size="sm" onClick={addDevice}><Plus className="h-4 w-4" /> Add phone</Button>
      </div>

      {!device ? (
        <section className="rounded-xl border border-dashed border-border p-8 text-center">
          <h2 className="text-lg font-semibold">No phone yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">Press "Add phone" to get a pairing code for your Android phone.</p>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
          <div>
            <div
              role="application"
              aria-label="Phone screen — click to tap, drag to swipe"
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              className="relative mx-auto w-full max-w-[360px] cursor-crosshair touch-none select-none overflow-hidden rounded-[2rem] border-8 border-foreground/80 bg-muted"
              style={{ aspectRatio: `${device.screen_width} / ${device.screen_height}` }}
            >
              <video ref={videoRef} muted playsInline autoPlay className={`absolute inset-0 h-full w-full object-cover ${live === "on" ? "" : "hidden"}`} />
              {live === "on" ? null : device.last_frame ? (
                <img src={device.last_frame} alt="Live phone screen" draggable={false} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                  {device.paired ? "Waiting for the phone to send its screen…" : "Pair your phone to see its screen here."}
                </div>
              )}
              {marks.map((m) => (
                <span key={m.id} className="pointer-events-none absolute" style={{ left: `${m.x}%`, top: `${m.y}%` }}>
                  <span className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary bg-primary/30 animate-ping ${m.long ? "h-12 w-12" : "h-8 w-8"}`} />
                  <span className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
                </span>
              ))}
              {trail && (
                <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                  <line x1={trail.x1} y1={trail.y1} x2={trail.x2} y2={trail.y2} className="stroke-primary" strokeWidth="1.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 4 }} />
                </svg>
              )}
            </div>
            <div className="mx-auto mt-3 flex max-w-[360px] flex-wrap justify-center gap-2">
              <Button variant="outline" size="icon" aria-label="Back" onClick={() => send("back")}><ArrowLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" aria-label="Home" onClick={() => send("home")}><Home className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" aria-label="Recent apps" onClick={() => send("recents")}><Square className="h-4 w-4" /></Button>
              <Button variant="outline" size="icon" aria-label="Wake screen" onClick={() => send("wake")}><Power className="h-4 w-4" /></Button>
              <Button variant={live === "off" ? "default" : "secondary"} size="sm" disabled={!paired || live === "connecting"} onClick={() => (live === "off" ? void goLive() : stopLive())}>
                {live === "connecting" ? <Loader2 className="h-4 w-4 animate-spin" /> : live === "on" ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                {live === "on" ? "Stop live" : live === "connecting" ? "Connecting" : "Go live"}
              </Button>
              <Button variant="outline" size="icon" aria-label="Take screenshot" onClick={() => send("screenshot")}><Camera className="h-4 w-4" /></Button>
            </div>
          </div>

          <div className="space-y-5">
            <section className="rounded-xl border border-border p-4">
              <div className="flex items-center justify-between gap-2">
                <Input defaultValue={device.name} onBlur={(e) => rename(device.id, e.target.value || "My Android phone")} className="max-w-xs" aria-label="Phone name" />
                <Button variant="ghost" size="icon" aria-label="Remove phone" onClick={() => removeDevice(device.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
              <p className="mt-3 text-sm">
                Status: <strong>{isOnline(device) ? "Online" : device.paired ? "Offline" : "Not paired"}</strong>
                {device.last_seen && <span className="text-muted-foreground"> · last seen {new Date(device.last_seen).toLocaleString()}</span>}
              </p>
              {!device.paired ? (
                new Date(device.pairing_expires_at).getTime() > Date.now() ? (
                  <p className="mt-2 text-sm">Pairing code: <span className="rounded bg-muted px-2 py-1 font-mono text-lg tracking-widest">{device.pairing_code}</span>
                    <span className="mt-1 block text-muted-foreground">Enter this code in the OSG Remote phone app. It works for 1 hour.</span></p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">This pairing code expired. <Button variant="link" className="h-auto p-0" onClick={() => newCode(device.id)}>Get a new code</Button></p>
                )
              ) : (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => { if (confirm("Disconnect this phone and pair again?")) void newCode(device.id); }}>Pair again</Button>
              )}
              <a href="https://github.com/djbooyaka-commits/orange-soundguild/releases/tag/osg-remote-latest" target="_blank" rel="noopener noreferrer" className="mt-3 block text-sm font-medium text-primary underline underline-offset-4">Download the OSG Remote phone app (APK)</a>
            </section>

            <section className="rounded-xl border border-border p-4">
              <h2 className="mb-3 font-semibold">Open an app</h2>
              <div className="flex flex-wrap gap-2">
                {APPS.map((a) => <Button key={a.pkg} size="sm" variant="secondary" onClick={() => send("open_app", { package: a.pkg })}><Rocket className="h-4 w-4" /> {a.label}</Button>)}
              </div>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (pkg.trim()) void send("open_app", { package: pkg.trim() }); }}>
                <Input value={pkg} onChange={(e) => setPkg(e.target.value)} placeholder="Other app, e.g. com.whatsapp" />
                <Button type="submit" variant="outline">Open</Button>
              </form>
            </section>

            <section className="rounded-xl border border-border p-4">
              <h2 className="mb-3 font-semibold">Open a web page</h2>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const u = url.trim(); if (u) void send("open_url", { url: /^https?:\/\//.test(u) ? u : `https://${u}` }); }}>
                <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="orangesoundguild.com" />
                <Button type="submit"><Globe className="h-4 w-4" /> Go</Button>
              </form>
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text) { void send("type_text", { text }); setText(""); } }}>
                <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type text on the phone" />
                <Button type="submit" variant="outline">Send</Button>
              </form>
            </section>

            <section className="rounded-xl border border-border p-4">
              <h2 className="mb-3 font-semibold">Recent commands</h2>
              {commands.length === 0 ? <p className="text-sm text-muted-foreground">Nothing sent yet.</p> : (
                <ul className="space-y-1 text-sm">
                  {commands.map((c) => (
                    <li key={c.id} className="flex justify-between gap-3">
                      <span className="truncate">{c.kind.replace("_", " ")}</span>
                      <span className="shrink-0 text-muted-foreground">{c.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
