
-- Add sale columns to tracks
ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS price_cents integer,
  ADD COLUMN IF NOT EXISTS download_lossless_url text;

ALTER TABLE public.tracks
  ADD CONSTRAINT tracks_price_min_check CHECK (price_cents IS NULL OR price_cents >= 100);

-- Purchases
CREATE TABLE public.track_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('paypal','phantom_sol','phantom_usdc','code')),
  tx_ref text NOT NULL,
  price_cents integer NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX track_purchases_method_ref_idx ON public.track_purchases(method, tx_ref);
CREATE INDEX track_purchases_user_idx ON public.track_purchases(user_id);
CREATE INDEX track_purchases_track_idx ON public.track_purchases(track_id);

GRANT SELECT, INSERT ON public.track_purchases TO authenticated;
GRANT ALL ON public.track_purchases TO service_role;

ALTER TABLE public.track_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own purchases" ON public.track_purchases
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Artists read their track purchases" ON public.track_purchases
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = track_id AND t.user_id = auth.uid())
  );

-- Codes
CREATE TABLE public.track_claim_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.tracks(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claimed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX track_claim_codes_track_idx ON public.track_claim_codes(track_id);

GRANT SELECT ON public.track_claim_codes TO authenticated;
GRANT ALL ON public.track_claim_codes TO service_role;

ALTER TABLE public.track_claim_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Artist manages own track codes" ON public.track_claim_codes
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.tracks t WHERE t.id = track_id AND t.user_id = auth.uid())
  );

CREATE POLICY "Claimer reads own claimed code" ON public.track_claim_codes
  FOR SELECT TO authenticated USING (claimed_by = auth.uid());

-- Generate codes (artist-only, capped at 100 per track)
CREATE OR REPLACE FUNCTION public.generate_track_codes(_track_id uuid, _count integer)
RETURNS SETOF text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_existing integer;
  v_alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_i integer;
  v_tries integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _count IS NULL OR _count < 1 OR _count > 100 THEN
    RAISE EXCEPTION 'Count must be 1..100';
  END IF;

  SELECT user_id INTO v_owner FROM public.tracks WHERE id = _track_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Track not found'; END IF;
  IF v_owner <> auth.uid() THEN RAISE EXCEPTION 'Not your track'; END IF;

  SELECT count(*) INTO v_existing FROM public.track_claim_codes WHERE track_id = _track_id;
  IF v_existing + _count > 100 THEN
    RAISE EXCEPTION 'Cap of 100 codes per track (currently %)', v_existing;
  END IF;

  FOR v_i IN 1.._count LOOP
    v_tries := 0;
    LOOP
      v_code := '';
      FOR j IN 1..10 LOOP
        v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
      END LOOP;
      BEGIN
        INSERT INTO public.track_claim_codes(track_id, code, created_by)
        VALUES (_track_id, v_code, auth.uid());
        RETURN NEXT v_code;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        v_tries := v_tries + 1;
        IF v_tries > 8 THEN RAISE EXCEPTION 'Could not generate unique code'; END IF;
      END;
    END LOOP;
  END LOOP;
  RETURN;
END;
$$;

-- Claim a code
CREATE OR REPLACE FUNCTION public.claim_track_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.track_claim_codes%ROWTYPE;
  v_clean text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_clean := upper(regexp_replace(coalesce(_code,''), '[^A-Za-z0-9]', '', 'g'));
  IF length(v_clean) = 0 THEN RAISE EXCEPTION 'Empty code'; END IF;

  SELECT * INTO v_row FROM public.track_claim_codes WHERE code = v_clean FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invalid code'; END IF;
  IF v_row.claimed_by IS NOT NULL THEN RAISE EXCEPTION 'Code already used'; END IF;

  -- Don't double-insert if user already owns this track
  IF EXISTS (SELECT 1 FROM public.track_purchases WHERE user_id = v_user AND track_id = v_row.track_id) THEN
    UPDATE public.track_claim_codes SET claimed_by = v_user, claimed_at = now() WHERE id = v_row.id;
    RETURN v_row.track_id;
  END IF;

  UPDATE public.track_claim_codes SET claimed_by = v_user, claimed_at = now() WHERE id = v_row.id;
  INSERT INTO public.track_purchases(user_id, track_id, method, tx_ref, price_cents, amount)
  VALUES (v_user, v_row.track_id, 'code', v_row.id::text, 0, 0);

  RETURN v_row.track_id;
END;
$$;

-- Credit artist for a paid purchase (used from server fns via admin client)
CREATE OR REPLACE FUNCTION public.credit_track_sale(_track_id uuid, _amount_cents integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_artist uuid;
BEGIN
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN RETURN; END IF;
  SELECT user_id INTO v_artist FROM public.tracks WHERE id = _track_id;
  IF v_artist IS NULL THEN RETURN; END IF;
  UPDATE public.profiles
  SET credit_balance_cents = credit_balance_cents + _amount_cents
  WHERE id = v_artist;
END;
$$;
