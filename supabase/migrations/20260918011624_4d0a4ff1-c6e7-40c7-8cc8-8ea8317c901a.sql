ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS facebook_name text;

UPDATE public.profiles p
SET facebook_url = COALESCE(p.facebook_url, l.facebook_url),
    facebook_name = COALESCE(p.facebook_name, l.facebook_name)
FROM (
  SELECT user_id, max(facebook_url) AS facebook_url, max(facebook_name) AS facebook_name
  FROM public.curator_team_member_links WHERE facebook_url IS NOT NULL GROUP BY user_id
) l
WHERE l.user_id = p.id AND p.facebook_url IS NULL;

UPDATE public.profiles p
SET facebook_url = COALESCE(p.facebook_url, l.facebook_url),
    facebook_name = COALESCE(p.facebook_name, l.facebook_name)
FROM (
  SELECT user_id, max(facebook_url) AS facebook_url, max(facebook_name) AS facebook_name
  FROM public.beta_playlist_member_links WHERE facebook_url IS NOT NULL GROUP BY user_id
) l
WHERE l.user_id = p.id AND p.facebook_url IS NULL;

CREATE OR REPLACE FUNCTION public.set_member_facebook(_user_id uuid, _fb_url text, _fb_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF _user_id = auth.uid() OR public.has_role(auth.uid(), 'admin') THEN
    allowed := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.curator_team_members m
    JOIN public.curator_playlists cp ON cp.id = m.playlist_id
    WHERE m.user_id = _user_id AND cp.curator_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.beta_room_members bm
    JOIN public.beta_rooms br ON br.id = bm.room_id
    WHERE bm.user_id = _user_id AND br.owner_id = auth.uid()
  ) THEN
    allowed := true;
  END IF;

  IF NOT allowed THEN RAISE EXCEPTION 'Not allowed to set this Facebook link'; END IF;

  IF _fb_url IS NOT NULL AND length(trim(_fb_url)) > 0
     AND _fb_url !~* '^https?://([a-z0-9-]+\.)*(facebook\.com|fb\.me|fb\.watch)/' THEN
    RAISE EXCEPTION 'Enter a valid Facebook link';
  END IF;

  UPDATE public.profiles
  SET facebook_url = NULLIF(trim(COALESCE(_fb_url, '')), ''),
      facebook_name = left(NULLIF(trim(COALESCE(_fb_name, '')), ''), 200),
      updated_at = now()
  WHERE id = _user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_member_facebook(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_member_facebook(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.curator_team_roster(uuid);
CREATE OR REPLACE FUNCTION public.curator_team_roster(_playlist_id uuid)
RETURNS TABLE(member_id uuid, user_id uuid, username text, avatar_url text, account_type account_type, points bigint, weekly_min integer, is_me boolean, last_deduction_at timestamp with time zone, spotify_artist_url text, spotify_artist_name text, track_urls text[], facebook_url text, facebook_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.user_id, pr.username, pr.avatar_url, pr.account_type,
    GREATEST(0,
      COALESCE((SELECT count(*)::bigint FROM public.stream_points sp
                 WHERE sp.curator_playlist_id = _playlist_id AND sp.user_id = m.user_id
                   AND sp.played_at >= now() - interval '30 days'), 0)
      + COALESCE((SELECT sum(a.delta)::bigint FROM public.curator_team_point_adjustments a
                   WHERE a.playlist_id = _playlist_id AND a.user_id = m.user_id
                     AND a.created_at >= now() - interval '30 days'), 0)
    ) AS points,
    cp.team_weekly_min,
    (m.user_id = auth.uid()),
    (SELECT max(a.created_at) FROM public.curator_team_point_adjustments a
      WHERE a.playlist_id = _playlist_id AND a.user_id = m.user_id AND a.delta < 0),
    l.spotify_artist_url, l.spotify_artist_name, l.track_urls,
    COALESCE(pr.facebook_url, l.facebook_url), COALESCE(pr.facebook_name, l.facebook_name)
  FROM public.curator_team_members m
  JOIN public.curator_playlists cp ON cp.id = m.playlist_id
  LEFT JOIN public.profiles pr ON pr.id = m.user_id
  LEFT JOIN public.curator_team_member_links l ON l.playlist_id = m.playlist_id AND l.user_id = m.user_id
  WHERE m.playlist_id = _playlist_id
    AND auth.uid() IS NOT NULL
    AND (cp.curator_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.curator_team_members m2 WHERE m2.playlist_id = _playlist_id AND m2.user_id = auth.uid()));
$$;

REVOKE ALL ON FUNCTION public.curator_team_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.curator_team_roster(uuid) TO authenticated;