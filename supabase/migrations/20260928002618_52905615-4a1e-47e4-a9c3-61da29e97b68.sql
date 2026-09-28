CREATE TABLE public.beta_playlist_member_removals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  playlist_id uuid NOT NULL REFERENCES public.beta_room_playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  removed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, user_id)
);
GRANT SELECT ON public.beta_playlist_member_removals TO authenticated;
GRANT ALL ON public.beta_playlist_member_removals TO service_role;
ALTER TABLE public.beta_playlist_member_removals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Room members can view removals" ON public.beta_playlist_member_removals
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.beta_room_playlists p
    JOIN public.beta_room_members m ON m.room_id = p.room_id AND m.user_id = auth.uid()
    WHERE p.id = playlist_id
  ));