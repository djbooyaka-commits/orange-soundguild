CREATE TABLE public.osg_member_targets (
  curator_id uuid NOT NULL,
  user_id uuid NOT NULL,
  target_min integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (curator_id, user_id)
);
GRANT ALL ON public.osg_member_targets TO service_role;
ALTER TABLE public.osg_member_targets ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.list_my_osg_artist_picks()
 RETURNS TABLE(id uuid, artist_id uuid, username text, avatar_url text, account_type account_type, weekly_points bigint, weekly_min integer, created_at timestamp with time zone, last_deduction_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p.id, p.artist_id, pr.username, pr.avatar_url, pr.account_type,
    GREATEST(0,
      COALESCE((SELECT count(*)::bigint FROM public.stream_points sp
        JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
        WHERE cp.curator_id = auth.uid() AND cp.is_osg = true AND sp.user_id = p.artist_id), 0)
      + COALESCE((SELECT sum(adj.delta)::bigint FROM public.osg_point_adjustments adj
        WHERE adj.curator_id = auth.uid() AND adj.user_id = p.artist_id), 0)
    ) AS weekly_points,
    COALESCE(t.target_min, cpr.osg_weekly_min, 600) AS weekly_min,
    p.created_at,
    (SELECT max(adj.created_at) FROM public.osg_point_adjustments adj
      WHERE adj.curator_id = auth.uid() AND adj.user_id = p.artist_id AND adj.delta < 0) AS last_deduction_at
  FROM public.osg_artist_picks p
  JOIN public.profiles pr ON pr.id = p.artist_id
  LEFT JOIN public.profiles cpr ON cpr.id = auth.uid()
  LEFT JOIN public.osg_member_targets t ON t.curator_id = p.user_id AND t.user_id = p.artist_id
  WHERE p.user_id = auth.uid()
  ORDER BY pr.username;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_osg_rosters()
 RETURNS TABLE(curator_id uuid, curator_username text, curator_avatar_url text, artist_id uuid, username text, avatar_url text, account_type account_type, weekly_points bigint, weekly_min integer, is_me boolean, last_deduction_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH my_curators AS (
    SELECT DISTINCT p.user_id AS curator_id FROM public.osg_artist_picks p WHERE p.artist_id = auth.uid()
  )
  SELECT mc.curator_id, cp.username, cp.avatar_url, p.artist_id, pr.username, pr.avatar_url, pr.account_type,
    GREATEST(0,
      COALESCE((SELECT count(*)::bigint FROM public.stream_points sp
        JOIN public.curator_playlists cpl ON cpl.id = sp.curator_playlist_id
        WHERE cpl.curator_id = mc.curator_id AND cpl.is_osg = true AND sp.user_id = p.artist_id), 0)
      + COALESCE((SELECT sum(adj.delta)::bigint FROM public.osg_point_adjustments adj
        WHERE adj.curator_id = mc.curator_id AND adj.user_id = p.artist_id), 0)
    ) AS weekly_points,
    COALESCE(t.target_min, cp.osg_weekly_min, 600) AS weekly_min,
    (p.artist_id = auth.uid()) AS is_me,
    (SELECT max(adj.created_at) FROM public.osg_point_adjustments adj
      WHERE adj.curator_id = mc.curator_id AND adj.user_id = p.artist_id AND adj.delta < 0) AS last_deduction_at
  FROM my_curators mc
  JOIN public.osg_artist_picks p ON p.user_id = mc.curator_id
  JOIN public.profiles pr ON pr.id = p.artist_id
  JOIN public.profiles cp ON cp.id = mc.curator_id
  LEFT JOIN public.osg_member_targets t ON t.curator_id = mc.curator_id AND t.user_id = p.artist_id
  ORDER BY cp.username, pr.username;
$function$;

CREATE OR REPLACE FUNCTION public.osg_set_weekly_min(_min integer)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_old integer;
BEGIN
  IF _min IS NULL OR _min < 0 OR _min > 100000 THEN
    RAISE EXCEPTION 'Minimum must be between 0 and 100000';
  END IF;
  SELECT osg_weekly_min INTO v_old FROM public.profiles WHERE id = auth.uid();
  IF v_old IS DISTINCT FROM _min THEN
    INSERT INTO public.osg_member_targets(curator_id, user_id, target_min)
    SELECT p.user_id, p.artist_id, COALESCE(v_old, 600)
      FROM public.osg_artist_picks p
     WHERE p.user_id = auth.uid()
       AND NOT EXISTS (SELECT 1 FROM public.osg_point_adjustments a
                        WHERE a.curator_id = auth.uid() AND a.user_id = p.artist_id
                          AND a.delta < 0 AND a.created_at >= now() - interval '7 days')
    ON CONFLICT (curator_id, user_id) DO NOTHING;
  END IF;
  UPDATE public.profiles SET osg_weekly_min = _min WHERE id = auth.uid();
  RETURN _min;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_osg_target_on_pass()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.delta < 0 THEN
    DELETE FROM public.osg_member_targets WHERE curator_id = NEW.curator_id AND user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE TRIGGER osg_clear_target_on_pass
AFTER INSERT ON public.osg_point_adjustments
FOR EACH ROW EXECUTE FUNCTION public.clear_osg_target_on_pass();