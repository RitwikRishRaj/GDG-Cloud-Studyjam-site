#!/usr/bin/env python3
"""Scrape curriculum badge dates from public Google Skills profiles."""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from uuid import UUID
from zoneinfo import ZoneInfo

import psycopg
import requests
from requests.adapters import HTTPAdapter
from selectolax.parser import HTMLParser
from urllib3.util.retry import Retry

logger = logging.getLogger(__name__)

IST = ZoneInfo("Asia/Kolkata")
CAMPAIGN_START = date(2026, 9, 14)
EASTERN_DEADLINE_DATE = date(2026, 11, 23)
MAX_WORKERS = 6
BATCH_SIZE = 100
MAX_DB_RETRIES = 3
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

CURRICULUM = [
    "The Basics of Google Cloud Compute",
    "Configure Service Accounts and IAM Roles for Google Cloud",
    "Implement Speech and Language Solutions with Pre-trained APIs",
    "Develop AI-Powered Prototypes in Google AI Studio",
    "Analyze Images with the Cloud Vision API",
    "Build a Website on Google Cloud",
    "Create Your First Gemini Enterprise Application",
    "Store, Process, and Manage Data on Google Cloud - Console",
    "Using the Google Cloud Speech API",
    "Explore Generative AI in Agent Platform",
]


# Participants flagged developer_track in the database are counted against this list.
DEVELOPER_CURRICULUM = [
    "The Basics of Google Cloud Compute",
    "Configure Service Accounts and IAM Roles for Google Cloud",
    "Implement Speech and Language Solutions with Pre-trained APIs",
    "Develop AI-Powered Prototypes in Google AI Studio",
    "Analyze Images with the Cloud Vision API",
    "Prompt Design in Agent Platform",
    "Explore Generative AI in Agent Platform",
    "Create Your First Gemini Enterprise Application",
    "Orchestrate Multi-agent Workflows with Gemini Enterprise",
    "Google DeepMind: Train A Small Language Model",
]


def normalize_badge_name(name: str) -> str:
    tokens = re.findall(r"[a-z0-9]+", name.lower())
    return " ".join("ai" if token == "al" else token for token in tokens)


CURRICULUM_BY_NAME = {normalize_badge_name(name): name for name in CURRICULUM}
DEVELOPER_NORM_NAMES = [normalize_badge_name(name) for name in DEVELOPER_CURRICULUM]


class ProfileError(Exception):
    """A profile fetch or parse failed without replacing stored completions."""


class ProfileNotFound(ProfileError):
    pass


def parse_profile_badges(html: str) -> tuple[dict[str, tuple[str, date]], list[str]]:
    tree = HTMLParser(html)
    cards = tree.css("div.profile-badge")
    known: dict[str, tuple[str, date]] = {}
    unknown: list[str] = []

    for card in cards:
        title = card.css_first("span.ql-title-medium.l-mts")
        details = card.css_first("span.ql-body-medium.l-mbs")
        if title is None or details is None:
            raise ProfileError("Badge card did not contain the observed title and earned-date fields.")

        raw_name = " ".join(title.text(strip=True).split())
        date_text = details.text(separator=" ", strip=True)
        match = re.search(
            r"\bEarned\s+([A-Za-z]{3}\s+\d{1,2},\s+\d{4})\b",
            date_text,
            re.IGNORECASE,
        )
        if not raw_name or match is None:
            raise ProfileError("Badge card was missing its name or earned date.")

        try:
            earned_on = datetime.strptime(match.group(1), "%b %d, %Y").date()
        except ValueError as error:
            raise ProfileError("Badge card contained an invalid earned date.") from error

        normalized = normalize_badge_name(raw_name)
        canonical = CURRICULUM_BY_NAME.get(normalized)
        if canonical is None:
            unknown.append(raw_name)
            continue

        current = known.get(normalized)
        if current is None or earned_on < current[1]:
            known[normalized] = (canonical, earned_on)

    return known, unknown


