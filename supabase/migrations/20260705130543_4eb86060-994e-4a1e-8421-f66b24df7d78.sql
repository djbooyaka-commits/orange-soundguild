-- Restrict anon column-level access to sensitive profile fields
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, username, avatar_url, bio, account_type, created_at, updated_at) ON public.profiles TO anon;