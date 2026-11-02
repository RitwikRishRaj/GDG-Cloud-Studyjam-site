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

from urllib.parse import urlparse
from uuid import UUID
from zoneinfo import ZoneInfo

import psycopg
import requests
from requests.adapters import HTTPAdapter
from selectolax.parser import HTMLParser
from urllib3.util.retry import Retry
from local_env import load_local_environment

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


def normalize_badge_name(name: str) -> str:
    tokens = re.findall(r"[a-z0-9]+", name.lower())
    return " ".join("ai" if token == "al" else token for token in tokens)


CURRICULUM_BY_NAME = {normalize_badge_name(name): name for name in CURRICULUM}


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


def scrape_one(participant: tuple[str, str, str, int]) -> dict[str, object]:
    participant_id, profile_id, raw_url, existing_count = participant
    try:
        url = validate_profile_url(raw_url, profile_id)
        time.sleep(random.uniform(0.2, 0.7))
        response = session_for_thread().get(url, timeout=(10, 30))
        if response.status_code == 404:
            raise ProfileNotFound("HTTP 404: profile not found or private.")
        if not response.ok:
            raise ProfileError(f"HTTP {response.status_code} while fetching profile.")

        badges, unknown = parse_profile_badges(response.text)
        for name in unknown:
            logging.warning("Unknown badge name ignored: %s", name)
        if not badges and existing_count > 0:
            raise ProfileError(
                "Profile parsed with zero curriculum badges; preserving previous completions."
            )
        return {
            "participant_id": participant_id,
            "ok": True,
            "badges": badges,
            "error": None,
        }
    except requests.RequestException as error:
        return {
            "participant_id": participant_id,
            "ok": False,
            "not_found": False,
            "badges": {},
            "error": f"Fetch failed after retries: {type(error).__name__}.",
        }
    except ProfileNotFound as error:
        return {
            "participant_id": participant_id,
            "ok": False,
            "not_found": True,
            "badges": {},
            "error": str(error),
        }
    except ProfileError as error:
        return {
            "participant_id": participant_id,
            "ok": False,
            "not_found": False,
            "badges": {},
            "error": str(error),
        }
    except Exception as error:
        return {
            "participant_id": participant_id,
            "ok": False,
            "not_found": False,
            "badges": {},
            "error": f"Unexpected scrape error: {type(error).__name__}.",
        }


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


def load_participants(connection: psycopg.Connection) -> list[tuple[str, str, str, int]]:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT p.id::text, p.profile_id::text, p.profile_url,
              count(c.badge_id) FILTER (
                WHERE c.earned_on >= %s AND c.earned_on <= %s
                  AND b.norm_name = ANY(%s)
              )::integer AS existing_count
            FROM public.participants AS p
            LEFT JOIN public.completions AS c ON c.participant_id = p.id
            LEFT JOIN public.badges AS b ON b.id = c.badge_id
            WHERE p.profile_id IS NOT NULL
            GROUP BY p.id
            ORDER BY p.id
            """,
            (CAMPAIGN_START, EASTERN_DEADLINE_DATE, list(CURRICULUM_BY_NAME)),
        )
        rows = cursor.fetchall()
    return [
        (participant_id, profile_id, profile_url or "", existing_count)
        for participant_id, profile_id, profile_url, existing_count in rows
    ]


def save_result(connection: psycopg.Connection, result: dict[str, object]) -> None:
    participant_id = str(result["participant_id"])
    with connection.transaction():
        with connection.cursor() as cursor:
            if not result["ok"]:
                status = "not_found" if result.get("not_found") else "error"
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
                SET scrape_status = 'success', last_scraped_at = now(), last_error = NULL,
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
                    updated_at = now()
                WHERE p.id = %s
                """,
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
    with connection.transaction():
        with connection.cursor() as cursor:
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
                  WHERE c.earned_on >= %s AND c.earned_on <= %s
                    AND b.norm_name = ANY(%s)
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
                (CAMPAIGN_START, EASTERN_DEADLINE_DATE, curriculum_names, snap_date),
            )


def write_batch(database_url: str, results: list[dict[str, object]]) -> None:
    for retry in range(MAX_DB_RETRIES + 1):
        try:
            with psycopg.connect(database_url) as connection:
                with connection.transaction():
                    for result in results:
                        save_result(connection, result)
            return
        except (psycopg.OperationalError, psycopg.InterfaceError):
            if retry == MAX_DB_RETRIES:
                raise
            logging.warning(
                "Database connection failed while saving a batch; retry %d of %d.",
                retry + 1,
                MAX_DB_RETRIES,
            )
            time.sleep(0.5 * (retry + 1))


def result_counts(results: list[dict[str, object]]) -> tuple[int, int, int]:
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
        "--limit",
        type=int,
        metavar="N",
        help="scrape only the first N participants without writing a snapshot",
    )
    args = parser.parse_args()
    if args.limit is not None and args.limit < 1:
        parser.error("--limit must be a positive integer.")
    if args.dump:
        if args.limit is not None:
            parser.error("--limit cannot be used with --dump.")
        return dump_profile(args.dump)

    load_local_environment()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        parser.error("DATABASE_URL is required for a database scrape.")

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    today_ist = datetime.now(IST).date()
    try:
        with psycopg.connect(database_url) as connection:
            if today_ist > EASTERN_DEADLINE_DATE:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT EXISTS (SELECT 1 FROM public.snapshots WHERE snap_date > %s)",
                        (EASTERN_DEADLINE_DATE,),
                    )
                    final_snapshot_exists = cursor.fetchone()[0]
                if final_snapshot_exists:
                    print("Final campaign snapshot already exists; board data is frozen.")
                    return 0

            participants = load_participants(connection)
    except psycopg.Error as error:
        print(
            f"ERROR: could not load participants ({type(error).__name__}).",
            file=sys.stderr,
        )
        return 1

    if args.limit is not None:
        participants = participants[: args.limit]

    total = len(participants)
    processed = ok_total = not_found_total = errors_total = 0
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        for start in range(0, total, BATCH_SIZE):
            batch = participants[start : start + BATCH_SIZE]
            futures = {executor.submit(scrape_one, participant): participant for participant in batch}
            results = []
            for future in as_completed(futures):
                try:
                    results.append(future.result())
                except Exception as error:
                    results.append(
                        {
                            "participant_id": futures[future][0],
                            "ok": False,
                            "not_found": False,
                            "badges": {},
                            "error": f"Unexpected scrape error: {type(error).__name__}.",
                        }
                    )

            batch_ok, batch_not_found, batch_errors = result_counts(results)
            try:
                write_batch(database_url, results)
            except Exception as error:
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

    failure_rate = (not_found_total + errors_total) / total if total else 0
    if failure_rate > 0.30:
        logging.error(
            "%d of %d profiles failed (%.1f%%); no snapshot written.",
            not_found_total + errors_total,
            total,
            failure_rate * 100,
        )
        print_summary(processed, total, ok_total, not_found_total, errors_total)
        return 1

    if args.limit is None:
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
        logging.info("Snapshot saved for %s.", datetime.now(IST).date().isoformat())

    print_summary(processed, total, ok_total, not_found_total, errors_total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
