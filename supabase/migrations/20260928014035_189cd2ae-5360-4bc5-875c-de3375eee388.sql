CREATE TABLE public.beta_room_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.beta_rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT ON public.beta_room_links TO authenticated;
GRANT ALL ON public.beta_room_links TO service_role;
ALTER TABLE public.beta_room_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view room links" ON public.beta_room_links FOR SELECT TO authenticated USING (public.is_beta_room_member(room_id, auth.uid()) OR public.is_beta_room_owner(room_id, auth.uid()));
CREATE POLICY "Owners can add room links" ON public.beta_room_links FOR INSERT TO authenticated WITH CHECK (public.is_beta_room_owner(room_id, auth.uid()));
CREATE POLICY "Owners can update room links" ON public.beta_room_links FOR UPDATE TO authenticated USING (public.is_beta_room_owner(room_id, auth.uid())) WITH CHECK (public.is_beta_room_owner(room_id, auth.uid()));
CREATE POLICY "Owners can delete room links" ON public.beta_room_links FOR DELETE TO authenticated USING (public.is_beta_room_owner(room_id, auth.uid()));
CREATE TRIGGER update_beta_room_links_updated_at BEFORE UPDATE ON public.beta_room_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();