ALTER TABLE public.room_chat_messages DROP CONSTRAINT room_chat_messages_body_check;

ALTER TABLE public.room_chat_messages
  ADD CONSTRAINT room_chat_messages_body_check
  CHECK (
    char_length(body) <= 1000
    AND (char_length(btrim(body)) >= 1 OR image_url IS NOT NULL)
  );

ALTER TABLE public.room_chat_messages ALTER COLUMN body SET DEFAULT '';
