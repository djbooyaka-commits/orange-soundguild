
CREATE TYPE public.account_type AS ENUM ('fan', 'artist');

ALTER TABLE public.profiles
  ADD COLUMN account_type public.account_type NOT NULL DEFAULT 'fan';

-- Existing users default to artist to preserve current behavior
UPDATE public.profiles SET account_type = 'artist';

-- Change default going forward: new signups start as fan
ALTER TABLE public.profiles ALTER COLUMN account_type SET DEFAULT 'fan';

-- Helper to check artist status (security definer to avoid RLS recursion issues)
CREATE OR REPLACE FUNCTION public.is_artist(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT account_type = 'artist' FROM public.profiles WHERE id = _user_id), false)
$$;

-- Restrict track inserts to artists
DROP POLICY IF EXISTS "Users can insert their own tracks" ON public.tracks;
CREATE POLICY "Artists can insert their own tracks"
  ON public.tracks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_artist(auth.uid()));
