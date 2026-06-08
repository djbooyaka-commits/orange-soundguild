import { Link } from "@tanstack/react-router";
import { Search, Upload, Bell, Music2, LogOut } from "lucide-react";
import { UploadDialog } from "./UploadDialog";
import { CURRENT_USER } from "@/lib/uploads";
import { useAuth } from "@/hooks/useAuth";

export function Navbar() {
  const { user, signOut } = useAuth();
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2 font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Music2 className="h-4 w-4" />
          </span>
          <span className="hidden text-lg sm:inline">soundwave</span>
        </Link>

        <nav className="hidden items-center gap-1 text-sm text-muted-foreground md:flex">
          <Link to="/" className="rounded-md px-3 py-1.5 font-medium text-foreground hover:bg-muted" activeOptions={{ exact: true }}>
            Home
          </Link>
          <Link
            to="/u/$handle"
            params={{ handle: CURRENT_USER.handle }}
            className="rounded-md px-3 py-1.5 hover:bg-muted"
          >
            Profile
          </Link>
          <a className="rounded-md px-3 py-1.5 hover:bg-muted" href="#">Library</a>
        </nav>

        <div className="flex flex-1 items-center">
          <label className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search artists, tracks, genres…"
              className="h-10 w-full rounded-full border border-border bg-muted/60 pl-10 pr-4 text-sm outline-none transition focus:border-primary focus:bg-background focus:ring-2 focus:ring-primary/30"
            />
          </label>
        </div>

        <button className="hidden h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground sm:flex">
          <Bell className="h-4 w-4" />
        </button>

        <UploadDialog>
          <button className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105 active:scale-[0.98]">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Upload</span>
          </button>
        </UploadDialog>

        {user ? (
          <>
            <Link
              to="/u/$handle"
              params={{ handle: CURRENT_USER.handle }}
              className="h-9 w-9 rounded-full bg-secondary text-center text-sm font-semibold uppercase leading-9 text-secondary-foreground"
              aria-label="Your profile"
            >
              {(user.email ?? "U").charAt(0)}
            </Link>
            <button
              onClick={() => signOut()}
              className="hidden h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground sm:flex"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </>
        ) : (
          <Link
            to="/auth"
            className="inline-flex h-10 items-center rounded-full border border-border px-4 text-sm font-semibold hover:bg-muted"
          >
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
