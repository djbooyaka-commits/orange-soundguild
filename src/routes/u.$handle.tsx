import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/Navbar";
import { TrackCard } from "@/components/TrackCard";
import { AlbumCard } from "@/components/AlbumCard";
import { groupFeed } from "@/lib/albums";
import { useUserTracks } from "@/lib/feed";
import { CURRENT_USER, useUploads } from "@/lib/uploads";
import { UploadDialog } from "@/components/UploadDialog";
import { EditProfileDialog } from "@/components/EditProfileDialog";
import { PlaylistsSection } from "@/components/PlaylistsSection";
import { FollowersBox } from "@/components/FollowersBox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useFollow } from "@/lib/follows";
import { useIsAdmin, adminDeleteTrack, setUserBanned } from "@/hooks/useIsAdmin";
import { useAccountType } from "@/hooks/useAccountType";
import { SuperfanTopStats } from "@/components/SuperfanTopStats";
import { SuperfanPublicProfile } from "@/components/SuperfanPublicProfile";
import { toast } from "sonner";
import banner from "@/assets/banner.jpg";
import defaultAvatar from "@/assets/avatar.jpg";
import { Upload, Users, Music2, Pencil, UserCheck, UserPlus, ShieldOff, ShieldCheck, Award, Globe, Instagram, Twitter, Youtube, Music, Play, Shuffle, Share2 } from "lucide-react";
import { usePlayer } from "@/components/player/PlayerContext";
import { useRoyaltyProgress } from "@/hooks/useRoyaltyProgress";
import { FriendButton } from "@/components/FriendButton";

export const Route = createFileRoute("/u/$handle")({
  head: ({ params }) => {
    const handle = decodeURIComponent(params.handle);
    const url = `https://orange-soundguild.lovable.app/u/${params.handle}`;
    return {
      meta: [
        { title: `@${handle} — Orange Sound Guild` },
        { name: "description", content: `Listen to tracks uploaded by @${handle} on Orange Sound Guild.` },
        { property: "og:title", content: `@${handle} on Orange Sound Guild` },
        { property: "og:description", content: `Listen to tracks uploaded by @${handle} on Orange Sound Guild.` },
        { property: "og:type", content: "profile" },
        { property: "og:url", content: url },
        { property: "profile:username", content: handle },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ProfilePage",
            mainEntity: {
              "@type": "Person",
              name: handle,
              alternateName: `@${handle}`,
              url,
            },
          }),
        },
      ],
    };
  },
  component: ProfilePage,
});

