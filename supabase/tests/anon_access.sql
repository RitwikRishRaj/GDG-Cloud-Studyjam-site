DO $$
DECLARE
  base_table text;
BEGIN
  FOREACH base_table IN ARRAY ARRAY[
    'participants', 'badges', 'completions', 'snapshots', 'sync_logs', 'settings'
  ] LOOP
    IF has_table_privilege('anon', 'public.' || base_table, 'SELECT') THEN
      RAISE EXCEPTION 'anon can select from base table %', base_table;
    END IF;
  END LOOP;

  IF NOT has_table_privilege('anon', 'public.milestone_board', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.milestone_stats', 'SELECT') THEN
    RAISE EXCEPTION 'anon must be able to select both safe views';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('milestone_board', 'milestone_stats')
      AND column_name IN ('email', 'profile_id', 'profile_url', 'id', 'last_error')
  ) THEN
    RAISE EXCEPTION 'a public view includes a private participant column';
  END IF;
END;
$$;

SET ROLE anon;
SELECT total_participants, milestone_1_count, milestone_2_count,
  milestone_3_count, last_updated
FROM public.milestone_stats;
SELECT rank, name, badge_count, highest_milestone, milestone_reached_on
FROM public.milestone_board
LIMIT 1;
RESET ROLE;
