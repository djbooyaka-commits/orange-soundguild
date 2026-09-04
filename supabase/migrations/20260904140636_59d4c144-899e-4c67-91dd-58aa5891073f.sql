CREATE OR REPLACE FUNCTION public.admin_royalty_unpaid_total()
RETURNS TABLE (pool_cents bigint, paid_cents bigint, unpaid_cents bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH subs AS (
    SELECT
      COUNT(*) FILTER (WHERE tier = 'artist')::bigint AS a_count,
      COUNT(*) FILTER (WHERE tier = 'superfan')::bigint AS s_count
    FROM public.artist_subscriptions
  ),
  paid AS (
    SELECT COALESCE(SUM(amount_cents), 0)::bigint AS cents
    FROM public.royalty_payouts
  )
  SELECT
    (subs.a_count * 500 + subs.s_count * 300)::bigint,
    paid.cents,
    GREATEST(0, (subs.a_count * 500 + subs.s_count * 300) - paid.cents)::bigint
  FROM subs, paid;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_royalty_unpaid_total() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_royalty_unpaid_total() TO authenticated;