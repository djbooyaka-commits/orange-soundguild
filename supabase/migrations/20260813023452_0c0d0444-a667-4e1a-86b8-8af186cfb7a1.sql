-- profiles: no writes for anonymous visitors; keep column-level read grants intact
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM anon;
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.profiles FROM authenticated;
GRANT INSERT (id, username, avatar_url, bio) ON public.profiles TO authenticated;

-- ad_campaigns: anonymous visitors need no access at all
REVOKE ALL ON public.ad_campaigns FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_campaigns TO authenticated;
GRANT ALL ON public.ad_campaigns TO service_role;
