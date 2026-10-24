ALTER TABLE public.curator_submissions ADD COLUMN IF NOT EXISTS via_pool boolean NOT NULL DEFAULT false;
ALTER TABLE public.beta_submissions ADD COLUMN IF NOT EXISTS via_pool boolean NOT NULL DEFAULT false;
UPDATE public.curator_submissions SET via_pool = true WHERE daily_pass;
UPDATE public.beta_submissions SET via_pool = true WHERE daily_pass;

CREATE OR REPLACE FUNCTION public.curator_pool_summary(p_period_start date)
 RETURNS TABLE(curator_id uuid, username text, placements bigint, pool_cents integer, total_placements bigint, share_cents integer)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH pool AS (
    SELECT (COALESCE(sum(CASE WHEN upper(token) IN ('PAYPAL','USD','USDC') THEN amount ELSE 0 END),0) * 100 * 0.15)::int AS cents
    FROM public.artist_subscriptions
    WHERE tier = 'artist' AND paid_at >= p_period_start AND paid_at < (p_period_start + interval '1 month')
  ), subs AS (
    SELECT cs.curator_id AS cid FROM public.curator_submissions cs
    WHERE cs.via_pool AND cs.status = 'approved' AND cs.added_to_spotify
      AND cs.reviewed_at >= p_period_start AND cs.reviewed_at < (p_period_start + interval '1 month')
    UNION ALL
    SELECT bs.owner_id FROM public.beta_submissions bs
    WHERE bs.via_pool AND bs.status = 'approved' AND bs.added_to_spotify
      AND bs.reviewed_at >= p_period_start AND bs.reviewed_at < (p_period_start + interval '1 month')
  ), placed AS (
    SELECT s.cid AS curator_id, count(*) AS n FROM subs s
    JOIN public.profiles p ON p.id = s.cid AND p.account_type = 'superfan'
    GROUP BY s.cid
  ), tot AS (SELECT COALESCE(sum(n),0)::bigint AS t FROM placed)
  SELECT pl.curator_id, pr.username, pl.n, pool.cents, tot.t,
         CASE WHEN tot.t > 0 THEN floor(pool.cents * pl.n::numeric / tot.t)::int ELSE 0 END
  FROM placed pl CROSS JOIN pool CROSS JOIN tot
  LEFT JOIN public.profiles pr ON pr.id = pl.curator_id
  WHERE public.has_role(auth.uid(), 'admin') OR pl.curator_id = auth.uid()
  ORDER BY pl.n DESC;
$$;
GRANT EXECUTE ON FUNCTION public.curator_pool_summary(date) TO authenticated;