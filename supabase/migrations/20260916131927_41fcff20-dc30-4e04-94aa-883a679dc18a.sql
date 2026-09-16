ALTER TABLE public.beta_playlist_member_links
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS facebook_name text;

ALTER TABLE public.curator_team_member_links
  ADD COLUMN IF NOT EXISTS facebook_url text,
  ADD COLUMN IF NOT EXISTS facebook_name text;

DROP FUNCTION IF EXISTS public.curator_team_roster(uuid);
CREATE OR REPLACE FUNCTION public.curator_team_roster(_playlist_id uuid)
 RETURNS TABLE(member_id uuid, user_id uuid, username text, avatar_url text, account_type account_type, points bigint, weekly_min integer, is_me boolean, last_deduction_at timestamp with time zone, spotify_artist_url text, spotify_artist_name text, track_urls text[], facebook_url text, facebook_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    l.facebook_url, l.facebook_name
  FROM public.curator_team_members m
  JOIN public.curator_playlists cp ON cp.id = m.playlist_id
  LEFT JOIN public.profiles pr ON pr.id = m.user_id
  LEFT JOIN public.curator_team_member_links l ON l.playlist_id = m.playlist_id AND l.user_id = m.user_id
  WHERE m.playlist_id = _playlist_id
    AND auth.uid() IS NOT NULL
    AND (cp.curator_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.curator_team_members m2 WHERE m2.playlist_id = _playlist_id AND m2.user_id = auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.curator_team_set_facebook(_playlist_id uuid, _user_id uuid, _fb_url text, _fb_name text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_curator uuid := auth.uid();
  v_url text := NULLIF(btrim(coalesce(_fb_url,'')), '');
  v_name text := NULLIF(btrim(coalesce(_fb_name,'')), '');
BEGIN
  IF v_curator IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.curator_team_members m
                  WHERE m.playlist_id = _playlist_id AND m.user_id = _user_id AND m.curator_id = v_curator) THEN
    RAISE EXCEPTION 'That user is not in this Team room';
  END IF;
  IF v_url IS NOT NULL AND v_url !~ '^https?://([a-z0-9-]+\.)*facebook\.com/' AND v_url !~ '^https?://fb\.(me|watch)/' THEN
    RAISE EXCEPTION 'Enter a valid Facebook link';
  END IF;
  IF v_url IS NOT NULL AND length(v_url) > 500 THEN RAISE EXCEPTION 'Facebook link is too long'; END IF;

  INSERT INTO public.curator_team_member_links(playlist_id, curator_id, user_id, facebook_url, facebook_name)
  VALUES (_playlist_id, v_curator, _user_id, v_url, left(v_name, 200))
  ON CONFLICT (playlist_id, user_id) DO UPDATE
    SET facebook_url = EXCLUDED.facebook_url,
        facebook_name = EXCLUDED.facebook_name,
        updated_at = now();
END; $function$;

REVOKE ALL ON FUNCTION public.curator_team_set_facebook(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.curator_team_set_facebook(uuid, uuid, text, text) TO authenticated;