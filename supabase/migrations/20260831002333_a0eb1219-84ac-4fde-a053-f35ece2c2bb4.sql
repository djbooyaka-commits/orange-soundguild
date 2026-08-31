
CREATE OR REPLACE FUNCTION public.beta_playlist_earned_points(p_playlist_id uuid)
 RETURNS TABLE(user_id uuid, points bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH pl AS (
    SELECT id, room_id FROM public.beta_room_playlists WHERE id = p_playlist_id
  ),
  first_pl AS (
    SELECT DISTINCT ON (t.spotify_track_id) t.spotify_track_id, t.playlist_id
    FROM public.beta_room_tracks t, pl
    WHERE t.room_id = pl.room_id AND t.playlist_id IS NOT NULL
    ORDER BY t.spotify_track_id, t.created_at ASC
  )
  SELECT sp.user_id, count(*)::bigint
  FROM public.beta_stream_points sp
  CROSS JOIN pl
  LEFT JOIN first_pl f ON f.spotify_track_id = sp.spotify_track_id
  WHERE sp.room_id = pl.room_id
    AND COALESCE(sp.playlist_id, f.playlist_id) = pl.id
    AND sp.played_at >= now() - interval '30 days'
  GROUP BY sp.user_id
$function$;

CREATE OR REPLACE FUNCTION public.beta_room_leaderboard(_room uuid)
 RETURNS TABLE(user_id uuid, username text, points bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.user_id, pr.username, count(*)::bigint AS points
  FROM public.beta_stream_points p
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.room_id = _room
    AND p.played_at >= now() - interval '30 days'
    AND (public.is_beta_room_member(_room, auth.uid()))
  GROUP BY p.user_id, pr.username
  ORDER BY points DESC
$function$;

CREATE OR REPLACE FUNCTION public.curator_team_roster(_playlist_id uuid)
 RETURNS TABLE(member_id uuid, user_id uuid, username text, avatar_url text, account_type account_type, points bigint, weekly_min integer, is_me boolean, last_deduction_at timestamp with time zone, spotify_artist_url text, spotify_artist_name text, track_urls text[])
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
    l.spotify_artist_url, l.spotify_artist_name, l.track_urls
  FROM public.curator_team_members m
  JOIN public.curator_playlists cp ON cp.id = m.playlist_id
  LEFT JOIN public.profiles pr ON pr.id = m.user_id
  LEFT JOIN public.curator_team_member_links l ON l.playlist_id = m.playlist_id AND l.user_id = m.user_id
  WHERE m.playlist_id = _playlist_id
    AND auth.uid() IS NOT NULL
    AND (cp.curator_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.curator_team_members m2 WHERE m2.playlist_id = _playlist_id AND m2.user_id = auth.uid()));
$function$;

CREATE OR REPLACE FUNCTION public.get_curator_earned_points()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(count(*), 0)::integer
  FROM public.stream_points sp
  JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
  WHERE cp.curator_id = auth.uid()
    AND sp.played_at >= now() - interval '30 days';
$function$;

CREATE OR REPLACE FUNCTION public.get_playlist_earned_points(_playlist_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(count(*), 0)::integer
  FROM public.stream_points sp
  JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
  WHERE cp.id = _playlist_id
    AND sp.played_at >= now() - interval '30 days'
    AND (cp.curator_id = auth.uid() OR sp.user_id = auth.uid());
$function$;

CREATE OR REPLACE FUNCTION public.get_playlist_available_points(_playlist_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT GREATEST(
    COALESCE((
      SELECT count(*)
      FROM public.stream_points sp
      WHERE sp.user_id = auth.uid()
        AND sp.curator_playlist_id = _playlist_id
        AND sp.played_at >= now() - interval '30 days'
    ), 0)
    - COALESCE((
      SELECT SUM(cs.cost_points)
      FROM public.curator_submissions cs
      WHERE cs.submitter_user_id = auth.uid()
        AND cs.curator_playlist_id = _playlist_id
        AND cs.status <> 'rejected'
        AND cs.created_at >= now() - interval '30 days'
    ), 0),
    0
  )::integer;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_stream_points()
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      COALESCE((
        SELECT count(*)::bigint
        FROM public.stream_points sp
        WHERE sp.user_id = auth.uid()
          AND sp.played_at >= now() - interval '30 days'
      ), 0) AS earned,
      COALESCE((
        SELECT sum(cs.cost_points)::bigint
        FROM public.curator_submissions cs
        WHERE cs.submitter_user_id = auth.uid()
          AND cs.status <> 'rejected'
          AND cs.created_at >= now() - interval '30 days'
      ), 0) AS spent
  ), capped_osg_deductions AS (
    SELECT COALESCE(sum(GREATEST(a.adjustment, -a.osg_earned)), 0)::bigint AS total
    FROM (
      SELECT
        cp.curator_id,
        count(sp.id)::bigint AS osg_earned,
        COALESCE((
          SELECT sum(adj.delta)::bigint
          FROM public.osg_point_adjustments adj
          WHERE adj.curator_id = cp.curator_id
            AND adj.user_id = auth.uid()
            AND adj.delta < 0
            AND adj.created_at >= now() - interval '30 days'
        ), 0) AS adjustment
      FROM public.stream_points sp
      JOIN public.curator_playlists cp ON cp.id = sp.curator_playlist_id
      WHERE sp.user_id = auth.uid()
        AND sp.played_at >= now() - interval '30 days'
        AND cp.is_osg = true
      GROUP BY cp.curator_id
    ) a
  )
  SELECT GREATEST(base.earned - base.spent + capped_osg_deductions.total, 0)::integer
  FROM base
  CROSS JOIN capped_osg_deductions;
$function$;
