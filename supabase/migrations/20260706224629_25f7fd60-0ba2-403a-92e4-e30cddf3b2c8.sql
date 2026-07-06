
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ref_code TEXT;
  ref_user UUID;
  v_tos BOOLEAN;
  v_tos_at TIMESTAMPTZ;
  v_pi_code TEXT;
  v_pi_id UUID;
  v_pi_max INT;
  v_pi_uses INT;
  v_account public.account_type := 'fan';
  v_promo_code CONSTANT TEXT := '9E599B23';
  v_promo_limit CONSTANT INT := 1000;
  v_promo_count INT;
BEGIN
  ref_code := NEW.raw_user_meta_data->>'ref_code';
  IF ref_code IS NOT NULL AND length(ref_code) > 0 THEN
    SELECT id INTO ref_user FROM public.profiles WHERE referral_code = upper(ref_code) LIMIT 1;
  END IF;

  v_tos := COALESCE((NEW.raw_user_meta_data->>'tos_accepted')::boolean, false);
  v_tos_at := CASE WHEN v_tos THEN now() ELSE NULL END;

  v_pi_code := NEW.raw_user_meta_data->>'pioneer_code';
  IF v_pi_code IS NOT NULL AND length(v_pi_code) > 0 THEN
    SELECT id, max_uses, uses_count
      INTO v_pi_id, v_pi_max, v_pi_uses
    FROM public.pioneer_invites
    WHERE code = upper(v_pi_code)
    LIMIT 1;
    IF v_pi_id IS NOT NULL AND (v_pi_max IS NULL OR v_pi_uses < v_pi_max) THEN
      v_account := 'pioneer';
    END IF;
  END IF;

  -- Promo: first 1000 signups via referral code 9E599B23 become Pioneer
  IF v_account = 'fan' AND ref_code IS NOT NULL AND upper(ref_code) = v_promo_code THEN
    SELECT count(*) INTO v_promo_count
    FROM public.profiles p
    JOIN public.profiles r ON r.id = p.referred_by
    WHERE r.referral_code = v_promo_code
      AND p.account_type = 'pioneer';
    IF v_promo_count < v_promo_limit THEN
      v_account := 'pioneer';
    END IF;
  END IF;

  INSERT INTO public.profiles (id, username, referred_by, tos_accepted, tos_accepted_at, account_type)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'user_' || substr(NEW.id::text, 1, 8)),
    ref_user,
    v_tos,
    v_tos_at,
    v_account
  )
  ON CONFLICT (id) DO NOTHING;

  IF v_account = 'pioneer' AND v_pi_id IS NOT NULL THEN
    UPDATE public.pioneer_invites
    SET uses_count = uses_count + 1,
        used_by = COALESCE(used_by, NEW.id),
        used_at = COALESCE(used_at, now())
    WHERE id = v_pi_id;
  END IF;

  IF NEW.email = 'djbooyaka@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
