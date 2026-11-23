CREATE TABLE public.track_durations (
  track_id uuid PRIMARY KEY REFERENCES public.tracks(id) ON DELETE CASCADE,
  audio_url text NOT NULL,
  seconds numeric NOT NULL CHECK (seconds > 0),
  measured_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.track_durations FROM anon, authenticated;
GRANT ALL ON public.track_durations TO service_role;
ALTER TABLE public.track_durations ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.track_durations IS 'Server-measured song lengths used to require a full play before OSG room points. Server only.';

ALTER TABLE public.beta_stream_points ADD COLUMN IF NOT EXISTS play_ends_at timestamptz;