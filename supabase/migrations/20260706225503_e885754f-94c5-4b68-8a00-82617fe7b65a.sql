
-- profiles: restrict authenticated & anon to safe columns only
REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, username, avatar_url, bio, created_at, updated_at, account_type,
  tos_accepted, tos_accepted_at,
  website_url, twitter_url, instagram_url, tiktok_url, youtube_url, spotify_url, facebook_url
) ON public.profiles TO anon, authenticated;

-- ad_campaigns: restrict SELECT columns for anon & authenticated (owners read sensitive fields via server code)
REVOKE SELECT ON public.ad_campaigns FROM anon, authenticated;
GRANT SELECT (
  id, user_id, package, placements, mode, track_id, image_url, headline, dest_url,
  status, starts_at, ends_at, created_at, updated_at
) ON public.ad_campaigns TO anon, authenticated;
