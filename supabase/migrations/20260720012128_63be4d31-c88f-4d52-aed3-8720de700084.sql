DROP POLICY IF EXISTS "Sender can edit own message" ON public.direct_messages;
CREATE POLICY "Sender can edit own message" ON public.direct_messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = sender_id)
  WITH CHECK (auth.uid() = sender_id);