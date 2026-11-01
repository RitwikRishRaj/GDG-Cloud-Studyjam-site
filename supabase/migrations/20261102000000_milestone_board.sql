CREATE TABLE IF NOT EXISTS public.participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  profile_id uuid,
  profile_url text,
  sheet_status text,
  sheet_badge_count integer NOT NULL DEFAULT 0,
  scrape_status text NOT NULL DEFAULT 'pending',
  last_scraped_at timestamptz,
  last_error text,
  badge_count integer NOT NULL DEFAULT 0,
  last_badge_date timestamp,
  badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  avatar_hue integer NOT NULL DEFAULT 210,
  updated_at timestamp NOT NULL DEFAULT now(),
  created_at timestamp NOT NULL DEFAULT now()
);

ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS profile_id uuid,
  ADD COLUMN IF NOT EXISTS sheet_status text,
  ADD COLUMN IF NOT EXISTS sheet_badge_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrape_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_scraped_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS profile_url text,
  ADD COLUMN IF NOT EXISTS badge_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_badge_date timestamp,
  ADD COLUMN IF NOT EXISTS badges jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS avatar_hue integer NOT NULL DEFAULT 210,
  ADD COLUMN IF NOT EXISTS updated_at timestamp NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at timestamp NOT NULL DEFAULT now();

UPDATE public.participants
SET sheet_badge_count = badge_count
WHERE sheet_badge_count = 0 AND badge_count <> 0;

CREATE UNIQUE INDEX IF NOT EXISTS participants_email_idx
  ON public.participants (email);
CREATE UNIQUE INDEX IF NOT EXISTS participants_profile_id_idx
  ON public.participants (profile_id);
CREATE INDEX IF NOT EXISTS participants_badge_count_idx
  ON public.participants (badge_count);

