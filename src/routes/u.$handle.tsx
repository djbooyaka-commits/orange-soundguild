import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { TrackCard } from "@/components/TrackCard";
import { tracks } from "@/lib/tracks";
import { useUserTracks } from "@/lib/feed";
import { CURRENT_USER, useUploads } from "@/lib/uploads";
import { UploadDialog } from "@/components/UploadDialog";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { PlaylistsSection } from "@/components/PlaylistsSection";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFollow } from "@/lib/follows";
import { toast } from "sonner";
import banner from "@/assets/banner.jpg";
import defaultAvatar from "@/assets/avatar.jpg";
import { Upload, Users, Music2, Pencil, UserCheck, UserPlus } from "lucide-react";

export const Route = createFileRoute("/u/$handle")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.handle} — soundwave` },
      { name: "description", content: `Listen to tracks uploaded by @${params.handle} on soundwave.` },
    ],
  }),
  component: ProfilePage,
});

type ProfileRow = {
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
};

const SIGNED_TTL = 60 * 60 * 24 * 365;

async function resolveAvatar(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (value.startsWith("http")) return value;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(value, SIGNED_TTL);
  return data?.signedUrl ?? null;
}

function ProfilePage() {
  const { handle } = Route.useParams();
  const { uploads, removeUpload } = useUploads();
  const { user } = useAuth();

  const isMe = handle === CURRENT_USER.handle;
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>(defaultAvatar);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  // Load profile (own or viewed user) from database
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let data: (ProfileRow & { id: string }) | null = null;
      if (isMe) {
        if (!user) {
          setProfile(null);
          setAvatarUrl(defaultAvatar);
          setProfileUserId(null);
          return;
        }
        const res = await supabase
          .from("profiles")
          .select("id, username, bio, avatar_url")
          .eq("id", user.id)
          .maybeSingle();
        data = res.data ?? null;
      } else {
        const res = await supabase
          .from("profiles")
          .select("id, username, bio, avatar_url")
          .eq("username", decodeURIComponent(handle))
          .maybeSingle();
        data = res.data ?? null;
      }
      if (cancelled) return;
      setProfile(data ? { username: data.username, bio: data.bio, avatar_url: data.avatar_url } : null);
      setProfileUserId(data?.id ?? null);
      const resolved = await resolveAvatar(data?.avatar_url);
      if (!cancelled) setAvatarUrl(resolved ?? defaultAvatar);
    })();
    return () => {
      cancelled = true;
    };
  }, [isMe, user, handle]);

  const displayName = isMe
    ? profile?.username?.trim() || CURRENT_USER.name
    : profile?.username?.trim() || decodeURIComponent(handle).replace(/-/g, " ");
  const bio = isMe
    ? profile?.bio?.trim() || CURRENT_USER.bio
    : profile?.bio?.trim() || "Artist on soundwave.";

  const { tracks: artistTracks } = useUserTracks(!isMe ? profileUserId : null);
  const mockArtistTracks = !isMe ? tracks.filter((t) => t.artist.toLowerCase() === displayName.toLowerCase()) : [];
  const userTracks = isMe ? uploads : [...artistTracks, ...mockArtistTracks];

  return (
    <div className="min-h-screen bg-background pb-28">
      <Navbar />

      {/* Banner */}
      <section className="relative">
        <div className="h-48 w-full overflow-hidden sm:h-64">
          <img
            src={banner}
            alt=""
            width={1600}
            height={512}
            className="h-full w-full object-cover"
          />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="-mt-12 flex flex-col items-start gap-4 sm:-mt-16 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex items-end gap-4">
              <img
                src={isMe ? avatarUrl : defaultAvatar}
                alt={`${displayName} avatar`}
                width={128}
                height={128}
                loading="lazy"
                className="h-24 w-24 rounded-full border-4 border-background object-cover shadow-[var(--shadow-elegant)] sm:h-32 sm:w-32"
              />
              <div className="pb-2">
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{displayName}</h1>
                <p className="text-sm text-muted-foreground">@{handle}</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">{bio}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 pb-2">
              {isMe ? (
                <>
                  <EditProfileDialog
                    profile={profile}
                    onSaved={async (next) => {
                      setProfile(next);
                      const resolved = await resolveAvatar(next.avatar_url);
                      setAvatarUrl(resolved ?? defaultAvatar);
                    }}
                  >
                    <button className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold hover:bg-muted">
                      <Pencil className="h-4 w-4" /> Edit profile
                    </button>
                  </EditProfileDialog>
                  <UploadDialog>
                    <button className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105">
                      <Upload className="h-4 w-4" /> Upload
                    </button>
                  </UploadDialog>
                </>
              ) : (
                <FollowButton targetUserId={profileUserId} />
              )}
            </div>
          </div>


          {/* Stats */}
          <FollowStats userId={profileUserId} trackCount={userTracks.length} playCount={userTracks.reduce((n, t) => n + t.plays, 0)} />

        </div>
      </section>

      {/* Uploaded tracks */}
      <main className="mx-auto mt-8 max-w-7xl px-4 sm:px-6">
        <h2 className="mb-5 text-lg font-bold tracking-tight">Uploaded tracks</h2>

        {userTracks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {isMe
                ? "You haven't uploaded anything yet. Click Upload to share your first track."
                : `${displayName} hasn't uploaded any tracks yet.`}
            </p>
            {isMe && (
              <div className="mt-4 inline-block">
                <UploadDialog>
                  <button className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105">
                    <Upload className="h-4 w-4" /> Upload your first track
                  </button>
                </UploadDialog>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {userTracks.map((t) => (
              <TrackCard key={t.id} track={t} onDelete={isMe ? removeUpload : undefined} />
            ))}
          </div>
        )}

        <h2 className="mb-5 mt-12 text-lg font-bold tracking-tight">Playlists</h2>
        <PlaylistsSection userId={profileUserId} isOwner={isMe} />

        <div className="mt-10 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">← Back to feed</Link>
        </div>
      </main>
    </div>
  );
}

