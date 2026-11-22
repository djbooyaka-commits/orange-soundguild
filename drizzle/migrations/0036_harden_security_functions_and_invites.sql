-- Server-only helper functions: browsers can no longer call them directly.
REVOKE EXECUTE ON FUNCTION public.credit_track_sale(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_track_sale(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.assert_track_hold_window(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_track_hold_window(uuid, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.beta_playlist_earned_points(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.beta_playlist_earned_points(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.run_monthly_royalty_payout(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_monthly_royalty_payout(date) TO service_role;

-- Team roster already answers only to the curator and team members; visitors can't call it.
REVOKE EXECUTE ON FUNCTION public.curator_team_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.curator_team_roster(uuid) TO authenticated, service_role;

-- OSG artist picks: members can read and remove their own picks, but adding
-- one must go through add_osg_artist_pick, which checks the curator invite.
DROP POLICY IF EXISTS "Users manage their own picks" ON public.osg_artist_picks;
REVOKE INSERT, UPDATE ON public.osg_artist_picks FROM anon, authenticated;
CREATE POLICY "Users read their own picks" ON public.osg_artist_picks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users remove their own picks" ON public.osg_artist_picks
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Curator invite links now carry a secret per-curator token.
CREATE TABLE public.curator_invite_links (
  curator_id uuid PRIMARY KEY,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.curator_invite_links TO service_role;
ALTER TABLE public.curator_invite_links ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_my_curator_invite_token()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_token text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF (SELECT account_type FROM public.profiles WHERE id = v_user) IS DISTINCT FROM 'superfan' THEN
    RAISE EXCEPTION 'Only Curators have an invite link';
  END IF;
  INSERT INTO public.curator_invite_links(curator_id) VALUES (v_user)
  ON CONFLICT (curator_id) DO NOTHING;
  SELECT token INTO v_token FROM public.curator_invite_links WHERE curator_id = v_user;
  RETURN v_token;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_my_curator_invite_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_curator_invite_token() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.accept_curator_invite_by_link(_curator_id uuid, _token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _curator_id IS NULL OR coalesce(_token, '') = '' THEN RAISE EXCEPTION 'This invite link is not valid'; END IF;
  IF _curator_id = v_user THEN RAISE EXCEPTION 'You cannot join your own list'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.curator_invite_links l
    JOIN public.profiles p ON p.id = l.curator_id
    WHERE l.curator_id = _curator_id AND l.token = _token AND p.account_type = 'superfan'
  ) THEN
    RAISE EXCEPTION 'This invite link is not valid. Ask the Curator for their latest link.';
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
REVOKE EXECUTE ON FUNCTION public.accept_curator_invite_by_link(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_curator_invite_by_link(uuid, text) TO authenticated, service_role;

-- Old link-acceptance without a token is retired.
REVOKE EXECUTE ON FUNCTION public.accept_curator_invite_by_link(uuid) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.accept_curator_invite_by_link(uuid) IS 'DEPRECATED: replaced by accept_curator_invite_by_link(uuid, text)';