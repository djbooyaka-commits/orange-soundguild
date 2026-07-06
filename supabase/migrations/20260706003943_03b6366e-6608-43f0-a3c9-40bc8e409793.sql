
-- Pioneer invites table
CREATE TABLE public.pioneer_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pioneer_invites TO authenticated;
GRANT ALL ON public.pioneer_invites TO service_role;
ALTER TABLE public.pioneer_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage pioneer invites"
  ON public.pioneer_invites
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin-only invite generator
CREATE OR REPLACE FUNCTION public.create_pioneer_invite()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_code text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  LOOP
    v_code := 'PN-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.pioneer_invites WHERE code = v_code);
  END LOOP;
  INSERT INTO public.pioneer_invites(code, created_by) VALUES (v_code, auth.uid());
  RETURN v_code;
END;
$$;

-- Update handle_new_user to redeem pioneer invite codes
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_code TEXT;
  ref_user UUID;
  v_tos BOOLEAN;
  v_tos_at TIMESTAMPTZ;
  v_pi_code TEXT;
  v_pi_id UUID;
  v_account public.account_type := 'fan';
BEGIN
  ref_code := NEW.raw_user_meta_data->>'ref_code';
  IF ref_code IS NOT NULL AND length(ref_code) > 0 THEN
    SELECT id INTO ref_user FROM public.profiles WHERE referral_code = upper(ref_code) LIMIT 1;
  END IF;

  v_tos := COALESCE((NEW.raw_user_meta_data->>'tos_accepted')::boolean, false);
  v_tos_at := CASE WHEN v_tos THEN now() ELSE NULL END;

  v_pi_code := NEW.raw_user_meta_data->>'pioneer_code';
  IF v_pi_code IS NOT NULL AND length(v_pi_code) > 0 THEN
    SELECT id INTO v_pi_id FROM public.pioneer_invites
      WHERE code = upper(v_pi_code) AND used_by IS NULL
      LIMIT 1;
    IF v_pi_id IS NOT NULL THEN
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

  IF v_pi_id IS NOT NULL THEN
    UPDATE public.pioneer_invites SET used_by = NEW.id, used_at = now() WHERE id = v_pi_id;
  END IF;

  IF NEW.email = 'djbooyaka@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- Enforce 5-track cap for Pioneer accounts
CREATE OR REPLACE FUNCTION public.enforce_pioneer_track_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_type public.account_type; v_count int;
BEGIN
  SELECT account_type INTO v_type FROM public.profiles WHERE id = NEW.user_id;
  IF v_type = 'pioneer' THEN
    SELECT count(*) INTO v_count FROM public.tracks WHERE user_id = NEW.user_id;
    IF v_count >= 5 THEN
      RAISE EXCEPTION 'Pioneer accounts are limited to 5 tracks. Upgrade to Artist to upload more.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_pioneer_limit ON public.tracks;
CREATE TRIGGER enforce_pioneer_limit BEFORE INSERT ON public.tracks
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pioneer_track_limit();

-- Extend referral commissions to include Pioneer referrers
CREATE OR REPLACE FUNCTION public.credit_referral(_referred_user uuid, _subscription_id uuid, _tier text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_id UUID;
  ref_type public.account_type;
  amount INT;
BEGIN
  SELECT referred_by INTO ref_id FROM public.profiles WHERE id = _referred_user;
  IF ref_id IS NULL THEN RETURN; END IF;

  SELECT account_type INTO ref_type FROM public.profiles WHERE id = ref_id;
  IF ref_type NOT IN ('artist', 'superfan', 'pioneer') THEN RETURN; END IF;

  IF _tier = 'artist' THEN amount := 100;
  ELSIF _tier = 'superfan' THEN amount := 50;
  ELSE RETURN;
  END IF;

  INSERT INTO public.referral_earnings (referrer_id, referred_user_id, subscription_id, tier, amount_cents)
  VALUES (ref_id, _referred_user, _subscription_id, _tier, amount);

  UPDATE public.profiles
  SET credit_balance_cents = credit_balance_cents + amount
  WHERE id = ref_id;
END;
$$;
