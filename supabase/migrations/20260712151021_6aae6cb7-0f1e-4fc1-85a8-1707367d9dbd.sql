
CREATE TYPE public.curator_invite_status AS ENUM ('pending','accepted','declined');

CREATE TABLE public.curator_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  curator_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status public.curator_invite_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  UNIQUE (curator_id, user_id),
  CHECK (curator_id <> user_id)
);

GRANT SELECT ON public.curator_invites TO authenticated;
GRANT ALL ON public.curator_invites TO service_role;

ALTER TABLE public.curator_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Curator sees own invites" ON public.curator_invites
  FOR SELECT TO authenticated
  USING (auth.uid() = curator_id OR auth.uid() = user_id);

-- No direct INSERT/UPDATE/DELETE policies; all mutations via SECURITY DEFINER RPCs.

CREATE INDEX curator_invites_user_idx ON public.curator_invites(user_id, status);
CREATE INDEX curator_invites_curator_idx ON public.curator_invites(curator_id, status);

CREATE OR REPLACE FUNCTION public.is_accepted_invitee(_curator uuid, _user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.curator_invites
    WHERE curator_id = _curator AND user_id = _user AND status = 'accepted'
  );
$$;

CREATE OR REPLACE FUNCTION public.invite_curator_user(_username text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_curator uuid := auth.uid();
  v_target uuid;
  v_type public.account_type;
  v_id uuid;
BEGIN
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT account_type INTO v_type FROM public.profiles WHERE id = v_curator;
  IF v_type IS DISTINCT FROM 'superfan' THEN
    RAISE EXCEPTION 'Only Superfans can invite users to the Curator program';
  END IF;

  SELECT id INTO v_target FROM public.profiles
  WHERE lower(username) = lower(btrim(_username)) LIMIT 1;
  IF v_target IS NULL THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_target = v_curator THEN RAISE EXCEPTION 'You cannot invite yourself'; END IF;

  INSERT INTO public.curator_invites(curator_id, user_id)
  VALUES (v_curator, v_target)
  ON CONFLICT (curator_id, user_id) DO UPDATE
    SET status = CASE WHEN curator_invites.status = 'declined' THEN 'pending'::public.curator_invite_status ELSE curator_invites.status END,
        responded_at = CASE WHEN curator_invites.status = 'declined' THEN NULL ELSE curator_invites.responded_at END
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.respond_curator_invite(_invite_id uuid, _accept boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row public.curator_invites%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.curator_invites WHERE id = _invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite not found'; END IF;
  IF v_row.user_id <> v_user THEN RAISE EXCEPTION 'Not your invite'; END IF;

  UPDATE public.curator_invites
  SET status = CASE WHEN _accept THEN 'accepted'::public.curator_invite_status ELSE 'declined'::public.curator_invite_status END,
      responded_at = now()
  WHERE id = _invite_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_curator_invite(_invite_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.curator_invites WHERE id = _invite_id AND curator_id = v_user;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_curator_invites_for_me()
RETURNS TABLE(id uuid, curator_id uuid, curator_username text, curator_avatar text, status public.curator_invite_status, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ci.id, ci.curator_id, p.username, p.avatar_url, ci.status, ci.created_at
  FROM public.curator_invites ci
  JOIN public.profiles p ON p.id = ci.curator_id
  WHERE ci.user_id = auth.uid()
  ORDER BY ci.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.list_my_curator_invitees()
RETURNS TABLE(id uuid, user_id uuid, username text, avatar_url text, status public.curator_invite_status, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ci.id, ci.user_id, p.username, p.avatar_url, ci.status, ci.created_at
  FROM public.curator_invites ci
  JOIN public.profiles p ON p.id = ci.user_id
  WHERE ci.curator_id = auth.uid()
  ORDER BY ci.created_at DESC;
$$;
