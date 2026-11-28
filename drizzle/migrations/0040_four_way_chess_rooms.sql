CREATE TABLE public.four_way_chess_rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL UNIQUE,
 host_id uuid NOT NULL,
 members uuid[] NOT NULL,
 seats jsonb NOT NULL,
 state jsonb NOT NULL,
 started boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.four_way_chess_rooms TO authenticated;
GRANT ALL ON public.four_way_chess_rooms TO service_role;
ALTER TABLE public.four_way_chess_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY chess_members_read ON public.four_way_chess_rooms FOR SELECT TO authenticated USING ((select auth.uid()) = ANY(members));
CREATE INDEX chess_room_members_idx ON public.four_way_chess_rooms USING gin(members);
CREATE INDEX chess_room_host_idx ON public.four_way_chess_rooms(host_id);
CREATE FUNCTION public.chess_room_ring() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 PERFORM realtime.send('{}'::jsonb, 'changed', 'chess:' || NEW.id::text, true);
 RETURN NEW;
END; $$;
CREATE TRIGGER chess_room_changed AFTER UPDATE ON public.four_way_chess_rooms FOR EACH ROW EXECUTE FUNCTION public.chess_room_ring();
CREATE POLICY chess_room_broadcast_read ON realtime.messages FOR SELECT TO authenticated USING (
 realtime.topic() LIKE 'chess:%' AND substring(realtime.topic() from 7) IN (SELECT id::text FROM public.four_way_chess_rooms WHERE (select auth.uid()) = ANY(members))
);