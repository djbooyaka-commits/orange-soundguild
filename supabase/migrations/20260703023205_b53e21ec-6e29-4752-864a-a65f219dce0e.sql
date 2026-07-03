
-- Drop overly broad SELECT policies allowing any authenticated user to read every file.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND cmd='SELECT'
      AND (qual LIKE '%bucket_id = ''audio''%' OR qual LIKE '%bucket_id = ''covers''%')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END$$;

-- Restrict SELECT on audio and covers buckets to the file's owner folder only.
-- All cross-user playback now goes through a service-role signed URL generator.
CREATE POLICY "Owners can read their audio files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'audio' AND (auth.uid())::text = (storage.foldername(name))[1]);

CREATE POLICY "Owners can read their cover files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'covers' AND (auth.uid())::text = (storage.foldername(name))[1]);
