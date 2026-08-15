-- Column-level lockdown of public.profiles
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.profiles FROM authenticated;

GRANT SELECT (
  id, username, avatar_url, bio, created_at, updated_at, account_type,
  website_url, twitter_url, instagram_url, tiktok_url, youtube_url,
  facebook_url, spotify_url, osg_weekly_min
) ON public.profiles TO anon;

GRANT SELECT (
  id, username, avatar_url, bio, created_at, updated_at, account_type,
  website_url, twitter_url, instagram_url, tiktok_url, youtube_url,
  facebook_url, spotify_url, osg_weekly_min
) ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;