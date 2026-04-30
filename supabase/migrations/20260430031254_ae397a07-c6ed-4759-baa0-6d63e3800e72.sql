
CREATE TABLE public.video_events (
  id BIGSERIAL PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('view', 'share')),
  country TEXT,
  country_code TEXT,
  city TEXT,
  region TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_video_events_video_created ON public.video_events(video_id, created_at DESC);
CREATE INDEX idx_video_events_type ON public.video_events(event_type);
CREATE INDEX idx_video_events_country ON public.video_events(country_code);

ALTER TABLE public.video_events ENABLE ROW LEVEL SECURITY;

-- No public policies. Inserts/reads happen via server functions using the service role.
