-- 1) Add 'superfan' to account_type enum
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'superfan';

-- 2) Extend profiles with referral fields + credit balance
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS credit_balance_cents INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS profiles_referred_by_idx ON public.profiles(referred_by);

-- 3) Referral code generator (uses md5+random, no pgcrypto dependency)
CREATE OR REPLACE FUNCTION public.generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  code TEXT;
  tries INT := 0;
BEGIN
  LOOP
    code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE referral_code = code) THEN
      RETURN code;
    END IF;
    tries := tries + 1;
    IF tries > 10 THEN RAISE EXCEPTION 'Could not generate referral code'; END IF;
  END LOOP;
END;
$$;

-- 4) Backfill referral_code
UPDATE public.profiles
SET referral_code = public.generate_referral_code()
WHERE referral_code IS NULL;

-- 5) Auto-set referral_code trigger
CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := public.generate_referral_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_referral_code ON public.profiles;
CREATE TRIGGER profiles_set_referral_code
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_referral_code();

-- 6) Update handle_new_user to capture referred_by
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_code TEXT;
  ref_user UUID;
BEGIN
  ref_code := NEW.raw_user_meta_data->>'ref_code';
  IF ref_code IS NOT NULL AND length(ref_code) > 0 THEN
    SELECT id INTO ref_user FROM public.profiles WHERE referral_code = upper(ref_code) LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, username, referred_by)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1), 'user_' || substr(NEW.id::text, 1, 8)),
    ref_user
  )
  ON CONFLICT (id) DO NOTHING;

  IF NEW.email = 'djbooyaka@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

-- 7) Tier column on subscriptions
ALTER TABLE public.artist_subscriptions
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'artist';

-- 8) Referral earnings ledger
CREATE TABLE IF NOT EXISTS public.referral_earnings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.artist_subscriptions(id) ON DELETE SET NULL,
  tier TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.referral_earnings TO authenticated;
GRANT ALL ON public.referral_earnings TO service_role;
ALTER TABLE public.referral_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Referrers see their own earnings" ON public.referral_earnings;
CREATE POLICY "Referrers see their own earnings"
ON public.referral_earnings FOR SELECT
TO authenticated
USING (auth.uid() = referrer_id);

DROP POLICY IF EXISTS "Admins see all earnings" ON public.referral_earnings;
CREATE POLICY "Admins see all earnings"
ON public.referral_earnings FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 9) Helper to credit referrer (service-role callers only via server functions)
CREATE OR REPLACE FUNCTION public.credit_referral(
  _referred_user UUID,
  _subscription_id UUID,
  _tier TEXT
) RETURNS VOID
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
  IF ref_type NOT IN ('artist', 'superfan') THEN RETURN; END IF;

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
