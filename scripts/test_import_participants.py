from __future__ import annotations

import csv
import io
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import MagicMock

from import_participants import ParticipantRow, read_rows, upsert_participants


class ParticipantImportTests(unittest.TestCase):
    def test_parser_redacts_identifiers_and_lists_invalid_profile_rows(self) -> None:
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
                "User Name": "Duplicate Email Student",
                "User Email": "student@example.invalid",
                "Google Skills Profile URL": "https://www.skills.google/public_profiles/11111111-1111-4111-8111-111111111111",
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
            {
                "User Name": "Missing URL Student",
                "User Email": "missing@example.invalid",
                "Google Skills Profile URL": "",
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
        self.assertEqual(parsed[0].badge_count, 4)
        self.assertEqual((invalid, duplicate), (2, 1))
        self.assertEqual(
            output.getvalue().splitlines(),
            [
                "row 3: duplicate profile URL; skipped",
                "row 4: duplicate email; skipped",
                "row 5: malformed profile URL; skipped",
                "row 6: missing profile URL; skipped",
            ],
        )
        for private_value in (
            "cfb458be-edc6-41c6-a14a-dfd27319c418",
            "11111111-1111-4111-8111-111111111111",
            "student@example.invalid",
            "https://www.skills.google/public_profiles/",
            "https://example.invalid/not-a-profile",
        ):
            self.assertNotIn(private_value, output.getvalue())

    def test_batch_upsert_uses_one_profile_id_conflict_statement(self) -> None:
        connection = MagicMock()
        rows = [
            ParticipantRow(
                2,
                "Student One",
                "one@example.invalid",
                "11111111-1111-4111-8111-111111111111",
                "https://www.skills.google/public_profiles/11111111-1111-4111-8111-111111111111",
                "Public",
                3,
            ),
            ParticipantRow(
                3,
                "Student Two",
                "two@example.invalid",
                "22222222-2222-4222-8222-222222222222",
                "https://www.skills.google/public_profiles/22222222-2222-4222-8222-222222222222",
                "Public",
                5,
            ),
        ]

        upsert_participants(connection, rows)

        cursor = connection.cursor.return_value.__enter__.return_value
        cursor.execute.assert_called_once()
        query, params = cursor.execute.call_args.args
        self.assertIn("INSERT INTO public.participants", query)
        self.assertIn("ON CONFLICT (profile_id) DO UPDATE", query)
        self.assertNotIn("public.completions", query)
        self.assertEqual(query.count("(%s, %s, %s, %s, %s, %s, %s)"), 2)
        self.assertEqual(len(params), 14)


if __name__ == "__main__":
    unittest.main()
