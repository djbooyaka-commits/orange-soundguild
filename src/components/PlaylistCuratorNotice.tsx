import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Megaphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setBetaPlaylistNotice } from "@/lib/api/beta-playlist-rooms.functions";
import { Button } from "@/components/ui/button";

/** Curator-written message shown to every member of a playlist room. */
export function PlaylistCuratorNotice({
  playlistId,
  notice,
  isOwner,
}: {
  playlistId: string;
  notice: string | null;
  isOwner: boolean;
}) {
  const saveFn = useServerFn(setBetaPlaylistNotice);
  const [current, setCurrent] = useState(notice);
  const [draft, setDraft] = useState(notice ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCurrent(notice);
    setDraft(notice ?? "");
    setEditing(false);
  }, [notice, playlistId]);

  const save = async (text: string) => {
    setSaving(true);
    try {
      const r = await saveFn({ data: { playlistId, notice: text } });
      setCurrent(r.notice);
      setDraft(r.notice ?? "");
      setEditing(false);
      toast.success(r.notice ? "Notice saved" : "Notice cleared");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save notice");
    } finally {
      setSaving(false);
    }
  };

  if (!isOwner && !current) return null;

  return (
    <div className="mt-3 rounded-lg border-2 border-primary/40 bg-primary/10 p-4">
      <div className="flex items-start gap-3">
        <Megaphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">
            Message from the Curator
          </p>
          {isOwner && (editing || !current) ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Write a message for your members to see…"
                className="w-full rounded-md border border-input bg-background p-2 text-sm text-foreground"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => save(draft)} disabled={saving}>
                  {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                  Save notice
                </Button>
                {current && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <p className="mt-1 whitespace-pre-wrap break-words text-base font-medium leading-relaxed text-foreground">
                {current}
              </p>
              {isOwner && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => save("")} disabled={saving}>
                    Clear
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