type ProfileRow = {
  username: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_banned?: boolean | null;
  account_type?: string | null;
  website_url?: string | null;
  twitter_url?: string | null;
  instagram_url?: string | null;
  tiktok_url?: string | null;
  youtube_url?: string | null;
  facebook_url?: string | null;
  spotify_url?: string | null;
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
  const isAdmin = useIsAdmin();
  const { isArtist, accountType } = useAccountType();


  const isMe = handle === CURRENT_USER.handle;
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>(defaultAvatar);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  // "/u/me" is only a local alias — redirect to the real shareable /u/<username> URL
  useEffect(() => {
    if (isMe && profile?.username && profile.username !== handle) {
      navigate({ to: "/u/$handle", params: { handle: profile.username }, replace: true });
    }
  }, [isMe, profile?.username, handle, navigate]);

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
          .select("id, username, bio, avatar_url, account_type, website_url, twitter_url, instagram_url, tiktok_url, youtube_url, facebook_url, spotify_url")
          .eq("id", user.id)
          .maybeSingle();
        data = res.data ? { ...res.data, is_banned: null } : null;
      } else {
        const res = await supabase
          .from("profiles")
          .select("id, username, bio, avatar_url, account_type, website_url, twitter_url, instagram_url, tiktok_url, youtube_url, facebook_url, spotify_url")
          .eq("username", decodeURIComponent(handle))
          .maybeSingle();
        data = res.data ? { ...res.data, is_banned: null } : null;
      }
      if (cancelled) return;
      let banned: boolean | null = null;
      if (data?.id) {
        const { data: b } = await supabase.rpc("is_banned", { _user_id: data.id });
        banned = !!b;
      }
      setProfile(data ? {
        username: data.username,
        bio: data.bio,
        avatar_url: data.avatar_url,
        is_banned: banned,
        account_type: data.account_type,
        website_url: data.website_url,
        twitter_url: data.twitter_url,
        instagram_url: data.instagram_url,
        tiktok_url: data.tiktok_url,
        youtube_url: data.youtube_url,
        facebook_url: data.facebook_url,
        spotify_url: data.spotify_url,
      } : null);

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
  const effectiveAccountType = isMe ? accountType : profile?.account_type;
  const roleLabel =
    effectiveAccountType === "superfan"
      ? "Superfan"
      : effectiveAccountType === "fan"
        ? "Fan"
        : "Artist";
  const bio =
    profile?.bio?.trim() || `${roleLabel} on Orange Sound Guild.`;



  const { tracks: artistTracks } = useUserTracks(profileUserId);
  const ownedTrackIds = useMemo(() => new Set(uploads.map((track) => track.id)), [uploads]);
  const userTracks = useMemo(() => {
    const byId = new Map<string, (typeof artistTracks)[number]>();
    if (isMe) uploads.forEach((track) => byId.set(track.id, track));
    artistTracks.forEach((track) => byId.set(track.id, track));
    return Array.from(byId.values()).filter((t) => !hidden.has(t.id));
  }, [artistTracks, hidden, isMe, uploads]);

  const handleAdminDelete = async (id: string) => {
    try {
      await adminDeleteTrack(id);
      setHidden((prev) => new Set(prev).add(id));
      toast.success("Track removed.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const handleBanToggle = async () => {
    if (!profileUserId) return;
    const nextBanned = !profile?.is_banned;
    try {
      await setUserBanned(profileUserId, nextBanned);
      setProfile((p) => (p ? { ...p, is_banned: nextBanned } : p));
      toast.success(nextBanned ? `${displayName} has been banned.` : `${displayName} has been unbanned.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-40">
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
                src={avatarUrl}
                alt={`${displayName} avatar`}
                width={128}
                height={128}
                loading="lazy"
                className="h-24 w-24 rounded-full border-4 border-background object-cover shadow-[var(--shadow-elegant)] sm:h-32 sm:w-32"
              />
              <div className="pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{displayName}</h1>
                  {((isMe ? accountType : profile?.account_type) === "pioneer") && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/20 px-3.5 py-1 text-sm font-bold text-amber-500 ring-2 ring-amber-500/40 shadow-sm">
                      ★ Pioneer
                    </span>
                  )}
                  <RoyaltyBadge userId={profileUserId} />
                </div>
                <p className="text-sm text-muted-foreground">@{handle}</p>
                <p className="mt-1 max-w-md text-sm text-muted-foreground">{bio}</p>
                <SocialLinks profile={profile} />

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
                  {(isArtist || accountType === "pioneer") && (
                    <UploadDialog>
                      <button className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105">
                        <Upload className="h-4 w-4" /> Upload
                      </button>
                    </UploadDialog>
                  )}
                </>
              ) : (
                <>
                  <FollowButton targetUserId={profileUserId} />
                  <FriendButton targetUserId={profileUserId} />
                  {isAdmin && profileUserId && (
                    <button
                      onClick={handleBanToggle}
                      className={`inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-sm transition ${
                        profile?.is_banned
                          ? "bg-emerald-600 text-white hover:brightness-105"
                          : "bg-destructive text-destructive-foreground hover:brightness-105"
                      }`}
                    >
                      {profile?.is_banned ? (
                        <><ShieldCheck className="h-4 w-4" /> Unban</>
                      ) : (
                        <><ShieldOff className="h-4 w-4" /> Ban</>
                      )}
                    </button>
                  )}
                </>
              )}
              <ShareProfileButton handle={profile?.username?.trim() || (isMe ? "" : decodeURIComponent(handle))} />
              {isMe && profile?.is_banned && (
                <span className="inline-flex h-10 items-center gap-2 rounded-full bg-destructive/10 px-3 text-xs font-semibold text-destructive">
                  Your account is banned
                </span>
              )}
            </div>
          </div>




          {/* Stats */}
          <FollowStats
            userId={profileUserId}
            trackCount={userTracks.length}
            playCount={userTracks.reduce((n, t) => n + t.plays, 0)}
            isArtist={isMe ? (isArtist || accountType === "pioneer") : (profile?.account_type === "artist" || profile?.account_type === "pioneer")}
          />


        </div>
      </section>

      {/* Uploaded tracks */}
      <main className="mx-auto mt-8 max-w-7xl px-4 sm:px-6">
        {isMe && accountType === "superfan" && profileUserId && (
          <SuperfanPublicProfile userId={profileUserId} displayName="you" />
        )}

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {(isMe ? (isArtist || accountType === "pioneer") : (profile?.account_type === "artist" || profile?.account_type === "pioneer")) && (
              <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-bold tracking-tight">Uploaded tracks</h2>
                  {userTracks.length > 0 && <CatalogPlayControls tracks={userTracks} />}
                </div>

                {userTracks.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
                    <p className="text-sm text-muted-foreground">
                      {isMe
                        ? "You haven't uploaded anything yet. Click Upload to share your first track."
                        : `${displayName} hasn't uploaded any tracks yet.`}
                    </p>
                    {isMe && (isArtist || accountType === "pioneer") && (
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
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                    {groupFeed(userTracks).map((item) =>
                      item.type === "album" ? (
                        <AlbumCard
                          key={item.album.key}
                          album={item.album}
                          canEdit={isMe && item.album.tracks.every((t) => ownedTrackIds.has(t.id))}
                          linkHandle={displayName}
                        />
                      ) : (
                        <TrackCard
                          key={item.track.id}
                          track={item.track}
                          canEdit={isMe && ownedTrackIds.has(item.track.id)}
                          onDelete={isMe && ownedTrackIds.has(item.track.id) ? removeUpload : isAdmin ? handleAdminDelete : undefined}
                        />
                      ),
                    )}
                  </div>
                )}
              </>
            )}

            {!isMe && profileUserId && (
              <SuperfanPublicProfile userId={profileUserId} displayName={displayName} />
            )}
          </div>

          <aside className="min-w-0 space-y-6 lg:sticky lg:top-24 lg:self-start">
            <FollowersBox userId={profileUserId} />
            <div>
              <h2 className="mb-4 text-lg font-bold tracking-tight">Playlists</h2>
              <PlaylistsSection userId={profileUserId} isOwner={isMe} />
            </div>
          </aside>
        </div>




        <div className="mt-10 text-center text-xs text-muted-foreground">
          <Link to="/" className="hover:text-primary">← Back to feed</Link>
        </div>
      </main>
    </div>
  );
}

function ShareProfileButton({ handle }: { handle: string }) {
  if (!handle) return null;
  const url = `${publicOrigin()}/u/${encodeURIComponent(handle)}`;
  const onShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: `@${handle} on Orange Sound Guild`, url });
        return;
      }
      throw new Error("no-native-share");
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Profile link copied!");
      } catch {
        toast.error(`Copy this link: ${url}`);
      }
    }
  };
  return (
    <button
      onClick={onShare}
      title="Copy shareable profile link"
      className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold hover:bg-muted"
    >
      <Share2 className="h-4 w-4" /> Share
    </button>
  );
}

