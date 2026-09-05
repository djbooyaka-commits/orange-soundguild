
CREATE OR REPLACE FUNCTION public.is_room_chat_member(_scope text, _room_key uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN _scope = 'curator' THEN (
      _room_key = _user_id
      OR EXISTS (
        SELECT 1 FROM public.curator_invites ci
        WHERE ci.curator_id = _room_key AND ci.user_id = _user_id AND ci.status = 'accepted'
      )
    )
    ELSE (
      EXISTS (SELECT 1 FROM public.beta_rooms r WHERE r.id = _room_key AND r.owner_id = _user_id)
      OR EXISTS (
        SELECT 1 FROM public.beta_room_members m
        WHERE m.room_id = _room_key AND m.user_id = _user_id
      )
    )
  END
$$;

ALTER TABLE public.room_chat_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

GRANT SELECT ON public.room_chat_messages TO authenticated;
GRANT ALL ON public.room_chat_messages TO service_role;

DROP POLICY IF EXISTS "room chat members can read" ON public.room_chat_messages;
CREATE POLICY "room chat members can read"
ON public.room_chat_messages FOR SELECT TO authenticated
USING (public.is_room_chat_member(scope, room_key, auth.uid()));

ALTER TABLE public.room_chat_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_chat_messages;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
