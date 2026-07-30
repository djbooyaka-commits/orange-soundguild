-- Ensure no blanket row-wide SELECT on profiles for anon/authenticated
REVOKE SELECT ON public.profiles FROM anon, authenticated;

-- Re-grant only whitelisted public columns
GRANT SELECT (
  id, username, avatar_url, bio, account_type, created_at, updated_at,
  website_url, twitter_url, instagram_url, tiktok_url, youtube_url,
  spotify_url, facebook_url
) ON public.profiles TO anon, authenticated;

-- Keep service_role full access for server-side/admin code
GRANT ALL ON public.profiles TO service_role;

-- Rename policies to reflect that they only expose whitelisted public columns
DROP POLICY IF EXISTS "Authenticated can read profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public profile columns readable by anon" ON public.profiles;

CREATE POLICY "Public profile columns readable by authenticated"
ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Public profile columns readable by anon"
ON public.profiles FOR SELECT TO anon USING (true);
