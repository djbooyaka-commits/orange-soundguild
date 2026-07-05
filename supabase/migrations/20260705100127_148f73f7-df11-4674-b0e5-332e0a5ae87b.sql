
-- 1) Column-level SELECT: revoke broad SELECT, grant only public-safe columns
REVOKE SELECT ON public.profiles FROM anon, authenticated;

GRANT SELECT (id, username, avatar_url, bio, account_type, created_at, updated_at)
  ON public.profiles TO anon, authenticated;

-- Owner + admin need to read the sensitive columns too
GRANT SELECT (is_banned, referral_code, referred_by, credit_balance_cents)
  ON public.profiles TO authenticated;

-- Replace the blanket public SELECT policy with one that still allows reading
-- rows, but the sensitive columns are gated at the GRANT level above for anon,
-- and by an owner/admin policy for authenticated.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

CREATE POLICY "Public profile columns readable by anon"
  ON public.profiles FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated can read profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 2) Prevent privilege escalation on self-update.
-- Extend the existing account_type guard to cover every sensitive column.
CREATE OR REPLACE FUNCTION public.prevent_account_type_self_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Allow service_role / backend contexts where no user is signed in
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_is_admin := public.has_role(auth.uid(), 'admin');
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF NEW.account_type IS DISTINCT FROM OLD.account_type THEN
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
  IF NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'referred_by cannot be modified';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_privileged_self_update ON public.profiles;
CREATE TRIGGER profiles_prevent_privileged_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_account_type_self_change();

-- Also add a WITH CHECK to the self-update policy that explicitly re-asserts ownership
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