def make_session() -> requests.Session:
    retry = Retry(
        total=4,
        connect=4,
        read=4,
        status=4,
        backoff_factor=0.6,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        respect_retry_after_header=True,
        raise_on_status=False,
    )
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html"})
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


_thread_state = threading.local()


def session_for_thread() -> requests.Session:
    session = getattr(_thread_state, "session", None)
    if session is None:
        session = make_session()
        _thread_state.session = session
    return session


def validate_profile_url(raw_url: str, expected_profile_id: str) -> str:
    parsed = urlparse(raw_url)
    segments = parsed.path.rstrip("/").split("/")
    if (
        parsed.scheme != "https"
        or parsed.hostname not in {"skills.google", "www.skills.google"}
        or len(segments) != 3
        or segments[1] != "public_profiles"
    ):
        raise ProfileError("Profile URL is not a public Google Skills profile URL.")
    try:
        profile_id = str(UUID(segments[2]))
        expected_id = str(UUID(expected_profile_id))
    except ValueError as error:
        raise ProfileError("Profile URL or stored profile ID is invalid.") from error
    if profile_id != expected_id:
        raise ProfileError("Profile URL does not match the stored profile ID.")
    return f"https://www.skills.google/public_profiles/{profile_id}"


def scrape_one(participant: tuple[str, str, str, int]) -> dict[str, Any]:
    participant_id, profile_id, raw_url, existing_count = participant
    unknown: list[str] = []
    try:
        url = validate_profile_url(raw_url, profile_id)
        time.sleep(random.uniform(0.2, 0.7))
        response = session_for_thread().get(url, timeout=(10, 30))
        if response.status_code == 404:
            raise ProfileNotFound("HTTP 404: profile not found or private.")
        if not response.ok:
            raise ProfileError(f"HTTP {response.status_code} while fetching profile.")

        badges, unknown = parse_profile_badges(response.text)
        if not badges and existing_count > 0:
            raise ProfileError(
                "Profile parsed with zero curriculum badges; preserving previous completions."
            )
        return {
            "participant_id": participant_id,
            "ok": True,
            "badges": badges,
            "unknown_badge_names": unknown,
            "error": None,
        }
    except requests.RequestException as error:
        return {
            "participant_id": participant_id,
            "ok": False,
            "not_found": False,
            "badges": {},
            "unknown_badge_names": unknown,
            "error": f"Fetch failed after retries: {type(error).__name__}.",
        }
    except ProfileNotFound as error:
        return {
            "participant_id": participant_id,
            "ok": False,
            "not_found": True,
            "badges": {},
            "unknown_badge_names": unknown,
            "error": str(error),
        }
    except ProfileError as error:
        return {
            "participant_id": participant_id,
            "ok": False,
            "not_found": False,
            "badges": {},
            "unknown_badge_names": unknown,
            "error": str(error),
        }
    # Keep an unexpected profile error from aborting the rest of the scrape.
    except Exception as error:  # noqa: BLE001
        return {
            "participant_id": participant_id,
            "ok": False,
            "not_found": False,
            "badges": {},
            "unknown_badge_names": unknown,
            "error": f"Unexpected scrape error: {type(error).__name__}.",
        }


def scrape_with_retry(
    participant: tuple[str, str, str, int, str | None],
) -> dict[str, Any]:
    previous_status = participant[4]
    scrape_args = participant[:4]
    result = scrape_one(scrape_args)
    unknown = list(result.get("unknown_badge_names", []))
    if not result["ok"]:
        if previous_status not in {"error", "not_found"}:
            retry_result = scrape_one(scrape_args)
            unknown.extend(retry_result.get("unknown_badge_names", []))
            result = retry_result
        if not result["ok"]:
            result["failure_streak"] = 2
    result["previous_status"] = previous_status
    result["unknown_badge_names"] = list(dict.fromkeys(unknown))
    return result


