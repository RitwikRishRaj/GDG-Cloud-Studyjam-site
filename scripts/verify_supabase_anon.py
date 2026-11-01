#!/usr/bin/env python3
"""Check Supabase REST access with the public anon key, without printing it."""

from __future__ import annotations

import os
import sys

import requests
from local_env import load_local_environment

BASE_TABLES = ("participants", "badges", "completions", "snapshots", "sync_logs", "settings")
PUBLIC_COLUMNS = {
    "milestone_board": {
        "rank",
        "name",
        "badge_count",
        "highest_milestone",
        "milestone_reached_on",
    },
    "milestone_stats": {
        "total_participants",
        "milestone_1_count",
        "milestone_2_count",
        "milestone_3_count",
        "last_updated",
    },
}
FORBIDDEN_COLUMNS = {"email", "profile_id", "profile_url", "id", "last_error"}



def main() -> int:
    load_local_environment()
    project_url = (
        os.environ.get("SUPABASE_URL")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
        or ""
    ).rstrip("/")
    anon_key = (
        os.environ.get("SUPABASE_ANON_KEY")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
        or ""
    )
    publishable_key = (
        os.environ.get("SUPABASE_PUBLISHABLE_KEY")
        or os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
        or ""
    )
    if not project_url or not (anon_key or publishable_key):
        print("Set the Supabase URL and public anon/publishable key in .env.local to run this check.", file=sys.stderr)
        return 2

    rest_url = f"{project_url}/rest/v1"
    public_key = anon_key or publishable_key
    headers = {"apikey": public_key}
    if anon_key:
        headers["Authorization"] = f"Bearer {anon_key}"
    failed = False

    for table in BASE_TABLES:
        response = requests.get(
            f"{rest_url}/{table}",
            headers=headers,
            params={"select": "*", "limit": "0"},
            timeout=20,
        )
        if response.status_code in {401, 403}:
            print(f"PASS: anon is denied base table {table} (HTTP {response.status_code}).")
        elif response.status_code == 404:
            print(f"INCONCLUSIVE: base table {table} is not in the REST schema cache (HTTP 404).")
            failed = True
        else:
            print(f"FAIL: unexpected base table response for {table} (HTTP {response.status_code}).")
            failed = True

    for view, allowed in PUBLIC_COLUMNS.items():
        response = requests.get(
            f"{rest_url}/{view}",
            headers=headers,
            params={"select": "*", "limit": "1"},
            timeout=20,
        )
        if not 200 <= response.status_code < 300:
            print(f"FAIL: anon cannot read public view {view} (HTTP {response.status_code}).")
            failed = True
            continue
        try:
            data = response.json()
        except ValueError:
            print(f"FAIL: public view {view} did not return JSON.")
            failed = True
            continue
        keys = set(data[0]) if isinstance(data, list) and data else set()
        if keys & FORBIDDEN_COLUMNS or (keys and not keys <= allowed):
            print(f"FAIL: public view {view} returned unexpected columns: {', '.join(sorted(keys))}.")
            failed = True
        else:
            print(f"PASS: anon can read the safe public view {view}.")

    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
