CREATE TABLE public.curator_room_notices (
  scope text NOT NULL CHECK (scope IN ('team', 'osg')),
  room_key uuid NOT NULL,
  curator_id uuid NOT NULL,
  notice text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, room_key)
);

GRANT ALL ON public.curator_room_notices TO service_role;

ALTER TABLE public.curator_room_notices ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.curator_room_notices IS 'Curator message shown in Spotify team rooms (room_key = curator_playlists.id) and OSG Artists rooms (room_key = curator user id). Read/written only through server functions that check room membership/ownership.';