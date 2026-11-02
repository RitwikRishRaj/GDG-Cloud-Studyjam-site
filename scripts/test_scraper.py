from __future__ import annotations

import unittest
from datetime import date
from unittest.mock import MagicMock, patch

import psycopg

from scrape_profiles import (
    CAMPAIGN_START,
    EASTERN_DEADLINE_DATE,
    ProfileError,
    normalize_badge_name,
    parse_profile_badges,
    result_counts,
    save_result,
    scrape_one,
    write_batch,
)


class ProfileParserTests(unittest.TestCase):
    def test_normalizes_al_typo_and_keeps_earliest_duplicate_date(self) -> None:
        html = """
        <div class="profile-badge">
          <span class="ql-title-medium l-mts">Develop Al-Powered Prototypes in Google AI Studio</span>
          <span class="ql-body-medium l-mbs">Earned Oct 26, 2026 EDT</span>
        </div>
        <div class="profile-badge">
          <span class="ql-title-medium l-mts">Develop AI-Powered Prototypes in Google AI Studio</span>
          <span class="ql-body-medium l-mbs">Earned Oct 24, 2026 EDT</span>
        </div>
        <div class="profile-badge">
          <span class="ql-title-medium l-mts">Unlisted practice badge</span>
          <span class="ql-body-medium l-mbs">Earned Oct 22, 2026 EDT</span>
        </div>
        """
        badges, unknown = parse_profile_badges(html)
        normalized = normalize_badge_name("Develop AI-Powered Prototypes in Google AI Studio")
        self.assertEqual(len(badges), 1)
        self.assertEqual(badges[normalized][1].isoformat(), "2026-10-24")
        self.assertEqual(unknown, ["Unlisted practice badge"])

    def test_missing_earned_date_is_a_parse_error(self) -> None:
        html = """
        <div class="profile-badge">
          <span class="ql-title-medium l-mts">The Basics of Google Cloud Compute</span>
          <span class="ql-body-medium l-mbs">Awarded this year</span>
        </div>
        """
        with self.assertRaises(ProfileError):
            parse_profile_badges(html)


class ScrapeSafetyTests(unittest.TestCase):
    def test_result_counts_separate_success_not_found_and_errors(self) -> None:
        results = [
            {"ok": True},
            {"ok": False, "not_found": True},
            {"ok": False, "not_found": False},
        ]

        self.assertEqual(result_counts(results), (1, 1, 1))

    def test_write_batch_retries_three_times_with_fresh_connections(self) -> None:
        connection = MagicMock()
        result = {"participant_id": "participant-id", "ok": False, "not_found": True}
        with (
            patch(
                "scrape_profiles.psycopg.connect",
                side_effect=[
                    psycopg.OperationalError(),
                    psycopg.OperationalError(),
                    psycopg.OperationalError(),
                    connection,
                ],
            ) as connect,
            patch("scrape_profiles.save_result") as save,
            patch("scrape_profiles.time.sleep") as sleep,
            patch("scrape_profiles.logging.warning"),
        ):
            write_batch("configured-db", [result])

        self.assertEqual(connect.call_count, 4)
        self.assertEqual(sleep.call_count, 3)
        save.assert_called_once_with(
            connection.__enter__.return_value,
            result,
        )
        connection.__enter__.return_value.transaction.assert_called_once()

    def test_write_batch_stops_after_three_retries(self) -> None:
        with (
            patch(
                "scrape_profiles.psycopg.connect",
                side_effect=psycopg.OperationalError(),
            ) as connect,
            patch("scrape_profiles.time.sleep"),
            patch("scrape_profiles.logging.warning"),
        ):
            with self.assertRaises(psycopg.OperationalError):
                write_batch("configured-db", [])

        self.assertEqual(connect.call_count, 4)

    def test_prestart_badge_is_stored_but_not_counted(self) -> None:
        connection = MagicMock()
        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.rowcount = 1
        prestart_date = date(2026, 9, 13)

        save_result(
            connection,
            {
                "participant_id": "participant-id",
                "ok": True,
                "badges": {
                    "the basics of google cloud compute": (
                        "The Basics of Google Cloud Compute",
                        prestart_date,
                    )
                },
            },
        )

        insert_sql, insert_params = cursor.execute.call_args_list[0].args
        aggregate_sql, aggregate_params = cursor.execute.call_args_list[1].args
        self.assertIn("INSERT INTO public.completions", insert_sql)
        self.assertEqual(insert_params[1], prestart_date)
        self.assertEqual(aggregate_sql.count("c.earned_on >= %s"), 3)
        self.assertEqual(aggregate_params[0], CAMPAIGN_START)
        self.assertEqual(aggregate_params[1], EASTERN_DEADLINE_DATE)
        self.assertEqual(aggregate_params[3], CAMPAIGN_START)
        self.assertEqual(aggregate_params[4], EASTERN_DEADLINE_DATE)
        self.assertEqual(aggregate_params[6], CAMPAIGN_START)
        self.assertEqual(aggregate_params[7], EASTERN_DEADLINE_DATE)

    def test_zero_badge_parse_preserves_existing_completions(self) -> None:
        response = type("Response", (), {"status_code": 200, "ok": True, "text": "<html></html>"})()
        with patch("scrape_profiles.time.sleep"), patch("scrape_profiles.session_for_thread") as session:
            session.return_value.get.return_value = response
            result = scrape_one((
                "participant-id",
                "cfb458be-edc6-41c6-a14a-dfd27319c418",
                "https://www.skills.google/public_profiles/cfb458be-edc6-41c6-a14a-dfd27319c418",
                3,
            ))
        self.assertFalse(result["ok"])
        self.assertIn("preserving previous completions", str(result["error"]))

    def test_404_is_flagged_as_not_found(self) -> None:
        response = type("Response", (), {"status_code": 404, "ok": False, "text": ""})()
        with patch("scrape_profiles.time.sleep"), patch("scrape_profiles.session_for_thread") as session:
            session.return_value.get.return_value = response
            result = scrape_one((
                "participant-id",
                "cfb458be-edc6-41c6-a14a-dfd27319c418",
                "https://www.skills.google/public_profiles/cfb458be-edc6-41c6-a14a-dfd27319c418",
                0,
            ))
        self.assertFalse(result["ok"])
        self.assertTrue(result["not_found"])


if __name__ == "__main__":
    unittest.main()
