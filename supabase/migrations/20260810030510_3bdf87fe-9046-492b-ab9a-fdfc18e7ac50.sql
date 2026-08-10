ALTER TABLE public.beta_room_playlists
  ADD COLUMN IF NOT EXISTS weekly_min integer NOT NULL DEFAULT 600;

CREATE TABLE IF NOT EXISTS public.beta_point_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.beta_rooms(id) ON DELETE CASCADE,
  playlist_id uuid NOT NULL REFERENCES public.beta_room_playlists(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  curator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta integer NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS beta_point_adjustments_playlist_user_idx
  ON public.beta_point_adjustments (playlist_id, user_id);

GRANT SELECT ON public.beta_point_adjustments TO authenticated;
GRANT ALL ON public.beta_point_adjustments TO service_role;

ALTER TABLE public.beta_point_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner or affected user can view adjustments"
  ON public.beta_point_adjustments
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_beta_room_owner(room_id, auth.uid()));