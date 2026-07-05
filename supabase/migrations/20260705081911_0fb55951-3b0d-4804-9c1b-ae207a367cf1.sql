CREATE OR REPLACE FUNCTION public.get_total_users()
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*) FROM public.profiles;
$$;

REVOKE ALL ON FUNCTION public.get_total_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_total_users() TO anon, authenticated;