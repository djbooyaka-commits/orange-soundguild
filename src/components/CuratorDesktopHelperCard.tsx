import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Download, KeyRound, Monitor } from "lucide-react";
import { toast } from "sonner";
import { createCuratorDesktopKey } from "@/lib/api/curator-desktop.functions";
import { Button } from "@/components/ui/button";

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
            Adds approved tracks waiting in your Curator Playlists and Last.fm rooms to their Spotify playlists.
          </p>
        </div>
      </div>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Install the Spotify desktop app on Windows 10 or 11 (64-bit).</li>
        <li>Download and open OSG Spotify Helper. No Python installation needed.</li>
        <li>Paste your key, load the queue and pick a playlist. Follow the Spotify paste prompt, then confirm the tracks appeared.</li>
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">This download is unsigned, so Windows may show an unknown-publisher warning. Track removal still uses the site's existing tools or Spotify itself.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm">
          <a href="/downloads/OSG-Spotify-Helper.exe" download="OSG-Spotify-Helper.exe"><Download /> Download Windows app (.exe)</a>
        </Button>
        <Button onClick={generate} disabled={busy} size="sm" variant="outline">
          <KeyRound className="h-3 w-3" /> {key ? "Make a new key" : "Get my desktop key"}
        </Button>
      </div>
      {key && (
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border bg-background p-2">
          <code className="truncate text-xs">{key.key}</code>
          <Button
            onClick={() => { void navigator.clipboard.writeText(key.key); toast.success("Key copied"); }}
            size="sm" variant="outline" className="shrink-0"
          >
            <Copy className="h-3 w-3" /> Copy
          </Button>
          <p className="col-span-2 text-xs text-muted-foreground">
            Keep it private. Works until {new Date(key.expiresAt).toLocaleDateString()}.
          </p>
        </div>
      )}
    </div>
  );
}
