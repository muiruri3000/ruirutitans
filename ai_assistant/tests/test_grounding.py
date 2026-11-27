"""Unit tests for factual grounding verification."""

from django.test import TestCase
from ai_assistant.sanitization import verify_factual_grounding


class FactualGroundingTestCase(TestCase):
    def test_direct_answer_without_tools(self):
        text = "Hello! I am your Ruiru Titans football assistant. How can I assist you today?"
        is_ok, status, unverified = verify_factual_grounding(text, [])
        self.assertTrue(is_ok)
        self.assertEqual(status, "direct")
        self.assertEqual(unverified, [])

    def test_hallucinated_score_without_tools_flagged(self):
        text = "Titans Red beat Titans Blue 4-2 in the championship match."
        is_ok, status, unverified = verify_factual_grounding(text, [])
        self.assertFalse(is_ok)
        self.assertEqual(status, "unverified_claim")
        self.assertIn("4-2", unverified)

    def test_verified_score_with_tool_payload_passes(self):
        payload = {
            "category_key": "senior_league",
            "fixtures": [
                {
                    "home_team": "Titans Red",
                    "away_team": "Titans Blue",
                    "home_score": 3,
                    "away_score": 1,
                }
            ],
        }
        text = "Titans Red secured a 3-1 victory over Titans Blue."
        is_ok, status, unverified = verify_factual_grounding(text, [payload])
        self.assertTrue(is_ok)
        self.assertEqual(status, "grounded")
        self.assertEqual(unverified, [])

    def test_unverified_points_claim_detected(self):
        payload = {
            "standings": [
                {"team_name": "Titans Red", "points": 18, "goals_for": 12}
            ]
        }
        text = "Titans Red have accumulated 99 points and 12 goals so far."
        is_ok, status, unverified = verify_factual_grounding(text, [payload])
        self.assertFalse(is_ok)
        self.assertEqual(status, "unverified_claim")
        self.assertTrue(any("99" in u for u in unverified))
