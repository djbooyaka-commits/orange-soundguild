-- Defense-in-depth: revoke broad UPDATE on profiles and grant only safe columns to authenticated.
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE ON public.profiles FROM anon;

GRANT UPDATE (
  username,
  avatar_url,
  bio,
  website_url,
  twitter_url,
  instagram_url,
  tiktok_url,
  youtube_url,
  spotify_url,
  facebook_url,
  tos_accepted
) ON public.profiles TO authenticated;

-- service_role retains full access for admin/edge paths
GRANT ALL ON public.profiles TO service_role;