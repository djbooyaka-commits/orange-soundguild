
-- Method + status enums
CREATE TYPE public.payout_method AS ENUM ('paypal', 'phantom');
CREATE TYPE public.payout_status AS ENUM ('pending', 'processing', 'paid', 'rejected');

-- Table
CREATE TABLE public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  method public.payout_method NOT NULL,
  destination text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents >= 2500),
  status public.payout_status NOT NULL DEFAULT 'pending',
  admin_note text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payout_requests_user_id_idx ON public.payout_requests(user_id, created_at DESC);
CREATE INDEX payout_requests_status_idx ON public.payout_requests(status, created_at DESC);

GRANT SELECT, INSERT ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;

ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own payout requests"
  ON public.payout_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- No direct INSERT policy: users must go through request_payout() (SECURITY DEFINER)
CREATE POLICY "Admins update payout requests"
  ON public.payout_requests FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER payout_requests_set_updated_at
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Atomic cashout request: verifies balance, deducts, inserts
CREATE OR REPLACE FUNCTION public.request_payout(
  _method public.payout_method,
  _destination text,
  _amount_cents integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_balance integer;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _amount_cents < 2500 THEN
    RAISE EXCEPTION 'Minimum cashout is $25';
  END IF;
  IF _destination IS NULL OR length(btrim(_destination)) = 0 THEN
    RAISE EXCEPTION 'Destination is required';
  END IF;

  -- Lock the profile row while we check + deduct
  SELECT credit_balance_cents INTO v_balance
  FROM public.profiles WHERE id = v_user FOR UPDATE;

  IF v_balance IS NULL OR v_balance < _amount_cents THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.profiles
  SET credit_balance_cents = credit_balance_cents - _amount_cents
  WHERE id = v_user;

  INSERT INTO public.payout_requests (user_id, method, destination, amount_cents)
  VALUES (v_user, _method, btrim(_destination), _amount_cents)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.request_payout(public.payout_method, text, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.request_payout(public.payout_method, text, integer) TO authenticated;

-- Admin marks paid/rejected; rejecting refunds
CREATE OR REPLACE FUNCTION public.admin_update_payout_status(
  _request_id uuid,
  _new_status public.payout_status,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.payout_requests%ROWTYPE;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT * INTO v_row FROM public.payout_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF v_row.status IN ('paid', 'rejected') THEN
    RAISE EXCEPTION 'Request already finalized';
  END IF;

  IF _new_status = 'rejected' THEN
    UPDATE public.profiles
    SET credit_balance_cents = credit_balance_cents + v_row.amount_cents
    WHERE id = v_row.user_id;
  END IF;

  UPDATE public.payout_requests
  SET status = _new_status,
      admin_note = COALESCE(_note, admin_note),
      processed_at = CASE WHEN _new_status IN ('paid','rejected') THEN now() ELSE processed_at END
  WHERE id = _request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_payout_status(uuid, public.payout_status, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update_payout_status(uuid, public.payout_status, text) TO authenticated;
