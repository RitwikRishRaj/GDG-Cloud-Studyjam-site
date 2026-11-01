from __future__ import annotations

import csv
import io
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path

from import_participants import read_rows


class ParticipantImportTests(unittest.TestCase):
    def test_extra_columns_are_ignored_and_bad_or_duplicate_urls_are_reported(self) -> None:
        rows = [
            {
                "User Name": "Example Student",
                "User Email": "student@example.invalid",
                "Google Skills Profile URL": "https://www.skills.google/public_profiles/cfb458be-edc6-41c6-a14a-dfd27319c418",
                "Google Skills Profile Status": "Public",
                "Skill Badges Completed Count": "4",
                "Ignored Column": "ignored",
            },
            {
                "User Name": "Duplicate Student",
                "User Email": "other@example.invalid",
                "Google Skills Profile URL": "https://www.skills.google/public_profiles/cfb458be-edc6-41c6-a14a-dfd27319c418",
                "Google Skills Profile Status": "Public",
                "Skill Badges Completed Count": "3",
                "Ignored Column": "ignored",
            },
            {
                "User Name": "Invalid Student",
                "User Email": "invalid@example.invalid",
                "Google Skills Profile URL": "https://example.invalid/not-a-profile",
                "Google Skills Profile Status": "Private",
                "Skill Badges Completed Count": "0",
                "Ignored Column": "ignored",
            },
        ]
        output = io.StringIO()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "participants.csv"
            with path.open("w", encoding="utf-8", newline="") as target:
                writer = csv.DictWriter(target, fieldnames=rows[0].keys())
                writer.writeheader()
                writer.writerows(rows)
            with redirect_stderr(output):
                parsed, invalid, duplicate = read_rows(path)

        self.assertEqual(len(parsed), 1)
        self.assertEqual(parsed[0].profile_id, "cfb458be-edc6-41c6-a14a-dfd27319c418")
        self.assertEqual(parsed[0].badge_count, 4)
        self.assertEqual((invalid, duplicate), (1, 1))
        self.assertIn("invalid profile URL", output.getvalue())
        self.assertIn("duplicate profile URL", output.getvalue())


if __name__ == "__main__":
    unittest.main()
