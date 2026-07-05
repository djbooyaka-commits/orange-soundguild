
-- Tighten anon SELECT to public columns only
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, username, avatar_url, bio, account_type, created_at, updated_at) ON public.profiles TO anon;

-- Tighten authenticated: full SELECT still allowed (owner-scoped by RLS + trigger),
-- but restrict UPDATE at the column level to safe user-editable fields only.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (username, avatar_url, bio) ON public.profiles TO authenticated;

-- Extend the guard trigger to also block user changes to royalty_test_override
CREATE OR REPLACE FUNCTION public.prevent_account_type_self_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_admin boolean;
BEGIN
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
  IF NEW.royalty_test_override IS DISTINCT FROM OLD.royalty_test_override THEN
    RAISE EXCEPTION 'Only admins can change royalty_test_override';
  END IF;

  RETURN NEW;
END;
$function$;
