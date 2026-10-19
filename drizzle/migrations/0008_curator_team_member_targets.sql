CREATE TABLE public.curator_team_member_targets (
  playlist_id uuid NOT NULL REFERENCES public.curator_playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  target_min integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, user_id)
);
GRANT ALL ON public.curator_team_member_targets TO service_role;
ALTER TABLE public.curator_team_member_targets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.curator_team_roster(_playlist_id uuid)
 RETURNS TABLE(member_id uuid, user_id uuid, username text, avatar_url text, account_type account_type, points bigint, weekly_min integer, is_me boolean, last_deduction_at timestamp with time zone, spotify_artist_url text, spotify_artist_name text, track_urls text[], facebook_url text, facebook_name text)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
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
    COALESCE(t.target_min, cp.team_weekly_min),
    (m.user_id = auth.uid()),
    (SELECT max(a.created_at) FROM public.curator_team_point_adjustments a
      WHERE a.playlist_id = _playlist_id AND a.user_id = m.user_id AND a.delta < 0),
    l.spotify_artist_url, l.spotify_artist_name, l.track_urls,
    COALESCE(pr.facebook_url, l.facebook_url), COALESCE(pr.facebook_name, l.facebook_name)
  FROM public.curator_team_members m
  JOIN public.curator_playlists cp ON cp.id = m.playlist_id
  LEFT JOIN public.profiles pr ON pr.id = m.user_id
  LEFT JOIN public.curator_team_member_links l ON l.playlist_id = m.playlist_id AND l.user_id = m.user_id
  LEFT JOIN public.curator_team_member_targets t ON t.playlist_id = m.playlist_id AND t.user_id = m.user_id
  WHERE m.playlist_id = _playlist_id
    AND auth.uid() IS NOT NULL
    AND (cp.curator_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.curator_team_members m2 WHERE m2.playlist_id = _playlist_id AND m2.user_id = auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.curator_team_set_weekly_min(_playlist_id uuid, _min integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old integer; v_days integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _min < 0 OR _min > 1000000 THEN RAISE EXCEPTION 'Invalid minimum'; END IF;
  SELECT team_weekly_min, COALESCE(min_period_days, 7) INTO v_old, v_days
    FROM public.curator_playlists WHERE id = _playlist_id AND curator_id = auth.uid();
  IF NOT FOUND THEN RETURN; END IF;
  IF v_old IS DISTINCT FROM _min THEN
    -- Members still working toward their pass keep the minimum they started with.
    INSERT INTO public.curator_team_member_targets(playlist_id, user_id, target_min)
    SELECT m.playlist_id, m.user_id, v_old
      FROM public.curator_team_members m
     WHERE m.playlist_id = _playlist_id
       AND NOT EXISTS (SELECT 1 FROM public.curator_team_point_adjustments a
                        WHERE a.playlist_id = _playlist_id AND a.user_id = m.user_id
                          AND a.delta < 0 AND a.created_at >= now() - make_interval(days => v_days))
    ON CONFLICT (playlist_id, user_id) DO NOTHING;
  END IF;
  UPDATE public.curator_playlists SET team_weekly_min = _min WHERE id = _playlist_id AND curator_id = auth.uid();
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_curator_team_target_on_pass()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.delta <= 0 THEN
    DELETE FROM public.curator_team_member_targets WHERE playlist_id = NEW.playlist_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER curator_team_clear_target_on_pass
AFTER INSERT ON public.curator_team_point_adjustments
FOR EACH ROW EXECUTE FUNCTION public.clear_curator_team_target_on_pass();