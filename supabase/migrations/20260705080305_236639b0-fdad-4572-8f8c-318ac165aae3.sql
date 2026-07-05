-- Restrict sensitive profile columns from public exposure
REVOKE SELECT (credit_balance_cents, referral_code, referred_by) ON public.profiles FROM anon, authenticated;

-- Owner-only RPC to fetch referral info
CREATE OR REPLACE FUNCTION public.get_my_referral_info()
RETURNS TABLE (
  referral_code TEXT,
  balance_cents INT,
  account_type public.account_type,
  referred_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.referral_code,
    p.credit_balance_cents,
    p.account_type,
    (SELECT count(*) FROM public.profiles WHERE referred_by = auth.uid())
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_referral_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_referral_info() TO authenticated;