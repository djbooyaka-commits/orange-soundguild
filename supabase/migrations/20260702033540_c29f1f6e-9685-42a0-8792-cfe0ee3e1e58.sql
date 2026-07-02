
-- Fix 1: Storage buckets — remove public SELECT policies for audio and covers.
-- Owner-scoped SELECT policies remain (or are added) so signed URLs work.
DROP POLICY IF EXISTS "Public can read audio" ON storage.objects;
DROP POLICY IF EXISTS "Public can read covers" ON storage.objects;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can read own audio') THEN
    CREATE POLICY "Users can read own audio" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'audio' AND (auth.uid())::text = (storage.foldername(name))[1]);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Users can read own covers') THEN
    CREATE POLICY "Users can read own covers" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'covers' AND (auth.uid())::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- Fix 2: Ensure is_banned column on profiles is not readable by anon/authenticated.
REVOKE SELECT (is_banned) ON public.profiles FROM anon, authenticated, PUBLIC;

-- Re-grant SELECT on the safe columns so PostgREST still returns them.
GRANT SELECT (id, username, avatar_url, bio, created_at, updated_at) ON public.profiles TO anon, authenticated;