CREATE TABLE IF NOT EXISTS public.badges (
  id serial PRIMARY KEY,
  name text NOT NULL,
  norm_name text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS badges_norm_name_idx
  ON public.badges (norm_name);

CREATE TABLE IF NOT EXISTS public.completions (
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  badge_id integer NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_on date NOT NULL,
  PRIMARY KEY (participant_id, badge_id)
);

CREATE TABLE IF NOT EXISTS public.snapshots (
  snap_date date NOT NULL,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  badge_count integer NOT NULL,
  rank integer NOT NULL,
  PRIMARY KEY (snap_date, participant_id)
);

CREATE TABLE IF NOT EXISTS public.sync_logs (
  id serial PRIMARY KEY,
  status text NOT NULL,
  source text,
  rows_processed integer NOT NULL DEFAULT 0,
  rows_added integer NOT NULL DEFAULT 0,
  rows_updated integer NOT NULL DEFAULT 0,
  message text,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.settings (
  key text PRIMARY KEY,
  value jsonb,
  updated_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO public.badges (name, norm_name) VALUES
  ('The Basics of Google Cloud Compute', 'the basics of google cloud compute'),
  ('Configure Service Accounts and IAM Roles for Google Cloud', 'configure service accounts and iam roles for google cloud'),
  ('Implement Speech and Language Solutions with Pre-trained APIs', 'implement speech and language solutions with pre trained apis'),
  ('Develop AI-Powered Prototypes in Google AI Studio', 'develop ai powered prototypes in google ai studio'),
  ('Analyze Images with the Cloud Vision API', 'analyze images with the cloud vision api'),
  ('Build a Website on Google Cloud', 'build a website on google cloud'),
  ('Create Your First Gemini Enterprise Application', 'create your first gemini enterprise application'),
  ('Store, Process, and Manage Data on Google Cloud - Console', 'store process and manage data on google cloud console'),
  ('Using the Google Cloud Speech API', 'using the google cloud speech api'),
  ('Explore Generative AI in Agent Platform', 'explore generative ai in agent platform')
ON CONFLICT (norm_name) DO UPDATE SET name = EXCLUDED.name;

ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE VIEW public.milestone_board
WITH (security_barrier = true) AS
WITH ordered_completions AS (
  SELECT
    c.participant_id,
    c.earned_on,
    row_number() OVER (
      PARTITION BY c.participant_id
      ORDER BY c.earned_on, c.badge_id
    ) AS badge_ordinal
  FROM public.completions AS c
  JOIN public.badges AS b ON b.id = c.badge_id
  WHERE c.earned_on <= DATE '2026-11-23'
    AND b.norm_name IN (
      'the basics of google cloud compute',
      'configure service accounts and iam roles for google cloud',
      'implement speech and language solutions with pre trained apis',
      'develop ai powered prototypes in google ai studio',
      'analyze images with the cloud vision api',
      'build a website on google cloud',
      'create your first gemini enterprise application',
      'store process and manage data on google cloud console',
      'using the google cloud speech api',
      'explore generative ai in agent platform'
    )
),
participant_counts AS (
  SELECT
    participant_id,
    count(*)::integer AS badge_count,
    max(earned_on) FILTER (WHERE badge_ordinal = 3) AS milestone_1_date,
    max(earned_on) FILTER (WHERE badge_ordinal = 5) AS milestone_2_date,
    max(earned_on) FILTER (WHERE badge_ordinal = 10) AS milestone_3_date
  FROM ordered_completions
  GROUP BY participant_id
),
scored AS (
  SELECT
    p.name,
    pc.badge_count,
    CASE
      WHEN pc.badge_count >= 10 THEN 3
      WHEN pc.badge_count >= 5 THEN 2
      ELSE 1
    END AS highest_milestone,
    CASE
      WHEN pc.badge_count >= 10 THEN pc.milestone_3_date
      WHEN pc.badge_count >= 5 THEN pc.milestone_2_date
      ELSE pc.milestone_1_date
    END AS milestone_reached_on
  FROM participant_counts AS pc
  JOIN public.participants AS p ON p.id = pc.participant_id
  WHERE pc.badge_count >= 3
)
SELECT
  rank() OVER (
    ORDER BY highest_milestone DESC,
      milestone_reached_on ASC,
      badge_count DESC,
      name ASC
  )::integer AS rank,
  name,
  badge_count,
  highest_milestone,
  milestone_reached_on
FROM scored;

CREATE OR REPLACE VIEW public.milestone_stats
WITH (security_barrier = true) AS
WITH participant_counts AS (
  SELECT participant_id, count(*)::integer AS badge_count
  FROM public.completions AS c
  JOIN public.badges AS b ON b.id = c.badge_id
  WHERE c.earned_on <= DATE '2026-11-23'
    AND b.norm_name IN (
      'the basics of google cloud compute',
      'configure service accounts and iam roles for google cloud',
      'implement speech and language solutions with pre trained apis',
      'develop ai powered prototypes in google ai studio',
      'analyze images with the cloud vision api',
      'build a website on google cloud',
      'create your first gemini enterprise application',
      'store process and manage data on google cloud console',
      'using the google cloud speech api',
      'explore generative ai in agent platform'
    )
  GROUP BY participant_id
)
SELECT
  (SELECT count(*)::integer FROM public.participants) AS total_participants,
  (SELECT count(*)::integer FROM participant_counts WHERE badge_count >= 3) AS milestone_1_count,
  (SELECT count(*)::integer FROM participant_counts WHERE badge_count >= 5) AS milestone_2_count,
  (SELECT count(*)::integer FROM participant_counts WHERE badge_count >= 10) AS milestone_3_count,
  (SELECT max(last_scraped_at) FROM public.participants) AS last_updated;

REVOKE ALL ON TABLE
  public.participants,
  public.badges,
  public.completions,
  public.snapshots,
  public.sync_logs,
  public.settings,
  public.milestone_board,
  public.milestone_stats
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.badges_id_seq, public.sync_logs_id_seq
FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON TABLE public.milestone_board, public.milestone_stats
TO anon, authenticated;

COMMENT ON VIEW public.milestone_board IS
  'Public projection only: rank, name, curriculum badge count, milestone, and milestone date.';
COMMENT ON VIEW public.milestone_stats IS
  'Public totals and aggregate milestone counts; contains no participant identifiers.';
