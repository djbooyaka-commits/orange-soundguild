
CREATE OR REPLACE FUNCTION public.accept_curator_invite_by_link(_curator_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_type public.account_type;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _curator_id IS NULL THEN RAISE EXCEPTION 'Missing curator'; END IF;
  IF _curator_id = v_user THEN RAISE EXCEPTION 'You cannot join your own list'; END IF;

  SELECT account_type INTO v_type FROM public.profiles WHERE id = _curator_id;
  IF v_type IS DISTINCT FROM 'superfan' THEN
    RAISE EXCEPTION 'This user is not a Curator';
  END IF;

  INSERT INTO public.curator_invites(curator_id, user_id, status, responded_at)
  VALUES (_curator_id, v_user, 'accepted'::public.curator_invite_status, now())
  ON CONFLICT (curator_id, user_id) DO UPDATE
    SET status = 'accepted'::public.curator_invite_status,
        responded_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
