# Windows Spotify Helper

- Build the native Windows helper with Go and Walk, with CGO disabled, so its single executable needs no Python installation.
- Reuse the curator desktop endpoint and require explicit confirmation before marking pasted tracks added; desktop automation cannot verify playlist contents.
- Keep generated releases in public/downloads and rebuild with the source changes so the site serves the matching executable.