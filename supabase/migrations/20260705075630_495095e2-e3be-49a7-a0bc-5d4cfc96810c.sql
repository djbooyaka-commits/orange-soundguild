REVOKE ALL ON FUNCTION public.credit_referral(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_referral(uuid, uuid, text) TO service_role;
