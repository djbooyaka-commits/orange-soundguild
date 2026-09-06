CREATE OR REPLACE FUNCTION public.claim_referral(_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_current uuid;
  v_created timestamptz;
  v_ref uuid;
  v_clean text;
  v_account public.account_type;
  v_promo_code CONSTANT TEXT := '9E599B23';
  v_promo_limit CONSTANT INT := 1000;
  v_promo_count INT;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _code IS NULL THEN RETURN false; END IF;

  v_clean := upper(regexp_replace(_code, '[^A-Za-z0-9]', '', 'g'));
  IF length(v_clean) = 0 THEN RETURN false; END IF;

  SELECT referred_by, created_at, account_type INTO v_current, v_created, v_account
  FROM public.profiles WHERE id = v_user;

  IF v_current IS NOT NULL THEN RETURN false; END IF;
  IF v_created IS NULL OR v_created < (now() - interval '24 hours') THEN
    RETURN false;
  END IF;

  SELECT id INTO v_ref FROM public.profiles WHERE referral_code = v_clean LIMIT 1;
  IF v_ref IS NULL OR v_ref = v_user THEN RETURN false; END IF;

  UPDATE public.profiles SET referred_by = v_ref WHERE id = v_user;

  -- Promo: referral link grants a Pioneer account (parity with email signup)
  IF v_clean = v_promo_code AND v_account = 'fan' THEN
    SELECT count(*) INTO v_promo_count
    FROM public.profiles p
    JOIN public.profiles r ON r.id = p.referred_by
    WHERE r.referral_code = v_promo_code
      AND p.account_type = 'pioneer';
    IF v_promo_count < v_promo_limit THEN
      UPDATE public.profiles SET account_type = 'pioneer' WHERE id = v_user;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

-- Backfill members who joined via the promo link but stayed on Fan
UPDATE public.profiles p
SET account_type = 'pioneer'
FROM public.profiles r
WHERE r.id = p.referred_by
  AND r.referral_code = '9E599B23'
  AND p.account_type = 'fan';