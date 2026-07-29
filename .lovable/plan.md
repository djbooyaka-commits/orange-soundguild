# Public Posts (7-day expiry)

A Twitter-style shared feed where any signed-in user can post short text. Posts auto-disappear after 7 days.

## What users see

- New route `/posts` linked from the Navbar ("Feed" or "Posts").
- Composer at top (signed-in only): textarea (max 280 chars), Post button.
- Chronological list of all non-expired posts across the whole site: avatar, @username, relative time, text, "expires in Xd".
- Delete button on your own posts. Admins can delete any post.
- Realtime: new posts appear live (Supabase Realtime on inserts).

## Data

New table `public.posts`:
- `user_id` (fk auth.users)
- `body` (text, 1–280 chars)
- `expires_at` (timestamptz, default `now() + interval '7 days'`)
- standard id/created_at/updated_at

RLS:
- SELECT for anon + authenticated where `expires_at > now()`
- INSERT authenticated, `user_id = auth.uid()`, body length 1–280 (trigger, not CHECK, since default uses now())
- DELETE own row OR admin (`has_role`)
- No UPDATE

Grants: SELECT to anon+authenticated; INSERT/DELETE to authenticated; ALL to service_role.

Expiry cleanup: rows are hidden by the SELECT policy immediately at 7 days. A lightweight scheduled cleanup (pg_cron via `/api/public/hooks/purge-expired-posts`) deletes rows older than 7 days daily to keep the table small.

## Files

- Migration: create table, trigger, policies, grants.
- `src/routes/posts.tsx` — feed page (public route with inline "Sign in to post" CTA).
- `src/components/PostComposer.tsx`, `src/components/PostList.tsx`.
- `src/lib/posts.ts` — hooks (list, create, delete) via supabase client + realtime channel.
- `src/routes/api/public/hooks/purge-expired-posts.ts` — POST handler that deletes expired rows.
- Navbar link added.

No changes to existing pages beyond the nav link.
