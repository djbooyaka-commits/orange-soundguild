
CREATE OR REPLACE FUNCTION public.claim_referral(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_current uuid;
  v_created timestamptz;
  v_ref uuid;
  v_clean text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _code IS NULL THEN RETURN false; END IF;

  v_clean := upper(regexp_replace(_code, '[^A-Za-z0-9]', '', 'g'));
  IF length(v_clean) = 0 THEN RETURN false; END IF;

  SELECT referred_by, created_at INTO v_current, v_created
  FROM public.profiles WHERE id = v_user;

  IF v_current IS NOT NULL THEN RETURN false; END IF;
  -- Only allow attaching a referrer shortly after signup (prevents late gaming)
  IF v_created IS NULL OR v_created < (now() - interval '24 hours') THEN
    RETURN false;
  END IF;

  SELECT id INTO v_ref FROM public.profiles WHERE referral_code = v_clean LIMIT 1;
  IF v_ref IS NULL OR v_ref = v_user THEN RETURN false; END IF;

  -- Bypass the self-change trigger via SECURITY DEFINER
  UPDATE public.profiles SET referred_by = v_ref WHERE id = v_user;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_referral(text) FROM public;
GRANT EXECUTE ON FUNCTION public.claim_referral(text) TO authenticated;
