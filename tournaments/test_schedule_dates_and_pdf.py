from django.test import TestCase, Client
from django.urls import reverse
from tournaments.models import Category
from tournaments.services import build_real_open_season_dict, import_state_to_db


class ScheduleStartDateAndPDFTests(TestCase):
    def setUp(self):
        self.client = Client()
        seed_data = build_real_open_season_dict()
        import_state_to_db({"categories": {"open": seed_data}, "activeCategory": "open"})

    def test_category_schedule_property_with_start_date(self):
        cat = Category.objects.get(key="open")
        cat.schedule = {
            "time": "16:00",
            "matches_per_day": 2,
            "startDate": "2026-10-24",
            "venue": "Thoome Pri.",
            "days": {6: 2, 0: 2},
        }
        cat.save()

        # Reload from DB
        reloaded = Category.objects.get(key="open")
        sched = reloaded.schedule
        self.assertEqual(sched["time"], "16:00")
        self.assertEqual(sched["matches_per_day"], 2)
        self.assertEqual(sched["startDate"], "2026-10-24")
        self.assertEqual(sched["start_date"], "2026-10-24")
        self.assertEqual(sched["venue"], "Thoome Pri.")

        # Serialized state contains startDate & venue
        state_dict = reloaded.to_state_dict()
        self.assertEqual(state_dict["schedule"]["startDate"], "2026-10-24")
        self.assertEqual(state_dict["schedule"]["venue"], "Thoome Pri.")

    def test_fixtures_results_pdf_view_open_league(self):
        url = reverse("tournaments:category_fixtures_results_pdf", kwargs={"key": "open"})
        response = self.client.get(url + "?auto=1")
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "RUIRU TITANS FOOTBALL CLUB")
        self.assertContains(response, "OFFICIAL COMPETITION FIXTURES, RESULTS &amp; STANDINGS DOSSIER")
        self.assertContains(response, "Thoome Pri.")
        self.assertContains(response, "window.print()")

    def test_fixtures_results_pdf_view_cup_autoseed(self):
        # Ensure cup is not present initially
        Category.objects.filter(key="cup").delete()
        url = reverse("tournaments:api_category_fixtures_results_pdf", kwargs={"key": "cup"})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "RUIRU TITANS FOOTBALL CLUB")
        # Ensure cup was seeded
        self.assertTrue(Category.objects.filter(key="cup").exists())

    def test_fixtures_results_pdf_view_nonexistent_404(self):
        url = reverse("tournaments:category_fixtures_results_pdf", kwargs={"key": "nonexistent_tourney_xyz"})
        response = self.client.get(url)
        self.assertEqual(response.status_code, 404)

    def test_category_detail_patch_api(self):
        url = reverse("tournaments:api_category_detail", kwargs={"key": "open"})
        payload = {
            "label": "Ruiru Premier League 2026/27",
            "format": "single",
            "schedule": {
                "startDate": "2026-11-01",
                "time": "16:30",
                "matches_per_day": 2,
                "venue": "Thoome Pri. Stadium Complex",
                "days": {6: 2, 0: 2},
            },
            "referees": ["Ref Kamau", "Ref Njoroge", "Ref Waweru"],
            "votingConfig": {"team_size": 11, "max_picks_per_position": 3, "include_gk": True},
        }
        import json
        response = self.client.generic("PATCH", url, json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 200)

        # Verify database update
        reloaded = Category.objects.get(key="open")
        self.assertEqual(reloaded.label, "Ruiru Premier League 2026/27")
        self.assertEqual(reloaded.format, "single")
        self.assertEqual(reloaded.schedule["startDate"], "2026-11-01")
        self.assertEqual(reloaded.schedule["time"], "16:30")
        self.assertEqual(reloaded.schedule["venue"], "Thoome Pri. Stadium Complex")
        self.assertEqual(reloaded.referees.count(), 3)
        self.assertEqual(reloaded.voting_team_size, 11)

    def test_player_transfer_persistence(self):
        cat = Category.objects.get(key="open")
        teams = list(cat.teams.all())
        self.assertGreaterEqual(len(teams), 2)
        team_a = teams[0]
        team_b = teams[1]

        player = team_a.players.first()
        self.assertIsNotNone(player)
        player_id = player.player_id

        # Transfer player from team_a to team_b
        state = cat.to_state_dict()
        p_obj = None
        for t in state["teams"]:
            if t["id"] == team_a.team_id:
                for p in t["players"]:
                    if p["id"] == player_id:
                        p_obj = p
                        break
                t["players"] = [p for p in t["players"] if p["id"] != player_id]
        self.assertIsNotNone(p_obj)
        for t in state["teams"]:
            if t["id"] == team_b.team_id:
                t["players"].append(p_obj)

        import_state_to_db({"categories": {"open": state}, "activeCategory": "open"})

        # Verify in DB
        player.refresh_from_db()
        self.assertEqual(player.team.id, team_b.id)
