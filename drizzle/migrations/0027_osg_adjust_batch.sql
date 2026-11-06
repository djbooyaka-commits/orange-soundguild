ALTER TABLE public.osg_point_adjustments ADD COLUMN IF NOT EXISTS batch_id uuid;
CREATE INDEX IF NOT EXISTS osg_point_adjustments_batch_idx ON public.osg_point_adjustments (curator_id, batch_id) WHERE batch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS beta_point_adjustments_batch_idx ON public.beta_point_adjustments (playlist_id, batch_id) WHERE batch_id IS NOT NULL;