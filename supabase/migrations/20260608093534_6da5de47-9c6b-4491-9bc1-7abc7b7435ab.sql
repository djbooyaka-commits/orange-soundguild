
CREATE TABLE public.track_likes (
  track_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (track_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.track_likes TO authenticated;
GRANT SELECT ON public.track_likes TO anon;
GRANT ALL ON public.track_likes TO service_role;
ALTER TABLE public.track_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Likes are viewable by everyone" ON public.track_likes FOR SELECT USING (true);
CREATE POLICY "Users can like as themselves" ON public.track_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can unlike their own likes" ON public.track_likes FOR DELETE USING (auth.uid() = user_id);

CREATE TABLE public.comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.comments TO authenticated;
GRANT SELECT ON public.comments TO anon;
GRANT ALL ON public.comments TO service_role;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments are viewable by everyone" ON public.comments FOR SELECT USING (true);
CREATE POLICY "Users can comment as themselves" ON public.comments FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete their own comments" ON public.comments FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_track_likes_track ON public.track_likes(track_id);
CREATE INDEX idx_comments_track ON public.comments(track_id, created_at DESC);
