import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/playlist-submit")({
  beforeLoad: () => {
    throw redirect({ to: "/curator-playlists" });
  },
});
