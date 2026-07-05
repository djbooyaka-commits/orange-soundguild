-- Revoke broad UPDATE and re-grant only on user-editable columns
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (username, avatar_url, bio, updated_at) ON public.profiles TO authenticated;
-- service_role and admin flows keep full access
GRANT ALL ON public.profiles TO service_role;