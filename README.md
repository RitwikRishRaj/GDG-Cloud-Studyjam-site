# Cloud Study Jam Milestone Board

## Stack and current database path

The site uses Next.js App Router, React, TypeScript, Tailwind CSS, Drizzle ORM, and `pg`. The application reads `DATABASE_URL` in `src/db/index.ts`; that pool is used by the health endpoint, admin APIs, sheet sync, server-side queries, and seed scripts. The current deployment target for this work is a Vercel Preview, not Production.

Current database consumers:

- `src/app/api/health/route.ts` checks PostgreSQL connectivity.
- `src/lib/queries.ts` serves admin state, sync history, settings, and participants.
- `src/lib/sheets.ts` reads Google Sheets and upserts legacy participant/sync data.
- `src/lib/demo-data.ts` contains the existing optional demo seed path.
- `src/app/api/admin/**` and `src/app/admin/**` use the existing participant, settings, and sync tables. Their UI and routes remain unchanged.
- `scripts/seed.ts`, `drizzle.config.ts`, and `src/db/schema.ts` support the existing Drizzle database.
- Public homepage data is read only from `public.milestone_board` and `public.milestone_stats` by `src/lib/milestone-data.ts`.

The milestone schema retains the legacy columns needed by `/admin`, and adds `profile_id`, sheet metadata, scrape state, `badges`, `completions`, and `snapshots`. The importer updates legacy `badge_count` for the unchanged admin display; the public board derives its counts and dates from curriculum completions.

## Supabase setup and data migration

1. Create a Supabase project and use its PostgreSQL database, not the browser's service-role key, for server-side access. Keep the source Docker database running.
2. If preserving current admin settings and logs, make a custom-format backup of only the legacy tables from the Docker database **before** creating target tables:

   ```sh
   pg_dump --format=custom --no-owner --no-acl \
     --table=public.participants \
     --table=public.sync_logs \
     --table=public.settings \
     --file=legacy.dump "$SOURCE_DATABASE_URL"
   ```

   `legacy.dump` contains participant email data; keep it local. It is ignored by Git.
3. Restore into a fresh Supabase project, then apply `supabase/migrations/20261102000000_milestone_board.sql` using the Supabase SQL editor or `psql`:

   ```sh
   pg_restore --no-owner --no-acl --exit-on-error \
     --dbname "$SUPABASE_DATABASE_URL" legacy.dump
   psql "$SUPABASE_DATABASE_URL" \
     --set ON_ERROR_STOP=1 \
     --file supabase/migrations/20261102000000_milestone_board.sql
   ```

   If starting with an empty database and no legacy tables to restore, apply the migration directly. Do not restore over the migration-created tables.
4. Inspect migration results and run the isolated SQL ranking tests from `supabase/tests/milestone_ranking.sql` on a test database. The tests run in a transaction and roll back their sample rows.
5. Import the participant CSV as described below. Invalid and duplicate profile URLs are reported and skipped; the importer uses only the five named columns. Keep the CSV out of Git.
6. Compare source and target participant counts and confirm sample records, completions, and admin settings before cutover. Run the anon REST verification script. Do not shut down or modify the Docker database until you have verified the restored data.
7. Set `DATABASE_URL` in **Vercel Preview only** to the Supabase pooler URL and test the preview. Keep Production on its current environment until approval. The Vercel app should use the pooler URL appropriate for its serverless connection pattern; do not use the anon key as `DATABASE_URL`.

The migration enables RLS on `participants`, `badges`, `completions`, `snapshots`, `sync_logs`, and `settings`; removes `PUBLIC`, `anon`, and `authenticated` table access; and grants those browser roles `SELECT` only on the two safe views. The board view contains only rank, name, badge count, highest milestone, and milestone date. It contains no participant ID, email, profile URL, or scrape error.

### Rollback

