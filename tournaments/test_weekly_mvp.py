import json
import datetime
from django.test import TestCase, Client
from django.urls import reverse
from django.utils import timezone
from tournaments.models import Category, Team, Player, Fixture, MatchEvent, WeeklyMVP
from tournaments.services import compute_weekly_mvps, get_weekly_mvp_summary


class WeeklyMVPTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(
            key="test-league-mvp",
            label="Test League MVP Season",
            mode="league",
            format="single",
        )
        self.team_alpha = Team.objects.create(
            category=self.category,
            team_id="ALP",
            name="Alpha FC",
            color="#FF9500",
        )
        self.team_beta = Team.objects.create(
            category=self.category,
            team_id="BET",
            name="Beta United",
            color="#3B82F6",
        )

        # Player with first name
        self.player_one = Player.objects.create(
            team=self.team_alpha,
            player_id="ALP-P1",
            name="Brian Ochieng",
            first_name="Brian",
            surname="Ochieng",
            username="brian_o",
            position="ST",
        )
        # Player without first name (should show username)
        self.player_two = Player.objects.create(
            team=self.team_beta,
            player_id="BET-P1",
            name="Dennis Mwangi",
            first_name="",
            surname="Mwangi",
            username="denno99",
            position="CM",
        )

        # Fixture on Wednesday Oct 21, 2026 -> Saturday cutoff: Oct 24, 2026 20:00:00
        self.fixture_w1 = Fixture.objects.create(
            category=self.category,
            fixture_id="FX-1",
            date="Wed, 21 Oct · 17:10",
            home_team=self.team_alpha,
            away_team=self.team_beta,
            played=True,
        )
        # Goals for Brian Ochieng
        MatchEvent.objects.create(
            fixture=self.fixture_w1,
            team=self.team_alpha,
            player=self.player_one,
            event_type="goal",
            order=1,
        )
        MatchEvent.objects.create(
            fixture=self.fixture_w1,
            team=self.team_alpha,
            player=self.player_one,
            event_type="goal",
            order=2,
        )

        # CMS Admin user setup
        from django.contrib.auth import get_user_model
        from tournaments.services import create_signed_token
        User = get_user_model()
        self.admin = User.objects.create_superuser(
            username="mvp_admin",
            email="admin@ruirutitans.com",
            password="AdminPassword123!",
        )
        self.admin_token = create_signed_token(
            {"username": self.admin.username, "role": "cms"},
            salt="titans-cms-auth"
        )

    def test_compute_weekly_mvp_ended_week(self):
        # Reference date: Thursday Oct 29, 2026 (after Week 1 Saturday Oct 24 20:00:00)
        ref_dt = datetime.datetime(2026, 10, 29, 12, 0, 0, tzinfo=datetime.timezone.utc)
        summary = compute_weekly_mvps(self.category, reference_dt=ref_dt)

        self.assertIsNotNone(summary["current_mvp"])
        curr = summary["current_mvp"]
        self.assertEqual(curr["week_number"], 1)
        self.assertTrue(curr["is_finalized"])

        # Rule: stats should show first name when available
        self.assertEqual(curr["player"]["displayName"], "Brian")
        self.assertEqual(curr["player"]["first_name"], "Brian")
        self.assertEqual(curr["stats"]["goals"], 2)
        self.assertEqual(curr["stats"]["points"], 8.0) # 2 goals * 4.0

    def test_player_without_first_name_shows_username(self):
        # Create fixture in week 2 where Dennis Mwangi (username denno99) scores 3 goals
        fixture_w2 = Fixture.objects.create(
            category=self.category,
            fixture_id="FX-2",
            date="Wed, 28 Oct · 17:10",
            home_team=self.team_beta,
            away_team=self.team_alpha,
            played=True,
        )
        for i in range(3):
            MatchEvent.objects.create(
                fixture=fixture_w2,
                team=self.team_beta,
                player=self.player_two,
                event_type="goal",
                order=i,
            )

        # As of Sunday Nov 1, 2026 (after Week 2 Saturday Oct 31 20:00:00)
        ref_dt = datetime.datetime(2026, 11, 1, 12, 0, 0, tzinfo=datetime.timezone.utc)
        summary = compute_weekly_mvps(self.category, reference_dt=ref_dt)
        w2_mvp = next(h for h in summary["history"] if h["week_number"] == 2)

        # Rule: when first name not available, show username
        self.assertEqual(w2_mvp["player"]["displayName"], "denno99")
        self.assertTrue(w2_mvp["is_finalized"])
        self.assertEqual(w2_mvp["stats"]["goals"], 3)

    def test_api_weekly_mvp_get(self):
        url = reverse("tournaments:api_category_weekly_mvp", kwargs={"key": self.category.key})
        client = Client()
        res = client.get(url)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["category_key"], self.category.key)
        self.assertIn("next_update", data)
        self.assertIn("history", data)
        self.assertIn("current_mvp", data)

    def test_api_weekly_mvp_post_admin(self):
        url = reverse("tournaments:api_category_weekly_mvp", kwargs={"key": self.category.key})
        client = Client()
        res = client.post(
            url,
            data=json.dumps({"force": True}),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.admin_token,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])

    def test_unstarted_week_indicates_to_be_announced(self):
        # Fixture scheduled in Week 3 (Nov 4) with NO played status and NO events
        fixture_w3 = Fixture.objects.create(
            category=self.category,
            fixture_id="FX-3",
            date="Wed, 04 Nov · 17:10",
            home_team=self.team_alpha,
            away_team=self.team_beta,
            played=False,
        )
        ref_dt = datetime.datetime(2026, 10, 29, 12, 0, 0, tzinfo=datetime.timezone.utc)
        summary = compute_weekly_mvps(self.category, reference_dt=ref_dt)

        w3_record = next(h for h in summary["history"] if h["week_number"] == 2)
        # Week that has not yet started MUST NOT indicate any player
        self.assertIsNone(w3_record["player"])
        self.assertIsNone(w3_record["stats"])
        self.assertFalse(w3_record["is_started"])
        self.assertFalse(w3_record["is_finalized"])
        self.assertIn("not yet started", w3_record["rationale"].lower())
        self.assertIn("announced", w3_record["rationale"].lower())
