-- Allow public read on audio and covers buckets so any visitor can stream
-- publicly listed tracks (the `tracks` table is intentionally public).
-- Owners retain their existing insert/update/delete policies.

DROP POLICY IF EXISTS "Users can read own audio" ON storage.objects;
DROP POLICY IF EXISTS "Users can read own covers" ON storage.objects;

CREATE POLICY "Public can read audio"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio');

CREATE POLICY "Public can read covers"
ON storage.objects FOR SELECT
USING (bucket_id = 'covers');