def dump_profile(url: str) -> int:
    try:
        response = make_session().get(url, timeout=(10, 30))
        if response.status_code == 404:
            raise ProfileNotFound("HTTP 404: profile not found or private.")
        response.raise_for_status()
        badges, unknown = parse_profile_badges(response.text)
    except (requests.RequestException, ProfileError) as error:
        print(f"Profile dump failed: {error}", file=sys.stderr)
        return 1

    output = {
        "badges": [
            {"name": name, "earned_on": earned_on.isoformat()}
            for name, earned_on in badges.values()
        ],
        "unknown_badge_names": unknown,
    }
    print(json.dumps(output, indent=2, ensure_ascii=False))
    return 0


def load_participants(
    connection: psycopg.Connection,
    only: str | None = None,
) -> list[tuple[str, str, str, int, str | None]]:
    """Load participants; `only` limits to one by email, profile UUID, row id or profile URL."""
    selector_sql = ""
    selector_params: tuple[str, ...] = ()
    if only:
        key = only.strip()
        tail = key.rstrip("/").rsplit("/", 1)[-1]
        selector_sql = (
            "AND (lower(p.email) = lower(%s) OR p.id::text = %s "
            "OR p.profile_id::text = %s OR p.profile_url = %s)"
        )
        selector_params = (key, tail, tail, key)
    with connection.cursor() as cursor:
        cursor.execute(
            f"""
            SELECT p.id::text, p.profile_id::text, p.profile_url,
              count(c.badge_id) FILTER (
                WHERE c.earned_on >= %s AND c.earned_on <= %s
                  AND b.norm_name = ANY(%s)
              )::integer AS existing_count, p.scrape_status
            FROM public.participants AS p
            LEFT JOIN public.completions AS c ON c.participant_id = p.id
            LEFT JOIN public.badges AS b ON b.id = c.badge_id
            WHERE p.profile_id IS NOT NULL
            {selector_sql}
            GROUP BY p.id
            ORDER BY p.id
            """,
            (
                CAMPAIGN_START,
                EASTERN_DEADLINE_DATE,
                list(CURRICULUM_BY_NAME),
                *selector_params,
            ),
        )
        rows = cursor.fetchall()
    return [
        (participant_id, profile_id, profile_url or "", existing_count, status)
        for participant_id, profile_id, profile_url, existing_count, status in rows
    ]


def save_result(
    connection: psycopg.Connection,
    result: dict[str, Any],
    keep_timestamps: bool = False,
) -> None:
    participant_id = str(result["participant_id"])
    with connection.transaction():
        with connection.cursor() as cursor:
            if not result["ok"]:
                status = (
                    "skipped"
                    if result.get("failure_streak", 1) >= 2
                    else "not_found" if result.get("not_found") else "error"
                )
                cursor.execute(
                    """
                    UPDATE public.participants
                    SET scrape_status = %s, last_error = %s
                    WHERE id = %s
                    """,
                    (status, str(result["error"])[:1000], participant_id),
                )
                return

            badges = result["badges"]
            assert isinstance(badges, dict)
            for normalized, (name, earned_on) in badges.items():
                cursor.execute(
                    """
                    INSERT INTO public.completions (participant_id, badge_id, earned_on)
                    SELECT %s, b.id, %s
                    FROM public.badges AS b
                    WHERE b.norm_name = %s
                    ON CONFLICT (participant_id, badge_id)
                    DO UPDATE SET earned_on = LEAST(
                      public.completions.earned_on,
                      EXCLUDED.earned_on
                    )
                    """,
                    (participant_id, earned_on, normalized),
                )
                if cursor.rowcount == 0:
                    raise ProfileError(f"Curriculum badge is not seeded: {name}.")

            cursor.execute(
                """
                UPDATE public.participants AS p
                SET scrape_status = 'success', last_scraped_at = {scraped_at}, last_error = NULL,
                    badge_count = COALESCE((
                      SELECT count(*)::integer
                      FROM public.completions AS c
                      JOIN public.badges AS b ON b.id = c.badge_id
                      WHERE c.participant_id = p.id
                        AND c.earned_on >= %s AND c.earned_on <= %s
                        AND b.norm_name = ANY(%s)
                    ), 0),
                    last_badge_date = (
                      SELECT max(c.earned_on)::timestamp
                      FROM public.completions AS c
                      JOIN public.badges AS b ON b.id = c.badge_id
                      WHERE c.participant_id = p.id
                        AND c.earned_on >= %s AND c.earned_on <= %s
                        AND b.norm_name = ANY(%s)
                    ),
                    badges = COALESCE((
                      SELECT jsonb_agg(
                        jsonb_build_object('name', b.name, 'date', c.earned_on::text)
                        ORDER BY c.earned_on, b.name
                      )
                      FROM public.completions AS c
                      JOIN public.badges AS b ON b.id = c.badge_id
                      WHERE c.participant_id = p.id
                        AND c.earned_on >= %s AND c.earned_on <= %s
                        AND b.norm_name = ANY(%s)
                    ), '[]'::jsonb),
                    updated_at = {updated_at}
                WHERE p.id = %s
                """.format(
                    scraped_at="p.last_scraped_at" if keep_timestamps else "now()",
                    updated_at="p.updated_at" if keep_timestamps else "now()",
                ),
                (
                    CAMPAIGN_START,
                    EASTERN_DEADLINE_DATE,
                    list(CURRICULUM_BY_NAME),
                    CAMPAIGN_START,
                    EASTERN_DEADLINE_DATE,
                    list(CURRICULUM_BY_NAME),
                    CAMPAIGN_START,
                    EASTERN_DEADLINE_DATE,
                    list(CURRICULUM_BY_NAME),
                    participant_id,
                ),
            )