function FollowButton({ targetUserId }: { targetUserId: string | null }) {
  const { user } = useAuth();
  const { isFollowing, toggle, loading, canFollow } = useFollow(targetUserId);

  if (!targetUserId) {
    return (
      <button disabled className="inline-flex h-10 items-center gap-2 rounded-full bg-muted px-4 text-sm font-semibold text-muted-foreground">
        <Users className="h-4 w-4" /> Follow
      </button>
    );
  }
  const onClick = async () => {
    if (!user) {
      toast.message("Sign in to follow artists.");
      return;
    }
    try {
      await toggle();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  return (
    <button
      onClick={onClick}
      disabled={loading || (user && !canFollow) || false}
      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-sm transition ${
        isFollowing
          ? "border border-border bg-background text-foreground hover:bg-muted"
          : "bg-primary text-primary-foreground hover:brightness-105"
      } disabled:opacity-60`}
    >
      {isFollowing ? <UserCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
      {isFollowing ? "Following" : "Follow"}
    </button>
  );
}

function FollowStats({ userId, trackCount, playCount }: { userId: string | null; trackCount: number; playCount: number }) {
  const { followers, following } = useFollow(userId);
  return (
    <div className="mt-6 flex flex-wrap gap-6 border-b border-border pb-4 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Music2 className="h-4 w-4 text-primary" />
        <strong className="font-semibold text-foreground">{trackCount}</strong> tracks
      </span>
      <span className="text-muted-foreground">
        <strong className="font-semibold text-foreground">{playCount.toLocaleString()}</strong> plays
      </span>
      <span className="text-muted-foreground">
        <strong className="font-semibold text-foreground">{followers}</strong> followers
      </span>
      <span className="text-muted-foreground">
        <strong className="font-semibold text-foreground">{following}</strong> following
      </span>
    </div>
  );
}

