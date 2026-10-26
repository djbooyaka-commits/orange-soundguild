# Project Rules

- Last.fm curator passes are represented by a negative playlist adjustment, but removals must be clamped to the member's available balance so a pass never creates point debt.
- Last.fm room links share one room-level curator-named tab; each link is a row inside it, not another tab, so members can scan all links together.
- Curator Pool earnings use authenticated user-scoped reads of existing opt-ins and accounting; keep estimates separate from credited cashout balances because the summary does not accrue money.
- The Curator Playlists directory owns filtered options and selection for its submission form, using shared selection helpers so cards and the dropdown always target the same visible playlist.