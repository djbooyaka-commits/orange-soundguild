-- Restore Data API grants on profiles; keep account_type protected via trigger
GRANT SELECT, INSERT, DELETE ON public.profiles TO authenticated;
GRANT UPDATE (username, avatar_url, bio, updated_at) ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;