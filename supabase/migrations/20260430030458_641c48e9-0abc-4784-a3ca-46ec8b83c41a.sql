
-- Videos table
CREATE TABLE public.videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT,
  storage_path TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- Public read of metadata (anyone with link can fetch)
CREATE POLICY "Anyone can view videos"
  ON public.videos FOR SELECT
  USING (true);

-- No public insert/update/delete policies; service role bypasses RLS for admin ops.

-- Storage bucket: public, 500MB limit
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'videos',
  'videos',
  true,
  524288000,
  ARRAY['video/mp4','video/webm','video/quicktime','video/x-matroska','video/ogg']
);

-- Public read for streaming
CREATE POLICY "Public can read videos bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'videos');
