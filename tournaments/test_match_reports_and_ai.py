import json
from django.test import TestCase, Client
from django.contrib.auth.models import User
from django.urls import reverse
from tournaments.models import Category, Team, Player, Fixture, MatchEvent
from tournaments.services import create_signed_token
from tournaments.ai_report import compile_matchweek_json, generate_ai_matchweek_analysis


class MatchReportAndAIReportTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin = User.objects.create_superuser(
            username="admin_reporter",
            email="admin@ruirutitans.com",
            password="SecurePassword123!",
        )
        self.admin_token = create_signed_token(
            {"username": self.admin.username, "role": "cms"},
            salt="titans-cms-auth"
        )

        self.category = Category.objects.create(
            key="match-reports-league",
            label="Match Reports League",
            mode="league",
            format="double",
        )

        self.team_a = Team.objects.create(
            category=self.category,
            team_id="T_A",
            name="Team Alpha",
            color="#C9A227",
        )
        self.player_a = Player.objects.create(
            team=self.team_a,
            player_id="P1",
            name="Alice Striker",
            position="ST",
        )

        self.team_b = Team.objects.create(
            category=self.category,
            team_id="T_B",
            name="Team Beta",
            color="#1E4636",
        )
        self.player_b = Player.objects.create(
            team=self.team_b,
            player_id="P2",
            name="Bob Defender",
            position="CB",
        )

        self.fixture = Fixture.objects.create(
            category=self.category,
            fixture_id="F_TEST_1",
            home_team=self.team_a,
            away_team=self.team_b,
            date="Wed, 21 Oct · 17:10",
            referee="Ref Joseph",
            played=True,
            report={},
        )

        MatchEvent.objects.create(
            fixture=self.fixture,
            team=self.team_a,
            player=self.player_a,
            event_type="goal",
            minute=14,
            order=1,
        )
        MatchEvent.objects.create(
            fixture=self.fixture,
            team=self.team_a,
            player=self.player_a,
            event_type="goal",
            minute=55,
            order=2,
        )
        MatchEvent.objects.create(
            fixture=self.fixture,
            team=self.team_b,
            player=self.player_b,
            event_type="goal",
            minute=70,
            order=3,
        )
        MatchEvent.objects.create(
            fixture=self.fixture,
            team=self.team_a,
            player=self.player_a,
            event_type="goal",
            minute=88,
            order=4,
        )

    def test_fixture_report_public_get(self):
        url = reverse("tournaments:api_category_fixture_report", kwargs={
            "key": self.category.key,
            "fixture_id": self.fixture.fixture_id,
        })
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["fixture_id"], self.fixture.fixture_id)
        self.assertEqual(data["played"], True)
        self.assertIsInstance(data["report"], dict)

    def test_fixture_report_post_requires_auth(self):
        client = Client()
        url = reverse("tournaments:api_category_fixture_report", kwargs={
            "key": self.category.key,
            "fixture_id": self.fixture.fixture_id,
        })
        res = client.post(
            url,
            data=json.dumps({"title": "Unauthenticated Post", "content": "Should fail"}),
            content_type="application/json",
        )
        self.assertIn(res.status_code, (401, 403))

    def test_fixture_report_post_as_admin_saves_successfully(self):
        url = reverse("tournaments:api_category_fixture_report", kwargs={
            "key": self.category.key,
            "fixture_id": self.fixture.fixture_id,
        })
        payload = {
            "title": "Hat-trick Heroics by Alice Striker",
            "content": "A sensational attacking masterclass delivered three points for Team Alpha.",
            "motm": "Alice Striker",
            "motm_team": "Team Alpha",
            "tactical_notes": "Aggressive counter-pressing in transition forced defensive errors.",
            "attendance": "180 supporters",
            "weather": "Cool evening, dry turf",
        }
        res = self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.admin_token,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["report"]["title"], payload["title"])
        self.assertEqual(data["report"]["motm"], "Alice Striker")

        # Verify DB persistence
        self.fixture.refresh_from_db()
        self.assertEqual(self.fixture.report["title"], payload["title"])
        self.assertEqual(self.fixture.report["content"], payload["content"])
        self.assertEqual(self.fixture.report["author"], self.admin.username)

    def test_fixture_report_delete_as_admin_removes_report(self):
        url = reverse("tournaments:api_category_fixture_report", kwargs={
            "key": self.category.key,
            "fixture_id": self.fixture.fixture_id,
        })
        # Set a report first
        self.fixture.report = {"title": "To be deleted", "content": "Sample content"}
        self.fixture.save()

        res = self.client.delete(url, HTTP_X_TITANS_CMS_TOKEN=self.admin_token)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertEqual(data["report"], {})

        self.fixture.refresh_from_db()
        self.assertEqual(self.fixture.report, {})

    def test_compile_matchweek_json(self):
        json_data = compile_matchweek_json(self.category)
        self.assertEqual(json_data["competition"]["key"], self.category.key)
        self.assertEqual(json_data["total_fixtures"], 1)
        self.assertEqual(json_data["completed_fixtures"], 1)
        self.assertEqual(json_data["total_goals"], 4)
        self.assertEqual(len(json_data["matches"]), 1)
        match = json_data["matches"][0]
        self.assertEqual(match["fixture_id"], self.fixture.fixture_id)
        self.assertEqual(match["home_score"], 3)
        self.assertEqual(match["away_score"], 1)
        # Verify official rosters are included
        self.assertIn("official_squad_rosters", json_data)
        self.assertIn("all_verified_player_names", json_data)
        self.assertIn("Alice Striker", json_data["all_verified_player_names"])
        self.assertIn("Bob Defender", json_data["all_verified_player_names"])

    def test_ai_analysis_strictly_uses_real_player_names(self):
        json_data = compile_matchweek_json(self.category)
        analysis = generate_ai_matchweek_analysis(json_data)

        # MVP must be a real player from the rosters (Alice Striker scored a hat-trick)
        self.assertEqual(analysis["mvp_of_the_week"]["name"], "Alice Striker")
        self.assertEqual(analysis["mvp_of_the_week"]["team"], "Team Alpha")
        self.assertIn("Alice Striker", json_data["all_verified_player_names"])

        # Never imaginary names or "Standout Performer"
        self.assertNotEqual(analysis["mvp_of_the_week"]["name"], "Standout Performer")
        self.assertNotIn("Standout Performer", json_data["all_verified_player_names"])

        # Test unplayed week (no goals scored): MVP must still be a real registered player
        unplayed_category = Category.objects.create(
            key="unplayed-cat",
            label="Unplayed Category",
            mode="league",
        )
        t_unplayed = Team.objects.create(category=unplayed_category, team_id="TU", name="Titans United")
        p_real = Player.objects.create(team=t_unplayed, player_id="PU1", name="Real Player One")
        unplayed_json = compile_matchweek_json(unplayed_category)
        unplayed_analysis = generate_ai_matchweek_analysis(unplayed_json)

        # Must pick real registered player, not an imaginary name
        self.assertEqual(unplayed_analysis["mvp_of_the_week"]["name"], "Real Player One")
        self.assertEqual(unplayed_analysis["mvp_of_the_week"]["team"], "Titans United")

    def test_ai_matchweek_report_pdf_view_html(self):
        url = reverse("tournaments:category_ai_matchweek_report_pdf", kwargs={"key": self.category.key})
        res = self.client.get(f"{url}?auto=1")
        self.assertEqual(res.status_code, 200)
        self.assertIn("text/html", res["Content-Type"])
        html = res.content.decode("utf-8")
        self.assertIn("OFFICIAL AI-POWERED MATCHWEEK &amp; DAILY ANALYTICS DOSSIER", html)
        self.assertIn("Team Alpha", html)
        self.assertIn("Team Beta", html)
        self.assertIn("Alice Striker", html)

    def test_ai_matchweek_report_pdf_view_json_format(self):
        url = reverse("tournaments:category_ai_matchweek_report_pdf", kwargs={"key": self.category.key})
        res = self.client.get(f"{url}?format=json")
        self.assertEqual(res.status_code, 200)
        self.assertIn("application/json", res["Content-Type"])
        data = res.json()
        self.assertIn("competition", data)
        self.assertIn("matches", data)
        self.assertIn("standings", data)
        self.assertIn("ai_analysis", data)
        self.assertIn("official_squad_rosters", data)
