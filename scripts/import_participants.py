#!/usr/bin/env python3
"""Import the five approved participant columns from a CSV file."""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse
from uuid import UUID

import psycopg
from local_env import load_local_environment

PROFILE_PATH = re.compile(r"^/public_profiles/([0-9a-fA-F-]{36})/?$")


@dataclass(frozen=True)
class ParticipantRow:
    line: int
    name: str
    email: str
    profile_id: str
    profile_url: str
    sheet_status: str
    badge_count: int


def extract_profile(row_url: str) -> tuple[str, str]:
    parsed = urlparse(row_url.strip())
    match = PROFILE_PATH.fullmatch(parsed.path.rstrip("/") if parsed.path != "/" else parsed.path)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in {"skills.google", "www.skills.google"}
        or match is None
    ):
        raise ValueError("not a public Google Skills profile URL")
    try:
        profile_id = str(UUID(match.group(1)))
    except ValueError as error:
        raise ValueError("profile URL does not contain a valid UUID") from error
    return profile_id, f"https://www.skills.google/public_profiles/{profile_id}"


def parse_badge_count(raw_value: str) -> int:
    value = raw_value.strip().replace(",", "")
    if not value:
        return 0
    if not re.fullmatch(r"\d+", value):
        raise ValueError("badge count must be a non-negative integer")
    return int(value)


def read_rows(csv_path: Path) -> tuple[list[ParticipantRow], int, int]:
    required = {
        "User Name",
        "User Email",
        "Google Skills Profile URL",
        "Google Skills Profile Status",
        "Skill Badges Completed Count",
    }
    rows: list[ParticipantRow] = []
    invalid_urls = 0
    duplicate_urls = 0
    seen_profiles: dict[str, int] = {}
    seen_emails: dict[str, int] = {}

    with csv_path.open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise ValueError(f"CSV is missing required columns: {', '.join(sorted(missing))}")

        for line, raw in enumerate(reader, start=2):
            url = (raw.get("Google Skills Profile URL") or "").strip()
            try:
                profile_id, profile_url = extract_profile(url)
            except ValueError as error:
                invalid_urls += 1
                print(f"row {line}: invalid profile URL {url!r} ({error})", file=sys.stderr)
                continue

            if profile_id in seen_profiles:
                duplicate_urls += 1
                print(
                    f"row {line}: duplicate profile URL {url!r} "
                    f"(first seen on row {seen_profiles[profile_id]}); skipped",
                    file=sys.stderr,
                )
                continue

            name = (raw.get("User Name") or "").strip()
            email = (raw.get("User Email") or "").strip().lower()
            if not name or not email:
                print(f"row {line}: missing name or email; skipped", file=sys.stderr)
                continue
            if email in seen_emails:
                print(
                    f"row {line}: duplicate email matches row {seen_emails[email]}; skipped",
                    file=sys.stderr,
                )
                continue

            try:
                badge_count = parse_badge_count(
                    raw.get("Skill Badges Completed Count") or ""
                )
            except ValueError as error:
                print(f"row {line}: {error}; skipped", file=sys.stderr)
                continue

            seen_profiles[profile_id] = line
            seen_emails[email] = line
            rows.append(
                ParticipantRow(
                    line=line,
                    name=name,
                    email=email,
                    profile_id=profile_id,
                    profile_url=profile_url,
                    sheet_status=(raw.get("Google Skills Profile Status") or "").strip(),
                    badge_count=badge_count,
                )
            )

    return rows, invalid_urls, duplicate_urls


def upsert_participant(connection: psycopg.Connection, row: ParticipantRow) -> str:
    profile_uuid = UUID(row.profile_id)
    with connection.cursor() as cursor:
        cursor.execute(
            """
            SELECT id, profile_id
            FROM public.participants
            WHERE profile_id = %s OR email = %s
            FOR UPDATE
            """,
            (profile_uuid, row.email),
        )
        matches = cursor.fetchall()
        by_profile = next((item for item in matches if item[1] == profile_uuid), None)
        by_email = next((item for item in matches if item[0] != (by_profile[0] if by_profile else None)), None)

        values = (
            row.name,
            row.email,
            profile_uuid,
            row.profile_url,
            row.sheet_status,
            row.badge_count,
            row.badge_count,
        )
        if by_profile:
            cursor.execute(
                """
                UPDATE public.participants
                SET name = %s, email = %s, profile_id = %s, profile_url = %s,
                    sheet_status = %s, sheet_badge_count = %s, badge_count = %s,
                    updated_at = now()
                WHERE id = %s
                """,
                (*values, by_profile[0]),
            )
            return "updated"

        if by_email:
            if by_email[1] is not None:
                raise ValueError("email is already attached to a different profile UUID")
            cursor.execute(
                """
                UPDATE public.participants
                SET name = %s, email = %s, profile_id = %s, profile_url = %s,
                    sheet_status = %s, sheet_badge_count = %s, badge_count = %s,
                    updated_at = now()
                WHERE id = %s
                """,
                (*values, by_email[0]),
            )
            return "updated"

        cursor.execute(
            """
            INSERT INTO public.participants (
              name, email, profile_id, profile_url, sheet_status,
              sheet_badge_count, badge_count
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
            """,
            values,
        )
        return "inserted"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--csv", required=True, type=Path, help="path to the participant CSV")
    args = parser.parse_args()

    try:
        rows, invalid_urls, duplicate_urls = read_rows(args.csv)
    except (OSError, ValueError, csv.Error) as error:
        parser.error(str(error))

    load_local_environment()
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        parser.error("DATABASE_URL is required for a participant import.")

    inserted = updated = conflicts = 0
    with psycopg.connect(database_url) as connection:
        for row in rows:
            try:
                with connection.transaction():
                    result = upsert_participant(connection, row)
                if result == "inserted":
                    inserted += 1
                else:
                    updated += 1
            except psycopg.IntegrityError:
                conflicts += 1
                print(f"row {row.line}: database uniqueness conflict; skipped", file=sys.stderr)
            except ValueError as error:
                conflicts += 1
                print(f"row {row.line}: import conflict ({error}); skipped", file=sys.stderr)

    print(
        f"Imported {inserted + updated} of {len(rows)} valid rows "
        f"({inserted} inserted, {updated} updated, {conflicts} conflicts)."
    )
    print(f"Invalid profile URLs: {invalid_urls}; duplicate profile URLs: {duplicate_urls}.")
    return 1 if conflicts else 0


if __name__ == "__main__":
    raise SystemExit(main())
