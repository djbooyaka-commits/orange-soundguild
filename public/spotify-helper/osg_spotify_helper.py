"""OSG Spotify Helper - adds your Orange Sound Guild submission queue to Spotify
by pasting track links into the Spotify desktop app (no Web API add limits).

Removing tracks: select them in Spotify and press Delete; this helper focuses
the playlist for you. Keep your hands off the mouse/keyboard while it pastes.
"""
import json, os, re, sys, time, threading, tkinter as tk
from tkinter import ttk, messagebox
import urllib.request

SITE = "https://orangesoundguild.com"
CONF = os.path.join(os.path.expanduser("~"), ".osg_spotify_helper.json")
TRACK_RE = re.compile(r"(?:spotify:track:|open\.spotify\.com/(?:intl-[a-z]+/)?track/)([A-Za-z0-9]{22})")

def need(mod):
    try:
        return __import__(mod)
    except ImportError:
        messagebox.showerror("Missing part", f"Run start-osg-spotify-helper.bat so '{mod}' gets installed.")
        sys.exit(1)

pyautogui = need("pyautogui")
pyperclip = need("pyperclip")

def api(key, action, **extra):
    body = json.dumps({"key": key, "action": action, **extra}).encode()
    req = urllib.request.Request(SITE + "/api/public/curator-desktop", data=body, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            raise RuntimeError(json.loads(e.read()).get("error", str(e)))
        except ValueError:
            raise RuntimeError(str(e))

def focus_spotify():
    try:
        import pygetwindow as gw
        wins = [w for w in gw.getAllWindows() if w.title and ("Spotify" in w.title)]
        if wins:
            w = wins[0]
            if w.isMinimized: w.restore()
            w.activate()
            return True
    except Exception:
        pass
    return False

def paste_into_playlist(playlist_id, uris, log):
    pyperclip.copy("\n".join(uris))
    os.startfile(f"spotify:playlist:{playlist_id}")
    log("Opening playlist in Spotify...")
    time.sleep(5)
    focus_spotify()
    time.sleep(1)
    # Click into the track list area so the paste lands in the playlist.
    sw, sh = pyautogui.size()
    pyautogui.click(int(sw * 0.55), int(sh * 0.7))
    time.sleep(0.5)
    pyautogui.hotkey("ctrl", "v")
    time.sleep(3)
    log(f"Pasted {len(uris)} track(s). If Spotify asks about duplicates, choose what you want.")

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("OSG Spotify Helper")
        self.geometry("720x520")
        self.conf = json.load(open(CONF)) if os.path.exists(CONF) else {}
        top = ttk.Frame(self, padding=8); top.pack(fill="x")
        ttk.Label(top, text="Desktop key:").pack(side="left")
        self.key = tk.StringVar(value=self.conf.get("key", ""))
        ttk.Entry(top, textvariable=self.key, show="*", width=50).pack(side="left", padx=4)
        ttk.Button(top, text="Save & load queue", command=self.load).pack(side="left")
        nb = ttk.Notebook(self); nb.pack(fill="both", expand=True, padx=8)
        q = ttk.Frame(nb, padding=6); nb.add(q, text="Curator queue")
        self.tree = ttk.Treeview(q, columns=("count",), height=12)
        self.tree.heading("#0", text="Playlist / track"); self.tree.heading("count", text="To add")
        self.tree.column("count", width=80, anchor="center")
        self.tree.pack(fill="both", expand=True)
        ttk.Button(q, text="Add selected playlist's queue to Spotify", command=self.add_queue).pack(pady=6)
        m = ttk.Frame(nb, padding=6); nb.add(m, text="Manual links")
        ttk.Label(m, text="Paste Spotify track links (one per line), and a playlist link:").pack(anchor="w")
        self.manual = tk.Text(m, height=12); self.manual.pack(fill="both", expand=True)
        self.pl = tk.StringVar(); ttk.Entry(m, textvariable=self.pl).pack(fill="x", pady=4)
        ttk.Button(m, text="Add links to that playlist", command=self.add_manual).pack()
        self.status = tk.StringVar(value="Paste the key from your OSG Curator page, then load the queue.")
        ttk.Label(self, textvariable=self.status, padding=8, wraplength=690).pack(fill="x")
        self.data = []
        if self.key.get(): self.after(300, self.load)

    def log(self, msg): self.after(0, self.status.set, msg)

    def load(self):
        self.conf["key"] = self.key.get().strip(); json.dump(self.conf, open(CONF, "w"))
        def run():
            try:
                self.data = api(self.conf["key"], "queue")["playlists"]
                self.after(0, self.fill)
            except Exception as e:
                self.log(f"Could not load: {e}")
        threading.Thread(target=run, daemon=True).start()

    def fill(self):
        self.tree.delete(*self.tree.get_children())
        total = 0
        for p in self.data:
            n = len(p["tracks"]); total += n
            node = self.tree.insert("", "end", iid=p["id"], text=p["name"], values=(n,))
            for t in p["tracks"]:
                self.tree.insert(node, "end", text=t["name"], values=("",))
        self.log(f"{total} track(s) waiting to be added.")

    def add_queue(self):
        sel = self.tree.selection()
        pid = sel[0] if sel else None
        if pid and self.tree.parent(pid): pid = self.tree.parent(pid)
        p = next((x for x in self.data if x["id"] == pid), None)
        if not p or not p["tracks"]:
            return messagebox.showinfo("Nothing to add", "Pick a playlist that has tracks waiting.")
        def run():
            try:
                paste_into_playlist(p["spotify_playlist_id"], [t["uri"] for t in p["tracks"]], self.log)
                if messagebox.askyesno("Check Spotify", f"Did the {len(p['tracks'])} track(s) appear in '{p['name']}'?"):
                    r = api(self.conf["key"], "mark_added", ids=[t["id"] for t in p["tracks"]])
                    self.log(f"Marked {r.get('updated', 0)} as added on OSG.")
                    self.load()
            except Exception as e:
                self.log(f"Failed: {e}")
        threading.Thread(target=run, daemon=True).start()

    def add_manual(self):
        ids = TRACK_RE.findall(self.manual.get("1.0", "end"))
        m = re.search(r"playlist[:/]([A-Za-z0-9]{22})", self.pl.get())
        if not ids or not m:
            return messagebox.showinfo("Missing links", "Add track links and one playlist link.")
        uris = list(dict.fromkeys(f"spotify:track:{i}" for i in ids))
        threading.Thread(target=lambda: paste_into_playlist(m.group(1), uris, self.log), daemon=True).start()

if __name__ == "__main__":
    pyautogui.FAILSAFE = True  # move the mouse to a screen corner to stop
    App().mainloop()
