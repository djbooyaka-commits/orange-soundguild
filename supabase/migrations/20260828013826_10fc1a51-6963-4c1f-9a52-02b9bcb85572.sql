CREATE OR REPLACE FUNCTION public.admin_list_referrers()
RETURNS TABLE (user_id uuid, referrer_id uuid, referrer_username text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.referred_by, r.username
  FROM public.profiles p
  LEFT JOIN public.profiles r ON r.id = p.referred_by
  WHERE public.has_role(auth.uid(), 'admin');
$$;

REVOKE ALL ON FUNCTION public.admin_list_referrers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_referrers() TO authenticated;