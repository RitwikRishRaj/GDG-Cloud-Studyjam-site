BEGIN;

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
  WHERE c.earned_on >= DATE '2026-09-14'
    AND c.earned_on <= DATE '2026-11-23'
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
  WHERE c.earned_on >= DATE '2026-09-14'
    AND c.earned_on <= DATE '2026-11-23'
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

NOTIFY pgrst, 'reload schema';
COMMIT;
