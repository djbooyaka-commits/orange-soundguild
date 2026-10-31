CREATE OR REPLACE FUNCTION public.get_royalty_progress(_user_id uuid)
 RETURNS TABLE(followers bigint, artist_referrals bigint, superfan_referrals bigint, eligible boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH f AS (SELECT count(*)::bigint AS n FROM public.follows WHERE following_id = _user_id),
  ar AS (SELECT count(*)::bigint AS n FROM public.profiles p WHERE p.referred_by = _user_id AND p.account_type = 'artist'),
  sr AS (SELECT count(*)::bigint AS n FROM public.profiles p WHERE p.referred_by = _user_id AND p.account_type = 'superfan'),
  o AS (SELECT COALESCE(royalty_test_override, false) AS ov, account_type AS t FROM public.profiles WHERE id = _user_id)
  SELECT f.n, ar.n, sr.n,
    (COALESCE(o.ov, false)
     OR o.t = 'artist'
     OR (o.t = 'pioneer' AND (f.n >= 500 OR ar.n >= 20 OR sr.n >= 40))) AS eligible
  FROM f, ar, sr LEFT JOIN o ON true;
$function$;

CREATE OR REPLACE FUNCTION public.request_payout(_method public.payout_method, _destination text, _amount_cents integer)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance integer;
  v_type public.account_type;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _amount_cents < 2500 THEN RAISE EXCEPTION 'Minimum cashout is $25'; END IF;
  IF _destination IS NULL OR length(btrim(_destination)) = 0 THEN RAISE EXCEPTION 'Destination is required'; END IF;

  SELECT credit_balance_cents, account_type INTO v_balance, v_type
  FROM public.profiles WHERE id = v_user FOR UPDATE;

  IF v_type IS DISTINCT FROM 'artist' THEN
    RAISE EXCEPTION 'A paid Artist account is required to cash out';
  END IF;
  IF v_balance IS NULL OR v_balance < _amount_cents THEN RAISE EXCEPTION 'Insufficient balance'; END IF;

  UPDATE public.profiles SET credit_balance_cents = credit_balance_cents - _amount_cents WHERE id = v_user;
  INSERT INTO public.payout_requests (user_id, method, destination, amount_cents)
  VALUES (v_user, _method, btrim(_destination), _amount_cents) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.request_payout(public.payout_method, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.request_payout(public.payout_method, text, integer) TO authenticated;