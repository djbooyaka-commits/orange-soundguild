
CREATE OR REPLACE FUNCTION public.admin_set_account_type(_user_id uuid, _type public.account_type)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  UPDATE public.profiles SET account_type = _type WHERE id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_account_type(uuid, public.account_type) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_banned(_user_id uuid, _banned boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  UPDATE public.profiles SET is_banned = _banned WHERE id = _user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_banned(uuid, boolean) TO authenticated;
