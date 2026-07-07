DROP POLICY IF EXISTS "Friends can send messages" ON public.direct_messages;
CREATE POLICY "Friends can send messages" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND public.are_friends(sender_id, recipient_id)
    AND NOT public.is_banned(auth.uid())
    AND NOT public.is_banned(recipient_id)
  );