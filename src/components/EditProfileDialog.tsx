import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Save, User as UserIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type ProfileData = {
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  website_url?: string | null;
  twitter_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  facebook_url?: string | null;
  spotify_url?: string | null;
};

const SOCIALS: { key: keyof ProfileData; label: string; placeholder: string }[] = [
  { key: "website_url", label: "Website", placeholder: "https://yoursite.com" },
  { key: "instagram_url", label: "Instagram", placeholder: "https://instagram.com/yourhandle" },
  { key: "twitter_url", label: "X / Twitter", placeholder: "https://x.com/yourhandle" },
  { key: "tiktok_url", label: "TikTok", placeholder: "https://tiktok.com/@yourhandle" },
  { key: "youtube_url", label: "YouTube", placeholder: "https://youtube.com/@yourchannel" },
  { key: "facebook_url", label: "Facebook", placeholder: "https://facebook.com/yourhandle" },
  { key: "spotify_url", label: "Spotify", placeholder: "https://open.spotify.com/artist/..." },
];

function normalizeUrl(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function EditProfileDialog({
  children,
  profile,
  onSaved,
}: {
  children: React.ReactNode;
  profile: ProfileData | null;
  onSaved: (next: ProfileData) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [socials, setSocials] = useState<Record<string, string>>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setUsername(profile?.username ?? "");
    setBio(profile?.bio ?? "");
    setSocials(
      SOCIALS.reduce<Record<string, string>>((acc, s) => {
        acc[s.key as string] = (profile?.[s.key] as string | null) ?? "";
        return acc;
      }, {}),
    );
    setAvatarFile(null);
    setPreview(null);
  }, [open, profile]);

  useEffect(() => {
    if (!avatarFile) return;
    const url = URL.createObjectURL(avatarFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [avatarFile]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const name = username.trim();
    if (!name) {
      toast.error("Name cannot be empty");
      return;
    }
    setBusy(true);
    try {
      let avatarPath = profile?.avatar_url ?? null;
      if (avatarFile) {
        const safe = avatarFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${Date.now()}-${safe}`;
        const { error: upErr } = await supabase.storage
          .from("avatars")
          .upload(path, avatarFile, {
            contentType: avatarFile.type || "image/jpeg",
            upsert: false,
          });
        if (upErr) throw upErr;
        avatarPath = path;
      }

      const socialUpdate = SOCIALS.reduce<Record<string, string | null>>((acc, s) => {
        acc[s.key as string] = normalizeUrl(socials[s.key as string] ?? "");
        return acc;
      }, {});

      const { error: dbErr } = await supabase
        .from("profiles")
        .update({
          username: name,
          bio: bio.trim() || null,
          avatar_url: avatarPath,
          ...socialUpdate,
        })
        .eq("id", user.id);
      if (dbErr) throw dbErr;

      onSaved({
        username: name,
        bio: bio.trim() || null,
        avatar_url: avatarPath,
        ...socialUpdate,
      });
      toast.success("Profile updated");
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserIcon className="h-4 w-4 text-primary" /> Edit profile
          </DialogTitle>
          <DialogDescription>
            Update how your profile appears to listeners.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Display name</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              maxLength={50}
              placeholder="Your artist name"
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="Tell people about your sound"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Profile photo</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full items-center gap-3 rounded-md border border-dashed border-border bg-muted/40 p-3 text-left text-sm transition hover:border-primary hover:bg-muted"
            >
              <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary">
                {preview ? (
                  <img src={preview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-5 w-5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                {avatarFile ? (
                  <span className="block truncate font-medium text-foreground">
                    {avatarFile.name}
                  </span>
                ) : (
                  <>
                    <span className="block font-medium text-foreground">
                      Choose a new photo
                    </span>
                    <span className="text-xs text-muted-foreground">
                      PNG or JPG, square works best
                    </span>
                  </>
                )}
              </span>
            </button>
          </div>

          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
            <div className="text-xs font-semibold text-foreground">Social links</div>
            <p className="text-[11px] text-muted-foreground">
              Add any pages you want people to find. Leave blank to hide.
            </p>
            {SOCIALS.map((s) => (
              <div key={s.key as string} className="space-y-1">
                <label className="text-[11px] font-medium text-muted-foreground">{s.label}</label>
                <input
                  type="url"
                  value={socials[s.key as string] ?? ""}
                  onChange={(e) =>
                    setSocials((prev) => ({ ...prev, [s.key as string]: e.target.value }))
                  }
                  onPaste={(e) => {
                    if ((socials[s.key as string] ?? "").length > 0) {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData("text");
                      setSocials((prev) => ({ ...prev, [s.key as string]: pasted.trim() }));
                    }
                  }}
                  placeholder={s.placeholder}
                  className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                />

              </div>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !username.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