Keep the source database online and preserve its original `DATABASE_URL`. For the application cutover, update the Preview environment variable and redeploy. The new application expects the safe views, so changing `DATABASE_URL` back to an unmodified legacy Docker database will show the board's database-unavailable message. To make a same-build, environment-only rollback possible, first apply the additive schema/views migration to a separately backed-up copy of the Docker database and verify it; do not run it against the live source database without explicit approval. Alternatively, redeploy the pre-migration build with the original URL. No table is dropped by this migration.

## CSV importer

Install the Python tools, then point `DATABASE_URL` at the Supabase session-mode pooler for local import:

```sh
python -m pip install -r requirements.txt
python scripts/import_participants.py --csv "path/to/participants.csv"
```

The importer extracts and validates the profile UUID, upserts by UUID, and associates a matching legacy row by email only when that row has no UUID yet. It reports duplicate profile URLs, invalid URLs, malformed counts, and database conflicts without printing email values. It reads `DATABASE_URL` from the process environment or ignored `.env.local` (the process environment takes precedence). It does not update completion records; those come from the profile scraper.

## Scraper

The scraper uses the observed server-rendered `div.profile-badge` markup and does not use a browser. A sample HTML capture was kept locally under the ignored `.taste-skill/` directory, not committed. To inspect one profile:

```sh
python scripts/scrape_profiles.py --dump \
  https://www.skills.google/public_profiles/cfb458be-edc6-41c6-a14a-dfd27319c418
```

To run the scraper locally, set `DATABASE_URL` to the Supabase **session-mode pooler** connection string in the environment or ignored `.env.local` (the GitHub runner is IPv4), then run:

```sh
python scripts/scrape_profiles.py
```

It limits requests to six concurrent workers, retries 429/5xx/timeouts, waits briefly between requests, and only upserts known curriculum badges. Fetch/parse errors update scrape status but preserve completions. A zero-badge parse cannot erase existing data. If the overall campaign failure rate is 30% or higher, the run exits non-zero without writing a snapshot. The first successful run after the deadline creates the final IST-dated snapshot; later runs do not change it.

To resume without re-fetching successful profiles, run `python scripts/scrape_profiles.py --only-pending`. It processes pending, error, and not-found rows, while excluding successful or terminally skipped rows. A new failure gets one immediate retry; two consecutive failures mark that profile skipped so resume runs cannot loop on it. If batching with `--limit`, repeat until the output reports no pending profiles; only a complete run below the campaign failure threshold writes a snapshot.

Run parser/importer checks with:

```sh
python scripts/test_scraper.py
python scripts/test_import_participants.py
```

## GitHub Actions and secrets

The workflow at `.github/workflows/nightly-scrape.yml` runs at `0 20 * * *` UTC (01:30 IST) and supports `workflow_dispatch`. In the repository's Actions secrets, add `DATABASE_URL` with the Supabase session-mode pooler connection string. Do not add CSVs, `.env` files, anon keys, or passwords to the repository. To add a second daily run, add one more `- cron: "..."` item under `schedule`.

For local anon-key checks, put `SUPABASE_URL` and either the legacy `SUPABASE_ANON_KEY` or the public `SUPABASE_PUBLISHABLE_KEY` (or the corresponding `NEXT_PUBLIC_` variable) in the ignored `.env.local`, then run:

```sh
python scripts/verify_supabase_anon.py
```

The script requests zero rows from every base table, requires 401/403 denials, and checks that anon can read only the two views. A 404 is reported as inconclusive because the table or view may be missing from the REST schema cache. It never prints the key or response bodies.

## Vercel deployment

1. Apply and verify the Supabase migration and import/scrape data first.
2. Configure `DATABASE_URL`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` in Vercel **Preview** environment variables. Admin access fails closed unless both admin variables are configured.
3. Deploy this branch as a Preview and check `/`, `/#milestone-board`, `/leaderboard` (redirect), and `/admin`. Do not promote or change Production before approval.
4. To roll back the Preview, restore its previous database environment and redeploy a build compatible with that database. Keep the Docker source database until final verification.
