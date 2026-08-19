CREATE TABLE public.beta_playlist_member_links (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.beta_room_playlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  spotify_artist_url text,
  spotify_artist_name text,
  track_url text,
  track_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (playlist_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.beta_playlist_member_links TO authenticated;
GRANT ALL ON public.beta_playlist_member_links TO service_role;

ALTER TABLE public.beta_playlist_member_links ENABLE ROW LEVEL SECURITY;

-- Any room member can read the links for playlists in rooms they belong to
CREATE POLICY "Members can read beta playlist member links"
  ON public.beta_playlist_member_links
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.beta_room_playlists brp
      JOIN public.beta_room_members brm ON brm.room_id = brp.room_id
      WHERE brp.id = beta_playlist_member_links.playlist_id
        AND brm.user_id = auth.uid()
    )
  );

-- Room owners can read, create, and update links for playlists in rooms they own
CREATE POLICY "Room owner can manage beta playlist member links"
  ON public.beta_playlist_member_links
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.beta_room_playlists brp
      JOIN public.beta_rooms br ON br.id = brp.room_id
      WHERE brp.id = beta_playlist_member_links.playlist_id
        AND br.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.beta_room_playlists brp
      JOIN public.beta_rooms br ON br.id = brp.room_id
      WHERE brp.id = beta_playlist_member_links.playlist_id
        AND br.owner_id = auth.uid()
    )
  );

CREATE TRIGGER update_beta_playlist_member_links_updated_at
  BEFORE UPDATE ON public.beta_playlist_member_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();