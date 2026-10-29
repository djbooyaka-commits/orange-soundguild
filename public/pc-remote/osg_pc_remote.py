#!/usr/bin/env python3
"""OSG PC Remote — lets you control this computer from orangesoundguild.com/remote.

Setup (once):
    pip install mss pillow pyautogui requests
Run:
    python osg_pc_remote.py
On the website press "Add PC", then type the pairing code here.
Only sends the screen while the Remote page is open. Close this window to stop.
"""
import base64, io, json, os, platform, subprocess, sys, time, webbrowser

try:
    import mss, pyautogui, requests
    from PIL import Image
except ImportError:
    print("Missing packages. Run:  pip install mss pillow pyautogui requests")
    input("Press Enter to close..."); sys.exit(1)

SITE = os.environ.get("OSG_SITE", "https://orangesoundguild.com")
CONFIG = os.path.join(os.path.expanduser("~"), ".osg-remote", "config.json")
FRAME_WIDTH = 1280
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.02

if platform.system() == "Windows":
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(2)  # real pixels so clicks land where you see them
    except Exception:
        pass


def load():
    try:
        with open(CONFIG) as f: return json.load(f)
    except Exception: return None


def save(cfg):
    os.makedirs(os.path.dirname(CONFIG), exist_ok=True)
    with open(CONFIG, "w") as f: json.dump(cfg, f)


def pair():
    while True:
        code = input("Pairing code from orangesoundguild.com/remote: ").strip().upper()
        r = requests.post(f"{SITE}/api/public/remote/pair", json={"code": code, "kind": "pc"}, timeout=20)
        if r.ok:
            d = r.json(); cfg = {"deviceId": d["deviceId"], "token": d["token"]}
            save(cfg); print(f"Paired as \"{d.get('name')}\"."); return cfg
        print("Pairing failed:", r.json().get("error", r.status_code))


def grab(sct):
    mon = sct.monitors[1]
    shot = sct.grab(mon)
    img = Image.frombytes("RGB", shot.size, shot.rgb)
    w, h = img.size
    if w > FRAME_WIDTH: img = img.resize((FRAME_WIDTH, round(h * FRAME_WIDTH / w)))
    for q in (55, 40, 25):
        buf = io.BytesIO(); img.save(buf, "JPEG", quality=q)
        data = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
        if len(data) < 590_000: return data, w, h, mon
    return None, w, h, mon


KEY_MAP = {"win": "win" if platform.system() == "Windows" else "command"}


def run(cmd, mon):
    k, p = cmd.get("kind"), cmd.get("payload") or {}
    ox, oy = mon["left"], mon["top"]
    xy = lambda a, b: (ox + int(p.get(a, 0)), oy + int(p.get(b, 0)))
    if k == "tap": pyautogui.click(*xy("x", "y"))
    elif k == "double_click": pyautogui.doubleClick(*xy("x", "y"))
    elif k == "long_press": pyautogui.rightClick(*xy("x", "y"))
    elif k == "swipe":
        pyautogui.moveTo(*xy("x1", "y1")); pyautogui.dragTo(*xy("x2", "y2"), duration=min(2, int(p.get("duration", 300)) / 1000), button="left")
    elif k == "scroll": pyautogui.scroll(int(p.get("dy", 0)) * 120 if platform.system() == "Windows" else int(p.get("dy", 0)) * 5)
    elif k == "key":
        keys = [KEY_MAP.get(x, x) for x in p.get("keys", [])][:4]
        pyautogui.hotkey(*keys) if len(keys) > 1 else pyautogui.press(keys[0])
    elif k == "type_text": pyautogui.write(str(p.get("text", ""))[:2000], interval=0.01)
    elif k == "open_url":
        u = str(p.get("url", ""))
        if not u.startswith(("http://", "https://")): return "failed", "Only web links"
        webbrowser.open(u)
    elif k == "open_app":
        app = str(p.get("app", "")).strip()
        if not app: return "failed", "No app"
        s = platform.system()
        if s == "Windows": subprocess.Popen(["cmd", "/c", "start", "", app], shell=False)
        elif s == "Darwin": subprocess.Popen(["open", "-a", app])
        else: subprocess.Popen([app])
    elif k == "lock":
        s = platform.system()
        if s == "Windows": import ctypes; ctypes.windll.user32.LockWorkStation()
        elif s == "Darwin": pyautogui.hotkey("ctrl", "command", "q")
        else: subprocess.Popen(["loginctl", "lock-session"])
    elif k in ("screenshot", "wake"): pass
    else: return "failed", f"Not supported on PC: {k}"
    return "done", None


def main():
    print("OSG PC Remote — orangesoundguild.com")
    cfg = load() or pair()
    results, last_frame, watch = [], 0.0, False
    with mss.mss() as sct:
        mon = sct.monitors[1]
        while True:
            body = {"deviceId": cfg["deviceId"], "token": cfg["token"], "width": mon["width"], "height": mon["height"], "results": results}
            if watch and time.time() - last_frame > 0.6:
                frame, w, h, mon = grab(sct)
                if frame: body["frame"] = frame
                last_frame = time.time()
            try:
                r = requests.post(f"{SITE}/api/public/remote/poll", json=body, timeout=20)
            except Exception as e:
                print("Connection problem, retrying…", e); time.sleep(3); continue
            if r.status_code == 401:
                print("This PC was disconnected on the website. Pair again.")
                os.remove(CONFIG); cfg = pair(); results = []; continue
            if not r.ok: time.sleep(2); continue
            results = []
            d = r.json(); watch = bool(d.get("watch"))
            for c in d.get("commands", []):
                try: status, msg = run(c, mon)
                except Exception as e: status, msg = "failed", str(e)[:200]
                results.append({"id": c["id"], "status": status, "result": msg})
                last_frame = 0  # refresh the screen right after an action
            time.sleep(0.15 if watch else 1.5)


if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: pass