def write_snapshot(connection: psycopg.Connection, snap_date: date) -> None:
    curriculum_names = list(CURRICULUM_BY_NAME)
    with connection.transaction(), connection.cursor() as cursor:
        cursor.execute(
            """
            WITH ordered AS (
                  SELECT c.participant_id, c.badge_id, c.earned_on,
                    row_number() OVER (
                      PARTITION BY c.participant_id
                      ORDER BY c.earned_on, c.badge_id
                    ) AS badge_ordinal
                  FROM public.completions AS c
                  JOIN public.badges AS b ON b.id = c.badge_id
                  JOIN public.participants AS pp ON pp.id = c.participant_id
                  WHERE c.earned_on >= %s AND c.earned_on <= %s
                    AND (
                      (NOT pp.developer_track AND b.norm_name = ANY(%s))
                      OR (pp.developer_track AND b.norm_name = ANY(%s))
                    )
                ),
                counts AS (
                  SELECT participant_id, count(*)::integer AS badge_count,
                    max(earned_on) FILTER (WHERE badge_ordinal = 3) AS date_3,
                    max(earned_on) FILTER (WHERE badge_ordinal = 5) AS date_5,
                    max(earned_on) FILTER (WHERE badge_ordinal = 10) AS date_10
                  FROM ordered
                  GROUP BY participant_id
                ),
                scored AS (
                  SELECT p.id AS participant_id, p.name, counts.badge_count,
                    CASE WHEN counts.badge_count >= 10 THEN 3
                         WHEN counts.badge_count >= 5 THEN 2 ELSE 1 END AS milestone,
                    CASE WHEN counts.badge_count >= 10 THEN counts.date_10
                         WHEN counts.badge_count >= 5 THEN counts.date_5
                         ELSE counts.date_3 END AS reached_on
                  FROM counts
                  JOIN public.participants AS p ON p.id = counts.participant_id
                  WHERE counts.badge_count >= 3
                ),
                ranked AS (
                  SELECT participant_id, badge_count,
                    rank() OVER (
                      ORDER BY milestone DESC, reached_on ASC,
                        badge_count DESC, name ASC
                    )::integer AS participant_rank
                  FROM scored
                )
                INSERT INTO public.snapshots (snap_date, participant_id, badge_count, rank)
                SELECT %s, participant_id, badge_count, participant_rank
                FROM ranked
                ON CONFLICT (snap_date, participant_id) DO UPDATE SET
                  badge_count = EXCLUDED.badge_count,
                  rank = EXCLUDED.rank
            """,
            (
                CAMPAIGN_START,
                EASTERN_DEADLINE_DATE,
                curriculum_names,
                DEVELOPER_NORM_NAMES,
                snap_date,
            ),
        )


