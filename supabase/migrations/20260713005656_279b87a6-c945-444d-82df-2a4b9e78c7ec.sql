CREATE OR REPLACE FUNCTION public.get_my_stream_points()
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT GREATEST(
    COALESCE((SELECT count(*) FROM public.stream_points WHERE user_id = auth.uid()), 0)
    - COALESCE((SELECT SUM(cost_points) FROM public.curator_submissions WHERE submitter_user_id = auth.uid()), 0),
    0
  )::integer;
$$;