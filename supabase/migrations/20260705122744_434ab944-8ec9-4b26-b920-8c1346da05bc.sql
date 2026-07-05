
CREATE TABLE public.site_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  spent_on DATE NOT NULL DEFAULT (now()::date),
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_expenses TO authenticated;
GRANT ALL ON public.site_expenses TO service_role;

ALTER TABLE public.site_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view site expenses"
  ON public.site_expenses FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert site expenses"
  ON public.site_expenses FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') AND auth.uid() = user_id);

CREATE POLICY "Admins can update site expenses"
  ON public.site_expenses FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete site expenses"
  ON public.site_expenses FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_site_expenses_updated_at
  BEFORE UPDATE ON public.site_expenses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX site_expenses_spent_on_idx ON public.site_expenses(spent_on DESC);
