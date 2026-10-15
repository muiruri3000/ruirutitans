from django.test import TestCase, Client
from django.urls import reverse
from tournaments.models import Category, Team, Player, Fixture, MatchEvent, GlobalSettings
from tournaments.services import (
    build_real_open_season_dict,
    import_state_to_db,
    export_state_from_db,
)


class TournamentModelTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(
            key="test-cup",
            label="Test Cup",
            mode="cup",
            format="single",
            group_letters=["A", "B"],
            group_of={"T1": "A", "T2": "A", "T3": "B", "T4": "B"},
        )
        self.team1 = Team.objects.create(category=self.category, team_id="T1", name="Titans A", color="#C9A227")
        self.team2 = Team.objects.create(category=self.category, team_id="T2", name="Titans B", color="#B23A2E")

        self.player1 = Player.objects.create(team=self.team1, player_id="T1-P1", name="Player One", position="FWD")
        self.player2 = Player.objects.create(team=self.team2, player_id="T2-P1", name="Player Two", position="DEF")

        self.fixture = Fixture.objects.create(
            category=self.category,
            fixture_id="FIX-001",
            phase="group",
            group_letter="A",
            home_team=self.team1,
            away_team=self.team2,
            played=True,
            date="2026-10-15",
        )

    def test_model_creation(self):
        self.assertEqual(Category.objects.count(), 1)
        self.assertEqual(Team.objects.count(), 2)
        self.assertEqual(Player.objects.count(), 2)
        self.assertEqual(Fixture.objects.count(), 1)

    def test_fixture_scores_and_events(self):
        # 1 goal for home team
        MatchEvent.objects.create(
            fixture=self.fixture,
            team=self.team1,
            player=self.player1,
            event_type="goal",
            order=1,
        )
        # 1 own goal by away team (counts for home)
        MatchEvent.objects.create(
            fixture=self.fixture,
            team=self.team2,
            player=self.player2,
            event_type="owngoal",
            order=2,
        )
        # 1 goal for away team
        MatchEvent.objects.create(
            fixture=self.fixture,
            team=self.team2,
            player=self.player2,
            event_type="goal",
            order=3,
        )

        h_score, a_score = self.fixture.score
        self.assertEqual(h_score, 2)
        self.assertEqual(a_score, 1)

    def test_walkover_score(self):
        self.fixture.walkover_winner = self.team1
        self.fixture.save()
        h, a = self.fixture.score
        self.assertEqual((h, a), (3, 0))


class TournamentServiceTests(TestCase):
    def test_import_and_export_state(self):
        seed_data = build_real_open_season_dict()
        import_state_to_db({"categories": {"open": seed_data}, "activeCategory": "open"})

        exported = export_state_from_db()
        self.assertIn("categories", exported)
        self.assertIn("open", exported["categories"])

        open_cat = exported["categories"]["open"]
        self.assertEqual(open_cat["label"], "Open")
        self.assertEqual(open_cat["mode"], "league")
        self.assertEqual(len(open_cat["teams"]), 5)
        self.assertEqual(len(open_cat["fixtures"]), 20)


class TournamentAPITests(TestCase):
    def setUp(self):
        self.client = Client()
        # Seed real season
        seed_data = build_real_open_season_dict()
        import_state_to_db({"categories": {"open": seed_data}, "activeCategory": "open"})

    def test_home_page_renders(self):
        response = self.client.get(reverse("tournaments:home"))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Ruiru Titans")
        self.assertContains(response, "titans.js")
        self.assertContains(response, "titans.css")

    def test_get_state_api(self):
        response = self.client.get(reverse("tournaments:api_state"))
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("categories", data)
        self.assertIn("open", data["categories"])

    def test_post_state_api(self):
        state = export_state_from_db()
        # Modify category note
        state["categories"]["open"]["note"] = "Updated tournament note via API"
        response = self.client.post(
            reverse("tournaments:api_state"),
            data=state,
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        updated = Category.objects.get(key="open")
        self.assertEqual(updated.note, "Updated tournament note via API")

    def test_standings_api(self):
        response = self.client.get(reverse("tournaments:api_standings", kwargs={"key": "open"}))
        self.assertEqual(response.status_code, 200)
        standings = response.json()
        self.assertIsInstance(standings, list)
        self.assertEqual(len(standings), 5)
        self.assertIn("Pts", standings[0])
        self.assertIn("GD", standings[0])

    def test_categories_api(self):
        # List categories
        response = self.client.get(reverse("tournaments:api_categories"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)

        # Create category
        response = self.client.post(
            reverse("tournaments:api_categories"),
            data={"name": "Youth Cup", "mode": "cup", "format": "single"},
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Category.objects.filter(label="Youth Cup").exists())

    def test_h2h_api(self):
        # Query H2H between Oxford and Super Strikers
        response = self.client.get(
            reverse("tournaments:api_category_h2h", kwargs={"key": "open"}),
            {"team1": "OXF", "team2": "SS"},
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("team1", data)
        self.assertIn("team2", data)
        self.assertIn("h2h_summary", data)
        self.assertIn("team1_form", data)
        self.assertIn("past_matches", data)
        self.assertEqual(data["team1"]["id"], "OXF")
        self.assertEqual(data["team2"]["id"], "SS")

    def test_h2h_missing_parameters(self):
        response = self.client.get(
            reverse("tournaments:api_category_h2h", kwargs={"key": "open"}),
            {"team1": "OXF"},
        )
        self.assertEqual(response.status_code, 400)

    def test_export_standings_csv(self):
        response = self.client.get(
            reverse("tournaments:api_export_standings_csv", kwargs={"key": "open"})
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn("attachment; filename=", response["Content-Disposition"])
        content = response.content.decode("utf-8")
        self.assertIn("Rank,Team Code,Team Name,MP,W,D,L,GF,GA,GD,Pts", content)
        self.assertIn("Mancheli", content)
        self.assertIn("Oxford", content)

    def test_export_fixtures_csv(self):
        response = self.client.get(
            reverse("tournaments:api_export_fixtures_csv", kwargs={"key": "open"})
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn("attachment; filename=", response["Content-Disposition"])
        content = response.content.decode("utf-8")
        self.assertIn("Fixture ID,Phase,Date,Home Team Code", content)
        self.assertIn("REAL-F1", content)

    def test_export_players_csv(self):
        response = self.client.get(
            reverse("tournaments:api_export_players_csv", kwargs={"key": "open"})
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")
        self.assertIn("attachment; filename=", response["Content-Disposition"])
        content = response.content.decode("utf-8")
        self.assertIn("Player ID,Player Name,Team Code,Team Name,Position,Goals", content)
        self.assertIn("Jimmy", content)

    def test_printable_match_sheet_view(self):
        response = self.client.get(
            reverse("tournaments:fixture_match_sheet", kwargs={"fixture_id": "REAL-F1"})
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "Official Match Day Sheet")
        self.assertContains(response, "Ruiru Titans")
        self.assertContains(response, "Super Strikers")
        self.assertContains(response, "Mancheli")
        self.assertContains(response, "Center Referee Signature")

