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

VERSION = "1.2"
RELEASE = "https://github.com/djbooyaka-commits/orange-soundguild/releases/download/osg-pc-remote-latest"
SITE = os.environ.get("OSG_SITE", "https://orangesoundguild.com")
CONFIG = os.path.join(os.path.expanduser("~"), ".osg-remote", "config.json")
FRAME_WIDTH = 1152
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
        code = input("Pairing code from orangesoundguild.com/pc-remote: ").strip().upper()
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


def autostart():
    """Installed app (.exe): start automatically when the user signs in, so it's plug and play."""
    if not getattr(sys, "frozen", False): return
    exe = sys.executable
    try:
        s = platform.system()
        if s == "Windows":
            import winreg
            with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Run", 0, winreg.KEY_SET_VALUE) as k:
                winreg.SetValueEx(k, "OSG PC Remote", 0, winreg.REG_SZ, f'"{exe}"')
        elif s == "Linux":
            d = os.path.expanduser("~/.config/autostart"); os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, "osg-pc-remote.desktop"), "w") as f:
                f.write(f"[Desktop Entry]\nType=Application\nName=OSG PC Remote\nExec={exe}\nTerminal=true\n")
    except Exception as e:
        print("Could not set auto-start:", e)


def asset_name():
    s = platform.system()
    return "OSG-PC-Remote.exe" if s == "Windows" else "OSG-PC-Remote-mac" if s == "Darwin" else "OSG-PC-Remote-linux"


def check_update():
    """Installed app only: download a newer version from the release page and restart into it."""
    if not getattr(sys, "frozen", False): return
    try:
        info = requests.get(f"{RELEASE}/pc-version.json", timeout=15).json()
        latest = str(info.get("version", ""))
        if not latest or tuple(map(int, latest.split("."))) <= tuple(map(int, VERSION.split("."))): return
        print(f"Updating to version {latest}…")
        exe = sys.executable
        new = exe + ".new"
        with requests.get(f"{RELEASE}/{asset_name()}", stream=True, timeout=120) as r:
            r.raise_for_status()
            with open(new, "wb") as f:
                for chunk in r.iter_content(1 << 16): f.write(chunk)
        if os.path.getsize(new) < 5_000_000: os.remove(new); return  # not a real app download
        if platform.system() == "Windows":
            bat = os.path.join(os.path.dirname(exe), "osg-update.bat")
            with open(bat, "w") as f:
                f.write(f'@echo off\r\ntimeout /t 2 /nobreak >nul\r\nmove /y "{new}" "{exe}" >nul\r\nstart "" "{exe}"\r\ndel "%~f0"\r\n')
            subprocess.Popen(["cmd", "/c", bat], creationflags=0x00000008)  # detached
        else:
            os.chmod(new, 0o755); os.replace(new, exe)
            subprocess.Popen([exe])
        sys.exit(0)
    except SystemExit: raise
    except Exception as e:
        print("Update check skipped:", e)


def main():
    print("OSG PC Remote — orangesoundguild.com")
    print("Keep this window open (you can minimise it). It starts by itself when you sign in.")
    print(f"Version {VERSION}")
    check_update()
    cfg = load() or pair()
    autostart()
    last_update_check = time.time()
    results, last_frame, watch = [], 0.0, False
    with mss.mss() as sct:
        mon = sct.monitors[1]
        while True:
            body = {"deviceId": cfg["deviceId"], "token": cfg["token"], "width": mon["width"], "height": mon["height"], "results": results}
            if not watch and time.time() - last_update_check > 6 * 3600:
                last_update_check = time.time(); check_update()
            if watch and time.time() - last_frame > 0.25:
                try:
                    frame, w, h, mon = grab(sct)
                    if frame: body["frame"] = frame
                except Exception as e:
                    print("Screen capture failed, retrying…", e)
                    try: sct.close()
                    except Exception: pass
                    sct = mss.mss()
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
            time.sleep(0.05 if watch else 1.5)


if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: pass
