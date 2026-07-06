DROP POLICY IF EXISTS "Recipient can respond, either can update timestamps" ON public.friendships;

CREATE POLICY "Addressee can respond to friend request"
  ON public.friendships FOR UPDATE TO authenticated
  USING (auth.uid() = addressee_id)
  WITH CHECK (auth.uid() = addressee_id AND status IN ('accepted', 'declined'));