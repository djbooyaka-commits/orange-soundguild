INSERT INTO public.playlist_tracks (playlist_id, track_id, position)
SELECT '27998108-710d-4f59-be9b-a305331d373e'::uuid, t.id, (SELECT COALESCE(MAX(position), -1) FROM public.playlist_tracks WHERE playlist_id = '27998108-710d-4f59-be9b-a305331d373e') + v.ord
FROM (VALUES ('048ce17d-f85d-4f03-9d3d-0a6ea250237a'::uuid, 1), ('25578bfa-e10f-40d1-b2ca-c7b5696c1e51'::uuid, 2)) AS v(id, ord)
JOIN public.tracks t ON t.id = v.id
ON CONFLICT (playlist_id, track_id) DO NOTHING;