
-- Extensions for cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1) Per-play log
CREATE TABLE public.track_plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  sub_tier text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX track_plays_created_at_idx ON public.track_plays(created_at);
CREATE INDEX track_plays_track_created_idx ON public.track_plays(track_id, created_at);
CREATE INDEX track_plays_tier_created_idx ON public.track_plays(sub_tier, created_at)
  WHERE sub_tier IN ('artist','superfan');

GRANT SELECT ON public.track_plays TO authenticated;
GRANT ALL ON public.track_plays TO service_role;

ALTER TABLE public.track_plays ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Track owners can view their plays"
ON public.track_plays FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.tracks t
  WHERE t.id = track_plays.track_id AND t.user_id = auth.uid()
));

CREATE POLICY "Admins can view all plays"
ON public.track_plays FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 2) Update record_track_play to also log to track_plays with the caller's tier
CREATE OR REPLACE FUNCTION public.record_track_play(p_track_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text;
BEGIN
  UPDATE public.tracks SET plays_count = plays_count + 1 WHERE id = p_track_id;
  IF auth.uid() IS NOT NULL THEN
    SELECT account_type::text INTO v_tier FROM public.profiles WHERE id = auth.uid();
  END IF;
  INSERT INTO public.track_plays(track_id, user_id, sub_tier)
  VALUES (p_track_id, auth.uid(), v_tier);
END;
$$;

-- 3) Payouts table
CREATE TABLE public.royalty_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  pool_cents integer NOT NULL,
  artist_weighted_plays bigint NOT NULL,
  total_weighted_plays bigint NOT NULL,
  amount_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_start)
);

GRANT SELECT ON public.royalty_payouts TO authenticated;
GRANT ALL ON public.royalty_payouts TO service_role;

ALTER TABLE public.royalty_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own payouts"
ON public.royalty_payouts FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Admins see all payouts"
ON public.royalty_payouts FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4) Monthly payout function
CREATE OR REPLACE FUNCTION public.run_monthly_royalty_payout(p_period_start date DEFAULT NULL)
RETURNS TABLE(paid_user_id uuid, paid_amount_cents integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
  v_pool_cents bigint;
  v_total_weighted bigint;
BEGIN
  v_start := COALESCE(p_period_start, (date_trunc('month', now() - interval '1 month'))::date);
  v_end := (v_start + interval '1 month')::date;

  -- Pool: $5 (artist sub) + $3 (superfan sub) per paid subscription in period
  SELECT COALESCE(SUM(
    CASE WHEN tier = 'artist' THEN 500
         WHEN tier = 'superfan' THEN 300
         ELSE 0 END
  ), 0)
    INTO v_pool_cents
  FROM public.artist_subscriptions
  WHERE created_at >= v_start AND created_at < v_end;

  IF v_pool_cents <= 0 THEN RETURN; END IF;

  CREATE TEMP TABLE _artist_plays ON COMMIT DROP AS
  SELECT t.user_id AS artist_user_id,
         SUM(CASE WHEN tp.sub_tier = 'artist' THEN 2
                  WHEN tp.sub_tier = 'superfan' THEN 1
                  ELSE 0 END)::bigint AS weighted
  FROM public.track_plays tp
  JOIN public.tracks t ON t.id = tp.track_id
  WHERE tp.created_at >= v_start AND tp.created_at < v_end
    AND tp.sub_tier IN ('artist','superfan')
  GROUP BY t.user_id;

  -- Keep only royalty-eligible artists
  DELETE FROM _artist_plays WHERE NOT public.is_royalty_eligible(artist_user_id);

  SELECT COALESCE(SUM(weighted), 0) INTO v_total_weighted FROM _artist_plays;
  IF v_total_weighted <= 0 THEN RETURN; END IF;

  RETURN QUERY
  WITH computed AS (
    SELECT ap.artist_user_id AS uid,
           ap.weighted,
           ((v_pool_cents * ap.weighted) / v_total_weighted)::integer AS amt
    FROM _artist_plays ap
    WHERE ap.weighted > 0
  ),
  inserted AS (
    INSERT INTO public.royalty_payouts(user_id, period_start, pool_cents,
      artist_weighted_plays, total_weighted_plays, amount_cents)
    SELECT c.uid, v_start, v_pool_cents::integer, c.weighted, v_total_weighted, c.amt
    FROM computed c
    WHERE c.amt > 0
    ON CONFLICT (user_id, period_start) DO NOTHING
    RETURNING user_id, amount_cents
  ),
  credited AS (
    UPDATE public.profiles p
    SET credit_balance_cents = credit_balance_cents + i.amount_cents
    FROM inserted i
    WHERE p.id = i.user_id
    RETURNING p.id, i.amount_cents
  )
  SELECT id, amount_cents FROM credited;
END;
$$;

-- 5) Schedule on the 1st of every month at 03:00 UTC (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'monthly-royalty-payout') THEN
    PERFORM cron.unschedule('monthly-royalty-payout');
  END IF;
  PERFORM cron.schedule(
    'monthly-royalty-payout',
    '0 3 1 * *',
    $cron$ SELECT public.run_monthly_royalty_payout(); $cron$
  );
END $$;
