import { Link, useNavigate } from "@tanstack/react-router";
import { Search, Upload, Bell, Music2, LogOut, Sparkles, MessageCircle, User } from "lucide-react";
import { useEffect, useState } from "react";
import { UploadDialog } from "./UploadDialog";
import { CURRENT_USER } from "@/lib/uploads";
import { useAuth } from "@/hooks/useAuth";
import { useAccountType } from "@/hooks/useAccountType";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useUnreadMessages } from "@/hooks/useUnreadMessages";
import { FriendRequestsBell } from "./FriendRequestsBell";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import defaultAvatar from "@/assets/avatar.jpg";



const SIGNED_TTL = 60 * 60 * 24 * 365;

async function resolveAvatar(value: string | null | undefined): Promise<string> {
  if (!value) return defaultAvatar;
  if (value.startsWith("http")) return value;
  const { data } = await supabase.storage.from("avatars").createSignedUrl(value, SIGNED_TTL);
  return data?.signedUrl ?? defaultAvatar;
}

export function Navbar() {
  const { user, signOut } = useAuth();
  const { isArtist, accountType } = useAccountType();
  const canUpload = isArtist || accountType === "pioneer";
  const isAdmin = useIsAdmin();
  const unreadMessages = useUnreadMessages();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string>(defaultAvatar);

  useEffect(() => {
    if (!user) {
      setAvatarUrl(defaultAvatar);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("avatar_url")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const url = await resolveAvatar(data?.avatar_url);
      if (!cancelled) setAvatarUrl(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (

    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        {user ? (
          <FriendRequestsBell />
        ) : (
          <button
            type="button"
            aria-label="Notifications"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Bell className="h-4 w-4" />
          </button>
        )}
        <Link to="/" className="flex shrink-0 items-center gap-2 font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Music2 className="h-4 w-4" />
          </span>
          <span className="hidden whitespace-nowrap text-lg xl:inline">Orange Sound Guild</span>
        </Link>


        <nav className="hidden min-w-0 items-center gap-1 text-sm text-muted-foreground md:flex">
          <Link to="/" className="whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-foreground hover:bg-muted" activeOptions={{ exact: true }}>
            Home
          </Link>
          <Link to="/top100" className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">
            Top 100
          </Link>
          <Link to="/superfans" className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">
            Superfans
          </Link>
          <Link to="/discover" className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">
            Discover
          </Link>
          <Link
            to="/u/$handle"
            params={{ handle: CURRENT_USER.handle }}
            className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted"
          >
            Profile
          </Link>
          <Link to="/library" className="whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">Library</Link>
          {user && (
            <Link to="/messages" className="relative inline-flex items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">
              <MessageCircle className="h-4 w-4" /> Messages
              {unreadMessages > 0 && (
                <span className="ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {unreadMessages > 99 ? "99+" : unreadMessages}
                </span>
              )}
            </Link>
          )}
          {isAdmin && (

            <Link to="/admin" className="whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-primary hover:bg-muted">
              Admin
            </Link>
          )}
        </nav>


        <div className="flex min-w-0 flex-1 items-center justify-end md:justify-start">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const term = q.trim();
              if (term) navigate({ to: "/search", search: { q: term } });
            }}
            className="relative w-full max-w-xs"
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              placeholder="Search…"
              className="h-10 w-full rounded-full border border-border bg-muted/60 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/30"
            />
          </form>
        </div>





        {(!user || canUpload) && (
          <UploadDialog>
            <button
              type="button"
              aria-label="Upload track"
              className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 active:scale-[0.98]"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Upload</span>
            </button>
          </UploadDialog>
        )}
        {user && !canUpload && (
          <Link
            to="/upgrade"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 text-sm font-semibold text-primary transition hover:bg-primary/20"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Upgrade</span>
          </Link>
        )}

        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-9 w-9 overflow-hidden rounded-full bg-secondary"
                aria-label="Account menu"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={avatarUrl} alt={(user.email ?? "User") + " avatar"} className="object-cover" />
                  <AvatarFallback className="bg-secondary text-secondary-foreground">
                    <User className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>


            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link to="/u/$handle" params={{ handle: CURRENT_USER.handle }}>Profile</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/library">Library</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/messages">Messages</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/referrals">Referrals</Link>
              </DropdownMenuItem>
              {accountType === "superfan" && (
                <DropdownMenuItem asChild>
                  <Link to="/curator">Curator</Link>
                </DropdownMenuItem>
              )}
              {isArtist && (
                <DropdownMenuItem asChild>
                  <Link to="/royalties">Royalties</Link>
                </DropdownMenuItem>
              )}
              {isArtist && (
                <DropdownMenuItem asChild>
                  <Link to="/ads">Ads</Link>
                </DropdownMenuItem>
              )}
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/admin" className="font-medium text-primary">Admin</Link>
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

        ) : (
          <Link
            to="/auth"
            className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted"
          >
            Sign in
          </Link>
        )}
      </div>

      {/* Mobile tab row */}
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-border px-3 py-2 text-sm text-muted-foreground [scrollbar-width:none] [-ms-overflow-style:none] md:hidden [&::-webkit-scrollbar]:hidden">
        <Link to="/" className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-foreground hover:bg-muted" activeOptions={{ exact: true }}>Home</Link>
        <Link to="/top100" className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">Top 100</Link>
        <Link to="/superfans" className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">Superfans</Link>
        <Link to="/discover" className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">Discover</Link>
        <Link to="/u/$handle" params={{ handle: CURRENT_USER.handle }} className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">Profile</Link>
        <Link to="/library" className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">Library</Link>
        {user && (
          <Link to="/messages" className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 hover:bg-muted">
            <MessageCircle className="h-4 w-4" /> Messages
          </Link>
        )}
        {isAdmin && (

          <Link to="/admin" className="shrink-0 whitespace-nowrap rounded-md px-3 py-1.5 font-medium text-primary hover:bg-muted">Admin</Link>
        )}
      </nav>
    </header>
  );
}
