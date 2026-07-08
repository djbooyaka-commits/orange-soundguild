
## Feature: Sell tracks & give away free download codes

Artists can put a price on any of their tracks (min $1) and/or generate up to 100 one-time claim codes per track. Fans pay via PayPal or Phantom (SOL/USDC), or redeem a code, then get a signed download link (WAV if the artist uploaded lossless, otherwise MP3) plus a permanent entry in their Library under a new "Owned" section.

## Database (migration)

New columns on `tracks`:
- `price_cents int` (nullable — null = not for sale)
- `download_lossless_url text` (nullable — optional WAV/FLAC the artist uploads alongside the MP3)

New tables:
- `track_purchases` — `id, user_id, track_id, price_cents, method` (paypal/phantom_sol/phantom_usdc/code), `tx_ref` (unique per method), `amount`, `created_at`. RLS: owner reads own; artist reads purchases of own tracks; service_role all. Grants for authenticated + service_role.
- `track_claim_codes` — `id, track_id, code (unique), created_by, claimed_by (nullable), claimed_at, created_at`. RLS: track owner manages own codes; claimer can read the one they claimed; service_role all.

RPC `claim_track_code(_code text)` (SECURITY DEFINER):
- Looks up unclaimed code, marks it claimed by `auth.uid()`, inserts a `track_purchases` row with method='code', returns the track_id. Enforces 100-code cap per track on creation side.

RPC `generate_track_codes(_track_id uuid, _count int)` (SECURITY DEFINER):
- Verifies caller owns the track, ensures total existing codes + `_count` ≤ 100, inserts random 10-char codes, returns the new codes.

Artist earnings for paid purchases credit `profiles.credit_balance_cents` (same balance used for cashouts today).

## Server functions (`src/lib/api/track-sales.functions.ts`)

- `getTrackForPurchase({ trackId })` — returns price, title, artist handle, whether current user already owns it.
- `createTrackPaypalOrder({ trackId })` — creates PayPal order for the track's price.
- `captureTrackPaypalOrder({ orderId, trackId })` — captures, verifies amount ≥ price, inserts `track_purchases`, credits artist balance.
- `verifyTrackSolanaPayment({ signature, token, trackId })` — mirrors existing `verifyArtistPayment` shape (SOL price via live SOL/USD, USDC by exact amount). Inserts purchase, credits artist.
- `claimTrackCode({ code })` — wraps `claim_track_code` RPC.
- `listMyOwnedTracks()` — returns tracks the current user has purchased/claimed with signed download URLs (lossless if present, else audio_url).
- `listMyTrackCodes({ trackId })` / `generateTrackCodes({ trackId, count })` — artist-only management.

Signed download URLs reuse the existing `signMedia` helper against the `audio` bucket.

## UI

**Artist side (`EditTrackDialog`)**
- New "Sell this track" section: price input ($, min 1.00, blank = not for sale), optional lossless file upload (WAV/FLAC → stored in `audio` bucket, path saved to `download_lossless_url`).
- New "Free download codes" panel: shows remaining codes / 100, "Generate N codes" button, list of unclaimed codes with copy-all button.

**Track pages (`t.$trackId.tsx`, `TrackCard` action menu)**
- If `price_cents` set and current user doesn't own → "Buy for $X" button opens a modal with PayPal + Phantom tabs (reuses `PaypalPayPanel` / `PhantomPayPanel` patterns).
- Always show "Have a code?" link → small form calling `claimTrackCode`.
- If owned → "Download" button (signed URL, prefers lossless).

**Library (`library.tsx`)**
- New "Owned" tab listing purchased/claimed tracks with per-row Download button.

## Technical notes

- Reuse `postPaymentSideEffects` pattern from `artist-payment.functions.ts` but simpler: no account_type change, no referral credit — just credit the artist's `credit_balance_cents` by the paid amount (minus zero fee for now; net = gross to artist).
- Solana verification reuses the same RPC fallback list and `fetchSolUsd` helpers — extract them into a shared `src/lib/api/solana.server.ts` in this change so both artist-subs and track sales use one implementation.
- Codes are 10 chars, uppercased, alphanumeric excluding easily confused chars (0/O/1/I). Cap enforced in RPC.
- Lossless upload uses the existing `audio` bucket + storage RLS; path pattern `lossless/{user_id}/{track_id}.{ext}`.
- Purchases are idempotent per `(method, tx_ref)` via a unique index, matching how `artist_subscriptions.tx_signature` is used today.

Scope is frontend + new server functions + one migration. No changes to auth, subscriptions, or existing payout flow.
