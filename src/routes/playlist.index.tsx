import { createFileRoute, redirect } from "@tanstack/react-router";

// Bare /playlist has no single playlist to show; send people to their saved playlists.
export const Route = createFileRoute("/playlist/")({
  beforeLoad: () => {
    throw redirect({ to: "/library" });
  },
});
