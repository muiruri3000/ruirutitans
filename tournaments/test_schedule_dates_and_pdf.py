from django.test import TestCase, Client
from django.urls import reverse
from tournaments.models import Category, Team, Fixture
from tournaments.services import build_real_open_season_dict, import_state_to_db


class ScheduleStartDateAndPDFTests(TestCase):
    def setUp(self):
        self.client = Client()
        seed_data = build_real_open_season_dict()
        import_state_to_db({"categories": {"open": seed_data}, "activeCategory": "open"})

        from django.contrib.auth.models import User
        from tournaments.services import create_signed_token
        self.admin_user = User.objects.create_superuser(
            username="sched_admin_test",
            email="sched_admin@ruirutitans.com",
            password="admin_pass_123",
        )
        self.cms_token = create_signed_token(
            {"role": "cms", "username": "sched_admin_test", "email": "sched_admin@ruirutitans.com"},
            salt="titans-cms-auth",
        )

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

    def test_fixtures_results_pdf_ordering_with_late_inserted_fixtures(self):
        cat = Category.objects.create(key="test-league", label="Test League", mode="league")
        t1 = Team.objects.create(category=cat, team_id="T1", name="Team One")
        t2 = Team.objects.create(category=cat, team_id="T2", name="Team Two")
        t3 = Team.objects.create(category=cat, team_id="T3", name="Team Three")

        # Create F1, F2, F4 first
        f1 = Fixture.objects.create(category=cat, fixture_id="F1", round_index=1, home_team=t1, away_team=t2, played=True)
        f2 = Fixture.objects.create(category=cat, fixture_id="F2", round_index=2, home_team=t2, away_team=t3, played=True)
        f4 = Fixture.objects.create(category=cat, fixture_id="F4", round_index=4, home_team=t1, away_team=t3, played=False)
        # Create F3 afterwards (so f3.id > f4.id in DB)
        f3 = Fixture.objects.create(category=cat, fixture_id="F3", round_index=3, home_team=t3, away_team=t1, played=False)
        self.assertGreater(f3.id, f4.id)

        from tournaments.services import get_category_fixtures_results_pdf_context
        ctx = get_category_fixtures_results_pdf_context(cat)
        f_ids = [fix["fixture_id"] for fix in ctx["fixtures"]]
        self.assertEqual(f_ids, ["F1", "F2", "F3", "F4"])

        url = reverse("tournaments:category_fixtures_results_pdf", kwargs={"key": "test-league"})
        resp = self.client.get(url)
        self.assertEqual(resp.status_code, 200)
        html = resp.content.decode("utf-8")
        pos_f3 = html.find("Match Ref: <b>F3</b>")
        pos_f4 = html.find("Match Ref: <b>F4</b>")
        self.assertNotEqual(pos_f3, -1)
        self.assertNotEqual(pos_f4, -1)
        self.assertLess(pos_f3, pos_f4, "F3 should appear before F4 in the PDF")

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
        response = self.client.generic(
            "PATCH",
            url,
            json.dumps(payload),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
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

    def test_played_fixtures_referee_protection(self):
        cat = Category.objects.get(key="open")
        fixture = cat.fixtures.first()
        self.assertIsNotNone(fixture)

        # Set fixture as played with an assigned referee
        fixture.played = True
        fixture.referee = "Ref Joseph"
        fixture.save()

        # 1. Verify to_dict includes referee
        f_dict = fixture.to_dict()
        self.assertEqual(f_dict.get("referee"), "Ref Joseph")
        self.assertTrue(f_dict.get("played"))

        # 2. Simulate re-importing state where incoming referee is omitted or empty
        cat_dict = cat.to_state_dict()
        for f in cat_dict["fixtures"]:
            if f["id"] == fixture.fixture_id:
                f["referee"] = ""

        import_state_to_db({"categories": {"open": cat_dict}, "activeCategory": "open"})

        # 3. Verify existing played fixture referee was safeguarded and preserved
        fixture.refresh_from_db()
        self.assertEqual(fixture.referee, "Ref Joseph")
        self.assertTrue(fixture.played)

    def test_fixtures_ordered_by_date_chronologically(self):
        cat = Category.objects.create(key="date-order-league", label="Date Order League", mode="league")
        t1 = Team.objects.create(category=cat, team_id="T1", name="Team One")
        t2 = Team.objects.create(category=cat, team_id="T2", name="Team Two")
        t3 = Team.objects.create(category=cat, team_id="T3", name="Team Three")

        # Create fixtures with out-of-order dates and kickoff times
        Fixture.objects.create(
            category=cat, fixture_id="F1", round_index=1,
            home_team=t1, away_team=t2, date="Mon, 26 Oct · 18:10", played=False
        )
        Fixture.objects.create(
            category=cat, fixture_id="F2", round_index=1,
            home_team=t2, away_team=t3, date="Sat, 24 Oct · 17:00", played=True
        )
        Fixture.objects.create(
            category=cat, fixture_id="F3", round_index=2,
            home_team=t1, away_team=t3, date="TBD", played=False
        )
        Fixture.objects.create(
            category=cat, fixture_id="F4", round_index=2,
            home_team=t3, away_team=t1, date="Mon, 26 Oct · 18:00", played=False
        )

        # Verify state dict orders fixtures by date + time (TBD last)
        state = cat.to_state_dict()
        ordered_ids = [f["id"] for f in state["fixtures"]]
        self.assertEqual(ordered_ids, ["F2", "F4", "F1", "F3"])

        # Verify PDF context orders fixtures by date + time (TBD last)
        from tournaments.services import get_category_fixtures_results_pdf_context
        ctx = get_category_fixtures_results_pdf_context(cat)
        pdf_ids = [f["fixture_id"] for f in ctx["fixtures"]]
        self.assertEqual(pdf_ids, ["F2", "F4", "F1", "F3"])
