
-- 1) Add image_url to direct_messages, and relax body NOT NULL if needed
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.direct_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.direct_messages
  ADD CONSTRAINT direct_messages_body_or_image_chk
  CHECK ((body IS NOT NULL AND length(btrim(body)) > 0) OR image_url IS NOT NULL);

-- 2) Storage policies for chat-images bucket
-- Users may upload files only under their own uid folder: <auth.uid()>/<uuid>.<ext>
CREATE POLICY "Users can upload their own chat images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read files they uploaded
CREATE POLICY "Users can read their own chat images"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Users can read chat images that are referenced in a direct message they sent or received
CREATE POLICY "Users can read chat images sent to them"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND EXISTS (
    SELECT 1 FROM public.direct_messages dm
    WHERE dm.image_url = storage.objects.name
      AND (dm.sender_id = auth.uid() OR dm.recipient_id = auth.uid())
  )
);

-- Users can delete their own uploads
CREATE POLICY "Users can delete their own chat images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
