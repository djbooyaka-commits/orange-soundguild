CREATE TABLE public.room_chat_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scope text NOT NULL CHECK (scope IN ('beta','curator')),
  room_key uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_chat_messages_room_idx ON public.room_chat_messages (scope, room_key, created_at DESC);
GRANT ALL ON public.room_chat_messages TO service_role;
ALTER TABLE public.room_chat_messages ENABLE ROW LEVEL SECURITY;