function CatalogPlayControls({ tracks }: { tracks: import("@/lib/tracks").Track[] }) {
  const { play, shuffle, toggleShuffle } = usePlayer();
  const playAll = () => {
    if (!tracks.length) return;
    play(tracks[0], tracks);
  };
  const shufflePlay = () => {
    if (!tracks.length) return;
    if (!shuffle) toggleShuffle();
    const idx = Math.floor(Math.random() * tracks.length);
    play(tracks[idx], tracks);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={playAll}
        className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:brightness-105"
      >
        <Play className="h-4 w-4 fill-current" /> Play all
      </button>
      <button
        onClick={shufflePlay}
        aria-pressed={shuffle}
        className="inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-semibold hover:bg-muted"
      >
        <Shuffle className="h-4 w-4" /> Shuffle
      </button>
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

function RoyaltyBadge({ userId }: { userId: string | null }) {
  const { data } = useRoyaltyProgress(userId);
  if (!data?.eligible) return null;
  return (
    <span
      title="Stream royalties unlocked"
      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
    >
      <Award className="h-3.5 w-3.5" /> Royalties unlocked
    </span>
  );
}

function FollowStats({
  userId,
  trackCount,
  playCount,
  isArtist,
}: {
  userId: string | null;
  trackCount: number;
  playCount: number;
  isArtist: boolean;
}) {
  const { followers, following } = useFollow(userId);
  const [monthlyListeners, setMonthlyListeners] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isArtist || !userId) {
      setMonthlyListeners(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("get_monthly_listeners", { _artist_id: userId });
      if (cancelled) return;
      if (error) {
        setMonthlyListeners(0);
        return;
      }
      setMonthlyListeners(typeof data === "number" ? data : Number(data ?? 0));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, isArtist]);

  return (
    <div className="mt-6 flex flex-wrap gap-6 border-b border-border pb-4 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        <Music2 className="h-4 w-4 text-primary" />
        <strong className="font-semibold text-foreground">{trackCount}</strong> tracks
      </span>
      <span className="text-muted-foreground">
        <strong className="font-semibold text-foreground">{playCount.toLocaleString()}</strong> plays
      </span>
      {isArtist && (
        <span className="text-muted-foreground">
          <strong className="font-semibold text-foreground">
            {(monthlyListeners ?? 0).toLocaleString()}
          </strong>{" "}
          monthly listeners
        </span>
      )}
      <span className="text-muted-foreground">
        <strong className="font-semibold text-foreground">{followers}</strong> followers
      </span>
      <span className="text-muted-foreground">
        <strong className="font-semibold text-foreground">{following}</strong> following
      </span>
    </div>
  );
}

function SocialLinks({ profile }: { profile: ProfileRow | null }) {
  if (!profile) return null;
  const items: { url: string | null | undefined; label: string; icon: React.ReactNode }[] = [
    { url: profile.website_url, label: "Website", icon: <Globe className="h-3.5 w-3.5" /> },
    { url: profile.instagram_url, label: "Instagram", icon: <Instagram className="h-3.5 w-3.5" /> },
    { url: profile.twitter_url, label: "X", icon: <Twitter className="h-3.5 w-3.5" /> },
    { url: profile.tiktok_url, label: "TikTok", icon: <Music className="h-3.5 w-3.5" /> },
    { url: profile.youtube_url, label: "YouTube", icon: <Youtube className="h-3.5 w-3.5" /> },
    { url: profile.facebook_url, label: "Facebook", icon: <Music2 className="h-3.5 w-3.5" /> },
    { url: profile.spotify_url, label: "Spotify", icon: <Music2 className="h-3.5 w-3.5" /> },
  ].filter((i) => i.url && i.url.trim().length > 0);
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {items.map((i) => (
        <a
          key={i.label}
          href={i.url!}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition hover:border-primary hover:text-primary"
        >
          {i.icon} {i.label}
        </a>
      ))}
    </div>
  );
}



