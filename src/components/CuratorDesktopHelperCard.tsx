import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, KeyRound, Monitor } from "lucide-react";
import { toast } from "sonner";
import { createCuratorDesktopKey } from "@/lib/api/curator-desktop.functions";

export function CuratorDesktopHelperCard() {
  const makeKey = useServerFn(createCuratorDesktopKey);
  const [key, setKey] = useState<{ key: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      setKey(await makeKey());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not make a key");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Monitor className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold">Spotify Helper for Windows</h2>
          <p className="text-sm text-muted-foreground">
            Adds your "Needs adding" tracks by pasting them into the Spotify desktop app, so there is no add limit.
          </p>
        </div>
      </div>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Install Python for Windows (tick "Add to PATH") and the Spotify desktop app.</li>
        <li>Download both files below into one folder, then double-click the .bat file.</li>
        <li>Paste your key, pick a playlist and press Add. Don't touch the mouse while it pastes.</li>
      </ol>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/spotify-helper/start-osg-spotify-helper.bat" download className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          <Download className="h-3 w-3" /> start-osg-spotify-helper.bat
        </a>
        <a href="/spotify-helper/osg_spotify_helper.py" download className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground">
          <Download className="h-3 w-3" /> osg_spotify_helper.py
        </a>
        <button onClick={generate} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
          <KeyRound className="h-3 w-3" /> {key ? "Make a new key" : "Get my desktop key"}
        </button>
      </div>
      {key && (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border bg-background p-2">
          <code className="truncate text-xs">{key.key}</code>
          <button
            onClick={() => { void navigator.clipboard.writeText(key.key); toast.success("Key copied"); }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
          <p className="col-span-2 text-xs text-muted-foreground">
            Keep it private. Works until {new Date(key.expiresAt).toLocaleDateString()}.
          </p>
        </div>
      )}
    </div>
  );
}