def append_unknown_badges(results: list[dict[str, Any]]) -> None:
    counts: dict[str, int] = {}
    for result in results:
        for name in set(result.get("unknown_badge_names", [])):
            counts[name] = counts.get(name, 0) + 1
    if not counts:
        return

    report = Path(".taste-skill/campaign-resume-unknowns.jsonl")
    report.parent.mkdir(parents=True, exist_ok=True)
    with report.open("a", encoding="utf-8") as output:
        for name, count in sorted(counts.items()):
            output.write(json.dumps({"name": name, "profiles": count}, ensure_ascii=False) + "\n")


def write_batch(
    database_url: str, results: list[dict[str, Any]], keep_timestamps: bool = False
) -> None:
    for retry in range(MAX_DB_RETRIES + 1):
        try:
            with psycopg.connect(database_url) as connection, connection.transaction():
                for result in results:
                    if keep_timestamps:
                        save_result(connection, result, keep_timestamps=True)
                    else:
                        save_result(connection, result)
            return
        except (psycopg.OperationalError, psycopg.InterfaceError):
            if retry == MAX_DB_RETRIES:
                raise
            logger.warning(
                "Database connection failed while saving a batch; retry %d of %d.",
                retry + 1,
                MAX_DB_RETRIES,
            )
            time.sleep(0.5 * (retry + 1))


def is_pending_status(status: str | None) -> bool:
    return status not in {"success", "skipped"}


def should_write_snapshot(
    *, only_pending: bool, limit: int | None, pending_count: int, failure_rate: float,
) -> bool:
    return (
        pending_count == 0
        and (limit is None or only_pending)
        and failure_rate < 0.30
    )


