
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE POLICY "Sender can edit own message"
ON public.direct_messages
FOR UPDATE
USING (auth.uid() = sender_id)
WITH CHECK (auth.uid() = sender_id);

CREATE OR REPLACE FUNCTION public.enforce_dm_edit_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Recipient marking-as-read path: only read_at may change.
  IF auth.uid() = OLD.recipient_id AND auth.uid() <> OLD.sender_id THEN
    IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
       OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
       OR NEW.body IS DISTINCT FROM OLD.body
       OR NEW.image_url IS DISTINCT FROM OLD.image_url
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.edited_at IS DISTINCT FROM OLD.edited_at THEN
      RAISE EXCEPTION 'Recipient can only mark messages as read';
    END IF;
    RETURN NEW;
  END IF;

  -- Sender edit path: only body may change; stamp edited_at automatically.
  IF auth.uid() = OLD.sender_id THEN
    IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
       OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
       OR NEW.image_url IS DISTINCT FROM OLD.image_url
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.read_at IS DISTINCT FROM OLD.read_at THEN
      RAISE EXCEPTION 'Sender can only edit message body';
    END IF;
    IF NEW.body IS DISTINCT FROM OLD.body THEN
      NEW.edited_at := now();
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_dm_edit_columns ON public.direct_messages;
CREATE TRIGGER enforce_dm_edit_columns
BEFORE UPDATE ON public.direct_messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_dm_edit_columns();
