# Project Rules

- Last.fm curator passes are represented by a negative playlist adjustment, but removals must be clamped to the member's available balance so a pass never creates point debt.
- Last.fm room links share one room-level curator-named tab; each link is a row inside it, not another tab, so members can scan all links together.
- Curator Pool earnings use authenticated user-scoped reads of existing opt-ins and accounting; keep estimates separate from credited cashout balances because the summary does not accrue money.
- The Curator Playlists directory owns filtered options and selection for its submission form, using shared selection helpers so cards and the dropdown always target the same visible playlist.- Phone Remote: the Android app (android/) talks only to /api/public/remote/pair and /poll with a per-device token (server stores its sha256), so the phone never needs a site login; the web page sets watch_until so the phone streams frames only while viewed.
- Phone Remote live video uses WebRTC: the browser's offer travels as a webrtc_offer command and the phone's answer returns via /poll into remote_devices.webrtc_answer (non-trickle ICE, STUN only); taps go over the data channel when open, else fall back to queued commands, because the phone has no site login or realtime access.

- Android capture assistance must be bounded to a locally initiated capture request and a verified system capture dialog; stop on the activity result and locate confirmation controls afresh before gesture fallback to avoid touching unrelated prompts.
- Android updates use the fixed GitHub release's update.json, verify APK checksum/package/version/signature, and hand installation to Android via a cache-scoped FileProvider; this keeps phone credentials off GitHub and preserves user-confirmed installation.
