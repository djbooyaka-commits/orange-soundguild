
REVOKE ALL ON FUNCTION public.run_monthly_royalty_payout(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_monthly_royalty_payout(date) TO service_role, postgres;
