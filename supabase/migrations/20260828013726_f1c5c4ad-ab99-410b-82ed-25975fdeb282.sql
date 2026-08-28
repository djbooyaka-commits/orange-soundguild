CREATE OR REPLACE FUNCTION public.admin_set_referrer(_user_id uuid, _referrer text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref uuid;
  v_clean text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _referrer IS NULL OR length(btrim(_referrer)) = 0 THEN
    UPDATE public.profiles SET referred_by = NULL WHERE id = _user_id;
    RETURN true;
  END IF;

  v_clean := btrim(_referrer);

  SELECT id INTO v_ref FROM public.profiles
   WHERE referral_code = upper(regexp_replace(v_clean, '[^A-Za-z0-9]', '', 'g'))
   LIMIT 1;

  IF v_ref IS NULL THEN
    SELECT id INTO v_ref FROM public.profiles WHERE lower(username) = lower(v_clean) LIMIT 1;
  END IF;

  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'Referrer not found';
  END IF;
  IF v_ref = _user_id THEN
    RAISE EXCEPTION 'A user cannot refer themselves';
  END IF;

  UPDATE public.profiles SET referred_by = v_ref WHERE id = _user_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_referrer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_referrer(uuid, text) TO authenticated;