def campaign_status_counts(connection: psycopg.Connection) -> tuple[int, int, int, int, int]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT count(*)::integer,
              count(*) FILTER (WHERE scrape_status = 'success')::integer,
              count(*) FILTER (
                WHERE scrape_status = 'not_found'
                  OR (scrape_status = 'skipped' AND last_error LIKE 'HTTP 404%')
              )::integer,
              count(*) FILTER (
                WHERE scrape_status IN ('error', 'skipped')
                  AND last_error NOT LIKE 'HTTP 404%'
              )::integer,
              count(*) FILTER (
                WHERE scrape_status IS DISTINCT FROM 'success'
                  AND scrape_status IS DISTINCT FROM 'skipped'
              )::integer
            FROM public.participants
            WHERE profile_id IS NOT NULL
            """
        )
        row = cursor.fetchone()
        assert row is not None
        return tuple(row)


def result_counts(results: list[dict[str, Any]]) -> tuple[int, int, int]:
    ok = sum(bool(result["ok"]) for result in results)
    not_found = sum(
        not bool(result["ok"]) and bool(result.get("not_found"))
        for result in results
    )
    return ok, not_found, len(results) - ok - not_found


def print_summary(processed: int, total: int, ok: int, not_found: int, errors: int) -> None:
    print(
        f"Final summary: processed={processed}/{total}; ok={ok}; "
        f"404/private={not_found}; errors={errors}",
        flush=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dump",
        metavar="URL",
        help="fetch one profile and print parsed curriculum badges as JSON",
    )
    parser.add_argument(
        "--only-pending",
        action="store_true",
        help="scrape only rows not yet successful; terminal skipped rows are excluded",
    )
    parser.add_argument(
        "--limit",
        type=int,
        metavar="N",
        help="scrape only the first N selected participants",
    )
    parser.add_argument(
        "--only",
        metavar="ID",
        help="scrape just one participant: email, profile UUID, row id or profile URL",
    )
    parser.add_argument(
        "--keep-timestamps",
        action="store_true",
        help="leave last_scraped_at/updated_at untouched so the site's 'last updated' "
        "time does not change",
    )
    parser.add_argument(
        "--snapshot",
        action="store_true",
        help="with --only: also rebuild today's leaderboard snapshot after the scrape",
    )
    parser.add_argument(
        "--revalidate",
        action="store_true",
        help="with --snapshot: refresh the cached leaderboard using "
        "SNAPSHOT_REVALIDATE_URL and SNAPSHOT_REVALIDATE_SECRET",
    )
    parser.add_argument(
        "--allow-frozen",
        action="store_true",
        help="with --only: run even though the final campaign snapshot already exists",
    )
    args = parser.parse_args()
    if args.allow_frozen and not args.only:
        parser.error("--allow-frozen is only for --only runs.")
    if args.snapshot and not args.only:
        parser.error("--snapshot is only for --only runs; full runs write it automatically.")
    if args.revalidate and not args.snapshot:
        parser.error("--revalidate requires --snapshot.")
    if args.only and args.limit is not None:
        parser.error("--only cannot be combined with --limit.")
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be a positive integer.")
    if args.dump:
        if args.limit is not None:
            parser.error("--limit cannot be used with --dump.")
        return dump_profile(args.dump)

    from local_env import load_local_environment

    load_local_environment()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        parser.error("DATABASE_URL is required for a database scrape.")

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    today_ist = datetime.now(IST).date()
    try:
        with psycopg.connect(database_url) as connection:
            if today_ist > EASTERN_DEADLINE_DATE and not args.allow_frozen:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT EXISTS (SELECT 1 FROM public.snapshots WHERE snap_date > %s)",
                        (EASTERN_DEADLINE_DATE,),
                    )
                    snapshot_row = cursor.fetchone()
                    final_snapshot_exists = bool(snapshot_row and snapshot_row[0])
                if final_snapshot_exists:
                    print("Final campaign snapshot already exists; board data is frozen.")
                    return 0

            participants = load_participants(connection, args.only)
    except psycopg.Error as error:
        print(
            f"ERROR: could not load participants ({type(error).__name__}).",
            file=sys.stderr,
        )
        return 1

    if args.only and not participants:
        print("ERROR: no participant matched --only.", file=sys.stderr)
        return 1
    participants = [
        participant
        for participant in participants
        if args.only or (
            is_pending_status(participant[4])
            if args.only_pending
            else participant[4] != "skipped"
        )
    ]
    if args.limit is not None:
        participants = participants[: args.limit]

    total = len(participants)
    processed = ok_total = not_found_total = errors_total = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        for start in range(0, total, BATCH_SIZE):
            batch = participants[start : start + BATCH_SIZE]
            futures = {
                executor.submit(scrape_with_retry, participant): participant
                for participant in batch
            }
            results = []
            for future in as_completed(futures):
                try:
                    results.append(future.result())
                # Preserve other results if an unexpected worker error escapes.
                except Exception as error:  # noqa: BLE001
                    results.append(
                        {
                            "participant_id": futures[future][0],
                            "ok": False,
                            "not_found": False,
                            "badges": {},
                            "unknown_badge_names": [],
                            "previous_status": futures[future][4],
                            "failure_streak": (
                                2 if futures[future][4] in {"error", "not_found"} else 1
                            ),
                            "error": f"Unexpected scrape error: {type(error).__name__}.",
                        }
                    )

            batch_ok, batch_not_found, batch_errors = result_counts(results)
            try:
                write_batch(database_url, results, args.keep_timestamps)
            except (psycopg.Error, ProfileError) as error:
                processed += len(results)
                ok_total += batch_ok
                not_found_total += batch_not_found
                errors_total += batch_errors
                print(
                    f"Progress: {processed}/{total} processed; batch write failed; "
                    f"cumulative ok={ok_total}, 404/private={not_found_total}, "
                    f"errors={errors_total}",
                    flush=True,
                )
                print_summary(processed, total, ok_total, not_found_total, errors_total)
                print(
                    f"ERROR: batch write failed ({type(error).__name__}); no snapshot written.",
                    file=sys.stderr,
                )
                return 1

            try:
                append_unknown_badges(results)
            except OSError as error:
                logger.warning(
                    "Could not save the unknown-badge report (%s).",
                    type(error).__name__,
                )

            processed += len(results)
            ok_total += batch_ok
            not_found_total += batch_not_found
            errors_total += batch_errors
            print(
                f"Progress: {processed}/{total} processed; "
                f"batch ok={batch_ok}, 404/private={batch_not_found}, errors={batch_errors}; "
                f"cumulative ok={ok_total}, 404/private={not_found_total}, "
                f"errors={errors_total}",
                flush=True,
            )

    try:
        with psycopg.connect(database_url) as connection:
            all_total, campaign_ok, all_not_found, all_errors, pending_count = (
                campaign_status_counts(connection)
            )
    except psycopg.Error as error:
        print_summary(processed, total, ok_total, not_found_total, errors_total)
        print(
            f"ERROR: could not verify final scrape status ({type(error).__name__}).",
            file=sys.stderr,
        )
        return 1

    if args.only:
        print_summary(processed, total, ok_total, not_found_total, errors_total)
        if not ok_total:
            return 1
        if not args.snapshot:
            print("Single-profile run: no snapshot written.", flush=True)
            return 0
        try:
            with psycopg.connect(database_url) as connection:
                write_snapshot(connection, datetime.now(IST).date())
        except psycopg.Error as error:
            print(
                f"ERROR: snapshot write failed ({type(error).__name__}).",
                file=sys.stderr,
            )
            return 1
        print(f"Snapshot saved for {datetime.now(IST).date().isoformat()}.", flush=True)
        if args.revalidate:
            url = os.environ.get("SNAPSHOT_REVALIDATE_URL")
            secret = os.environ.get("SNAPSHOT_REVALIDATE_SECRET")
            if not url or not secret:
                print(
                    "ERROR: SNAPSHOT_REVALIDATE_URL and SNAPSHOT_REVALIDATE_SECRET are required.",
                    file=sys.stderr,
                )
                return 1
            try:
                response = requests.post(
                    url, headers={"Authorization": f"Bearer {secret}"}, timeout=60
                )
                response.raise_for_status()
            except requests.RequestException as error:
                print(
                    f"ERROR: leaderboard refresh failed ({type(error).__name__}).",
                    file=sys.stderr,
                )
                return 1
            print("Leaderboard cache refreshed.", flush=True)
        return 0

    if args.only_pending and pending_count:
        print(
            f"Pending profiles remain: {pending_count}; no snapshot written.",
            flush=True,
        )
        print_summary(processed, total, ok_total, not_found_total, errors_total)
        return 0

    failure_rate = (all_not_found + all_errors) / all_total if all_total else 0
    if failure_rate >= 0.30:
        logger.error(
            "%d of %d profiles failed (%.1f%%); no snapshot written.",
            all_not_found + all_errors,
            all_total,
            failure_rate * 100,
        )
        print_summary(processed, total, ok_total, not_found_total, errors_total)
        print(
            f"Campaign totals: profiles={all_total}; ok={campaign_ok}; "
            f"404/private={all_not_found}; errors={all_errors}; pending={pending_count}",
            flush=True,
        )
        return 1

    if should_write_snapshot(
        only_pending=args.only_pending,
        limit=args.limit,
        pending_count=pending_count,
        failure_rate=failure_rate,
    ):
        try:
            with psycopg.connect(database_url) as connection:
                write_snapshot(connection, datetime.now(IST).date())
        except psycopg.Error as error:
            print_summary(processed, total, ok_total, not_found_total, errors_total)
            print(
                f"ERROR: snapshot write failed ({type(error).__name__}).",
                file=sys.stderr,
            )
            return 1
        logger.info("Snapshot saved for %s.", datetime.now(IST).date().isoformat())

    print_summary(processed, total, ok_total, not_found_total, errors_total)
    print(
        f"Campaign totals: profiles={all_total}; ok={campaign_ok}; "
        f"404/private={all_not_found}; errors={all_errors}; pending={pending_count}",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
