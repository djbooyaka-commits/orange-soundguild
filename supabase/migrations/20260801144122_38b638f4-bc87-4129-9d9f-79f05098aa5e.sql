CREATE OR REPLACE FUNCTION public.admin_royalty_pool_summary(p_period_start date DEFAULT NULL)
RETURNS TABLE(
  period_start date,
  artist_subs bigint,
  superfan_subs bigint,
  artist_pool_cents bigint,
  superfan_pool_cents bigint,
  pool_cents bigint,
  total_weighted_plays bigint,
  eligible_artists bigint,
  paid_out_cents bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  v_start := COALESCE(p_period_start, date_trunc('month', now())::date);
  v_end := (v_start + interval '1 month')::date;

  RETURN QUERY
  WITH subs AS (
    SELECT
      COUNT(*) FILTER (WHERE tier = 'artist')::bigint AS a_count,
      COUNT(*) FILTER (WHERE tier = 'superfan')::bigint AS s_count
    FROM public.artist_subscriptions
    WHERE created_at >= v_start AND created_at < v_end
  ),
  plays AS (
    SELECT t.user_id AS artist_user_id,
           SUM(CASE WHEN tp.sub_tier = 'artist' THEN 2
                    WHEN tp.sub_tier = 'superfan' THEN 1
                    ELSE 0 END)::bigint AS weighted
    FROM public.track_plays tp
    JOIN public.tracks t ON t.id = tp.track_id
    WHERE tp.created_at >= v_start AND tp.created_at < v_end
      AND tp.sub_tier IN ('artist','superfan')
    GROUP BY t.user_id
  ),
  eligible AS (
    SELECT * FROM plays WHERE weighted > 0 AND public.is_royalty_eligible(artist_user_id)
  ),
  paid AS (
    SELECT COALESCE(SUM(amount_cents), 0)::bigint AS cents
    FROM public.royalty_payouts rp
    WHERE rp.period_start = v_start
  )
  SELECT
    v_start,
    subs.a_count,
    subs.s_count,
    (subs.a_count * 500)::bigint,
    (subs.s_count * 300)::bigint,
    (subs.a_count * 500 + subs.s_count * 300)::bigint,
    COALESCE((SELECT SUM(weighted) FROM eligible), 0)::bigint,
    COALESCE((SELECT COUNT(*) FROM eligible), 0)::bigint,
    (SELECT cents FROM paid)
  FROM subs;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_royalty_pool_summary(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_royalty_pool_summary(date) TO authenticated;