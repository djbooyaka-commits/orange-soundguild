
-- Revoke column-level SELECT on is_banned from public roles
REVOKE SELECT (is_banned) ON public.profiles FROM anon, authenticated;

-- Restrict the is_banned() helper so it only returns data to self or admins
CREATE OR REPLACE FUNCTION public.is_banned(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.uid() = _user_id OR public.has_role(auth.uid(), 'admin')
      THEN COALESCE((SELECT is_banned FROM public.profiles WHERE id = _user_id), false)
    ELSE false
  END
$function$;

GRANT EXECUTE ON FUNCTION public.is_banned(uuid) TO anon, authenticated;
