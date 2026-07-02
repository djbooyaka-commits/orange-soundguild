
DROP POLICY IF EXISTS "Users can read own audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own covers" ON storage.objects;

CREATE POLICY "Authenticated can read audio"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'audio');

CREATE POLICY "Authenticated can read covers"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'covers');
