CREATE OR REPLACE FUNCTION public.prevent_account_type_self_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_is_admin boolean;
  v_claiming boolean := coalesce(current_setting('osg.claiming_referral', true), '') = 'on';
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  v_is_admin := public.has_role(auth.uid(), 'admin');
  IF v_is_admin THEN RETURN NEW; END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type AND NOT v_claiming THEN
    RAISE EXCEPTION 'Only admins can change account_type';
  END IF;
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    RAISE EXCEPTION 'Only admins can change is_banned';
  END IF;
  IF NEW.credit_balance_cents IS DISTINCT FROM OLD.credit_balance_cents THEN
    RAISE EXCEPTION 'Only admins can change credit_balance_cents';
  END IF;
  IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN
    RAISE EXCEPTION 'referral_code cannot be modified';
  END IF;
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by AND NOT (v_claiming AND OLD.referred_by IS NULL) THEN
    RAISE EXCEPTION 'referred_by cannot be modified';
  END IF;
  IF NEW.royalty_test_override IS DISTINCT FROM OLD.royalty_test_override THEN
    RAISE EXCEPTION 'Only admins can change royalty_test_override';
  END IF;
  IF NEW.tos_accepted_at IS DISTINCT FROM OLD.tos_accepted_at THEN
    RAISE EXCEPTION 'tos_accepted_at cannot be modified directly';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_referral(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _code IS NULL THEN RETURN false; END IF;
  v_clean := upper(regexp_replace(_code, '[^A-Za-z0-9]', '', 'g'));
  IF length(v_clean) = 0 THEN RETURN false; END IF;

  SELECT referred_by, created_at, account_type INTO v_current, v_created, v_account
  FROM public.profiles WHERE id = v_user;
  IF v_current IS NOT NULL THEN RETURN false; END IF;
  IF v_created IS NULL OR v_created < (now() - interval '24 hours') THEN RETURN false; END IF;

  SELECT id INTO v_ref FROM public.profiles WHERE referral_code = v_clean LIMIT 1;
  IF v_ref IS NULL OR v_ref = v_user THEN RETURN false; END IF;

  PERFORM set_config('osg.claiming_referral', 'on', true);
  UPDATE public.profiles SET referred_by = v_ref WHERE id = v_user;

  IF v_clean = v_promo_code AND v_account = 'fan' THEN
    SELECT count(*) INTO v_promo_count
    FROM public.profiles p JOIN public.profiles r ON r.id = p.referred_by
    WHERE r.referral_code = v_promo_code AND p.account_type = 'pioneer';
    IF v_promo_count < v_promo_limit THEN
      UPDATE public.profiles SET account_type = 'pioneer' WHERE id = v_user;
    END IF;
  END IF;
  PERFORM set_config('osg.claiming_referral', 'off', true);
  RETURN true;
END;
$$;