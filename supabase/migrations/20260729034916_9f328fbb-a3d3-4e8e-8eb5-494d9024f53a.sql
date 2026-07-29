CREATE TABLE public.post_likes (
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

GRANT SELECT ON public.post_likes TO anon;
GRANT SELECT, INSERT, DELETE ON public.post_likes TO authenticated;
GRANT ALL ON public.post_likes TO service_role;

ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "post_likes readable by all"
  ON public.post_likes FOR SELECT
  USING (true);

CREATE POLICY "users can like as themselves"
  ON public.post_likes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users can unlike their own likes"
  ON public.post_likes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX post_likes_post_id_idx ON public.post_likes(post_id);
CREATE INDEX post_likes_user_id_idx ON public.post_likes(user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.post_likes;