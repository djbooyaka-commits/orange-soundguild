# Windows Spotify Helper

- Build the native Windows helper with Go and Walk, with CGO disabled, so its single executable needs no Python installation.
- Reuse the curator desktop endpoint and require explicit confirmation before marking pasted tracks added; desktop automation cannot verify playlist contents.
- Open the selected playlist, bring only a verified Spotify.exe window forward and paste without a user countdown; never send keys when foreground verification fails.
- Keep generated releases in public/downloads and rebuild with the source changes so the site serves the matching executable.
- Load both curator and owner-scoped Last.fm Spotify queues through the shared endpoint; keep UUID track IDs compatible with older helpers.
- Check updates on opening from the fixed HTTPS site URL without curator credentials, verify bounded size/SHA-256 and Windows architecture, then swap via a detached helper with retries and rollback; this prevents interrupted pastes and locked-executable failures.
- Bump version.txt for each desktop release and generate spotify-helper-update.json from the packaged executable; the manifest and binary must ship together.