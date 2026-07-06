REVOKE SELECT (is_banned) ON public.profiles FROM authenticated;
REVOKE SELECT (is_banned) ON public.profiles FROM anon;