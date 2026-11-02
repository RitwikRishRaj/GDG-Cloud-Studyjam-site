BEGIN;

CREATE TEMP TABLE milestone_test_refs (
  label text PRIMARY KEY,
  participant_id uuid NOT NULL DEFAULT gen_random_uuid()
);

INSERT INTO milestone_test_refs (label) VALUES
  ('go-ten'),
  ('same-a'),
  ('same-b'),
  ('zulu'),
  ('m1-four'),
  ('m1-three'),
  ('nov-23'),
  ('after-deadline'),
  ('before-start'),
  ('start-date-first'),
  ('split-start');

CREATE TEMP TABLE milestone_test_before AS
SELECT milestone_1_count, milestone_2_count, milestone_3_count
FROM public.milestone_stats;

INSERT INTO public.participants (id, name, email)
SELECT
  r.participant_id,
  CASE r.label
    WHEN 'go-ten' THEN 'Go straight to ten'
    WHEN 'same-a' THEN 'Same Name'
    WHEN 'same-b' THEN 'Same Name'
    WHEN 'zulu' THEN 'Zulu Name'
    WHEN 'm1-four' THEN 'M1 Four Badges'
    WHEN 'm1-three' THEN 'M1 Three Badges'
    WHEN 'nov-23' THEN 'Nov 23 Completer'
    WHEN 'before-start' THEN 'Before Start Only'
    WHEN 'start-date-first' THEN 'Start Date Completer'
    WHEN 'split-start' THEN 'Three Before Start'
    ELSE 'After deadline only'
  END,
  'milestone-test-' || r.label || '@example.invalid'
FROM milestone_test_refs AS r;

WITH curriculum AS (
  SELECT id, row_number() OVER (ORDER BY norm_name) AS badge_ordinal
  FROM public.badges
  WHERE norm_name IN (
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
counts AS (
  SELECT * FROM (VALUES
    ('go-ten', 10),
    ('same-a', 5),
    ('same-b', 5),
    ('zulu', 5),
    ('m1-four', 4),
    ('m1-three', 3),
    ('nov-23', 4),
    ('after-deadline', 10),
    ('before-start', 3),
    ('start-date-first', 3),
    ('split-start', 5)
  ) AS data(label, badge_count)
)
INSERT INTO public.completions (participant_id, badge_id, earned_on)
SELECT
  r.participant_id,
  curriculum.id,
  CASE
    WHEN r.label = 'go-ten' THEN DATE '2026-10-01' + curriculum.badge_ordinal::integer - 1
    WHEN r.label IN ('same-a', 'same-b', 'zulu') THEN DATE '2026-11-02'
    WHEN r.label IN ('m1-four', 'm1-three') THEN DATE '2026-10-20'
    WHEN r.label = 'nov-23' AND curriculum.badge_ordinal = 1 THEN DATE '2026-11-21'
    WHEN r.label = 'nov-23' AND curriculum.badge_ordinal = 2 THEN DATE '2026-11-22'
    WHEN r.label = 'nov-23' AND curriculum.badge_ordinal = 3 THEN DATE '2026-11-23'
    WHEN r.label = 'before-start' THEN DATE '2026-09-13'
    WHEN r.label = 'start-date-first' THEN DATE '2026-09-14' + curriculum.badge_ordinal::integer - 1
    WHEN r.label = 'split-start' AND curriculum.badge_ordinal <= 3 THEN DATE '2026-09-13'
    WHEN r.label = 'split-start' THEN DATE '2026-09-14' + curriculum.badge_ordinal::integer - 4
    ELSE DATE '2026-11-24'
  END
FROM milestone_test_refs AS r
JOIN counts USING (label)
CROSS JOIN curriculum
WHERE curriculum.badge_ordinal <= counts.badge_count;

DO $$
DECLARE
  go_ten record;
  same_rank integer;
  zulu_rank integer;
  nov_23 record;
  start_date record;
  stored_prestart_count integer;
  before_counts record;
  after_counts record;
BEGIN
  SELECT rank, badge_count, highest_milestone, milestone_reached_on
  INTO go_ten
  FROM public.milestone_board
  WHERE name = 'Go straight to ten';
  IF go_ten.badge_count <> 10 OR go_ten.highest_milestone <> 3
     OR go_ten.milestone_reached_on <> DATE '2026-10-10' THEN
    RAISE EXCEPTION '10-badge milestone date/rank calculation failed: %', go_ten;
  END IF;

  SELECT min(rank) INTO same_rank
  FROM public.milestone_board
  WHERE name = 'Same Name';
  IF (SELECT count(DISTINCT rank) FROM public.milestone_board WHERE name = 'Same Name') <> 1
     OR (SELECT count(*) FROM public.milestone_board WHERE name = 'Same Name') <> 2 THEN
    RAISE EXCEPTION 'Exact ties must share a rank.';
  END IF;

  SELECT rank INTO zulu_rank
  FROM public.milestone_board
  WHERE name = 'Zulu Name';
  IF zulu_rank <> same_rank + 2 THEN
    RAISE EXCEPTION 'Name tiebreak ordering/rank gap failed.';
  END IF;

  IF (SELECT rank FROM public.milestone_board WHERE name = 'Go straight to ten') >= same_rank THEN
    RAISE EXCEPTION 'Higher milestones must rank before lower milestones.';
  END IF;

  IF (SELECT rank FROM public.milestone_board WHERE name = 'M1 Four Badges') >=
     (SELECT rank FROM public.milestone_board WHERE name = 'M1 Three Badges') THEN
    RAISE EXCEPTION 'Badge count must break same-date milestone ties.';
  END IF;

  SELECT badge_count, milestone_reached_on INTO nov_23
  FROM public.milestone_board
  WHERE name = 'Nov 23 Completer';
  IF nov_23.badge_count <> 3 OR nov_23.milestone_reached_on <> DATE '2026-11-23' THEN
    RAISE EXCEPTION 'The complete Eastern deadline date must count.';
  END IF;

  SELECT badge_count, highest_milestone, milestone_reached_on
  INTO start_date
  FROM public.milestone_board
  WHERE name = 'Start Date Completer';
  IF start_date.badge_count <> 3 OR start_date.highest_milestone <> 1
     OR start_date.milestone_reached_on <> DATE '2026-09-16' THEN
    RAISE EXCEPTION 'The inclusive campaign start date must count.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.milestone_board
    WHERE name IN ('Before Start Only', 'Three Before Start')
  ) THEN
    RAISE EXCEPTION 'Pre-start badges must not contribute to milestones.';
  END IF;

  SELECT count(*)::integer INTO stored_prestart_count
  FROM public.completions AS c
  JOIN milestone_test_refs AS r ON r.participant_id = c.participant_id
  WHERE r.label IN ('before-start', 'split-start');
  IF stored_prestart_count <> 8 THEN
    RAISE EXCEPTION 'Pre-start completions must remain stored.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.milestone_board WHERE name = 'After deadline only') THEN
    RAISE EXCEPTION 'Completions after the deadline must not count.';
  END IF;

  SELECT * INTO before_counts FROM milestone_test_before;
  SELECT milestone_1_count, milestone_2_count, milestone_3_count
  INTO after_counts FROM public.milestone_stats;
  IF after_counts.milestone_1_count - before_counts.milestone_1_count <> 8
     OR after_counts.milestone_2_count - before_counts.milestone_2_count <> 4
     OR after_counts.milestone_3_count - before_counts.milestone_3_count <> 1 THEN
    RAISE EXCEPTION 'Cumulative stats counts failed: before %, after %', before_counts, after_counts;
  END IF;
END;
$$;

ROLLBACK;
