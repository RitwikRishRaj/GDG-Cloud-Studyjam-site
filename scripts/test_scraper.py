from __future__ import annotations

import unittest
from unittest.mock import patch

from scrape_profiles import (
    ProfileError,
    normalize_badge_name,
    parse_profile_badges,
    scrape_one,
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
