import json
from django.test import TestCase, Client
from django.urls import reverse
from tournaments.models import Category, Team, Player, Fixture, MatchEvent, GlobalSettings, VotingRound, PositionVote
from tournaments.services import (
    build_real_open_season_dict,
    import_state_to_db,
    export_state_from_db,
    compute_category_suspensions,
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

        self.player1 = Player.objects.create(team=self.team1, player_id="T1-P1", name="Player One", position="ST")
        self.player2 = Player.objects.create(team=self.team2, player_id="T2-P1", name="Player Two", position="CB")

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

    def test_category_fixtures_results_pdf_view(self):
        response = self.client.get(
            reverse("tournaments:category_fixtures_results_pdf", kwargs={"key": "open"})
        )
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, "RUIRU TITANS FOOTBALL CLUB")
        self.assertContains(response, "OFFICIAL COMPETITION FIXTURES, RESULTS &amp; STANDINGS DOSSIER")
        self.assertContains(response, "Standings Table")
        self.assertContains(response, "Complete Fixtures &amp; Match Results Schedule")
        self.assertContains(response, "Golden Boot / Top Scorers")



class VotingSystemTests(TestCase):
    def setUp(self):
        self.client = Client()
        # Seed real season
        seed_data = build_real_open_season_dict()
        import_state_to_db({"categories": {"open": seed_data}, "activeCategory": "open"})
        self.category = Category.objects.get(key="open")
        from tournaments.services import ensure_player_default_positions
        ensure_player_default_positions(self.category)

        # For voting suite tests covering both GK and non-GK modes, enable GK initially
        self.category.voting_include_gk = True
        self.category.save()
        Player.objects.filter(team__category=self.category, name__in=["Obonyo", "Ian"]).update(position="GK")

        # Get test players from seeded teams
        self.gk = Player.objects.filter(team__category=self.category, name="Obonyo").first()
        self.def1 = Player.objects.filter(team__category=self.category, name="Wanjohi").first()
        self.def2 = Player.objects.filter(team__category=self.category, name="Kuria").first()
        self.mid1 = Player.objects.filter(team__category=self.category, name="Peter").first()
        self.wing1 = Player.objects.filter(team__category=self.category, name="Rafo").first()
        self.st1 = Player.objects.filter(team__category=self.category, name="Pato").first()
        self.st2 = Player.objects.filter(team__category=self.category, name="Ramsey").first()

    def test_real_open_season_six_a_side_no_gk_and_kibe_striker(self):
        """Verifies August 2026 season seed is 6-a-side, has no GKs, and Kibe is Striker."""
        seed_data = build_real_open_season_dict()
        self.assertFalse(seed_data["votingConfig"]["include_gk"])
        self.assertEqual(seed_data["votingConfig"]["team_size"], 6)

        mancheli = next(t for t in seed_data["teams"] if t["id"] == "MAN")
        kibe = next(p for p in mancheli["players"] if p.get("name") == "Kibe")
        self.assertEqual(kibe["position"], "ST")

        # Confirm no players in the seed have position GK
        all_positions = [
            p.get("position")
            for t in seed_data["teams"]
            for p in t["players"]
            if not p.get("unknown")
        ]
        self.assertNotIn("GK", all_positions)
        from tournaments.services import get_or_create_active_voting_round, submit_voter_ballot
        v_round = get_or_create_active_voting_round(self.category)
        self.assertTrue(v_round.is_open)

        # Voter 1 casts ballot
        ballot = {
            "GK": self.gk.player_id,
            "DEF": self.def1.player_id,
            "MID": self.mid1.player_id,
            "WING": self.wing1.player_id,
            "ST": self.st1.player_id,
        }
        res = submit_voter_ballot(self.category, v_round.id, "voter_1", "Fan One", ballot)
        self.assertTrue(res["success"])
        self.assertEqual(PositionVote.objects.filter(voting_round=v_round, voter_id="voter_1").count(), 5)

        # Voter 1 changes ST vote to st2 (upsert test)
        res2 = submit_voter_ballot(self.category, v_round.id, "voter_1", "Fan One", {"ST": self.st2.player_id})
        self.assertTrue(res2["success"])
        # Should still be 5 total votes, with ST updated to st2
        self.assertEqual(PositionVote.objects.filter(voting_round=v_round, voter_id="voter_1").count(), 5)
        st_vote = PositionVote.objects.get(voting_round=v_round, voter_id="voter_1", position="ST")
        self.assertEqual(st_vote.player, self.st2)

    def test_totw_highest_votes(self):
        from tournaments.services import get_or_create_active_voting_round, submit_voter_ballot
        v_round = get_or_create_active_voting_round(self.category)

        # Voter 1 & Voter 2 vote for ST1 (Pato)
        submit_voter_ballot(self.category, v_round.id, "voter_1", "User 1", {"ST": self.st1.player_id})
        submit_voter_ballot(self.category, v_round.id, "voter_2", "User 2", {"ST": self.st1.player_id})

        # Voter 3 votes for ST2 (Ramsey)
        submit_voter_ballot(self.category, v_round.id, "voter_3", "User 3", {"ST": self.st2.player_id})

        totw = v_round.get_totw()
        st_entry = next(item for item in totw if item["position"] == "ST")
        self.assertEqual(st_entry["player_id"], self.st1.player_id)
        self.assertEqual(st_entry["votes"], 2)

    def test_admin_closing_window_blocks_voting(self):
        from tournaments.services import get_or_create_active_voting_round, submit_voter_ballot, admin_toggle_voting_round
        v_round = get_or_create_active_voting_round(self.category)

        # Admin closes window
        admin_toggle_voting_round(self.category, round_id=v_round.id, is_open=False)
        v_round.refresh_from_db()
        self.assertFalse(v_round.is_open)

        # Submitting vote should now raise ValueError
        with self.assertRaises(ValueError) as ctx:
            submit_voter_ballot(self.category, v_round.id, "voter_late", "Late User", {"ST": self.st1.player_id})
        self.assertIn("closed", str(ctx.exception).lower())

    def test_tott_highest_averages_calculation(self):
        from tournaments.services import (
            admin_toggle_voting_round,
            submit_voter_ballot,
            compute_team_of_tournament,
        )

        # Clean any existing rounds
        VotingRound.objects.filter(category=self.category).delete()

        # Round 1 (Week 1)
        r1 = VotingRound.objects.create(category=self.category, week_number=1, title="Week 1", is_open=True)
        # ST1 (Pato) gets 3 votes, ST2 (Ramsey) gets 1 vote in Round 1
        submit_voter_ballot(self.category, r1.id, "v1", "V1", {"ST": self.st1.player_id})
        submit_voter_ballot(self.category, r1.id, "v2", "V2", {"ST": self.st1.player_id})
        submit_voter_ballot(self.category, r1.id, "v3", "V3", {"ST": self.st1.player_id})
        submit_voter_ballot(self.category, r1.id, "v4", "V4", {"ST": self.st2.player_id})

        # Round 2 (Week 2)
        r2 = admin_toggle_voting_round(self.category, create_new=True, title="Week 2")
        # ST2 (Ramsey) gets 5 votes in Round 2, ST1 gets 0
        submit_voter_ballot(self.category, r2.id, "v1", "V1", {"ST": self.st2.player_id})
        submit_voter_ballot(self.category, r2.id, "v2", "V2", {"ST": self.st2.player_id})
        submit_voter_ballot(self.category, r2.id, "v3", "V3", {"ST": self.st2.player_id})
        submit_voter_ballot(self.category, r2.id, "v4", "V4", {"ST": self.st2.player_id})
        submit_voter_ballot(self.category, r2.id, "v5", "V5", {"ST": self.st2.player_id})

        # Across the 2 rounds:
        # Total rounds = 2
        # ST1 total votes = 3 -> average = 1.5
        # ST2 total votes = 1 + 5 = 6 -> average = 3.0
        # ST2 has highest average and should be TOTT Striker!
        tott = compute_team_of_tournament(self.category)
        self.assertEqual(tott["total_rounds"], 2)
        st_tott = next(item for item in tott["lineup"] if item["position"] == "ST")
        self.assertEqual(st_tott["player_id"], self.st2.player_id)
        self.assertEqual(st_tott["total_votes"], 6)
        self.assertEqual(st_tott["average_votes"], 3.0)

    def test_voting_api_flow(self):
        # 1. GET active voting data (publicly accessible without login)
        get_res = self.client.get(
            reverse("tournaments:api_category_voting", kwargs={"key": "open"}),
        )
        self.assertEqual(get_res.status_code, 200)
        data = get_res.json()
        self.assertIn("round", data)
        self.assertIn("totw", data)
        self.assertIn("tott", data)
        self.assertIn("candidates", data)

        round_id = data["round"]["id"]

        # 2. Unauthenticated POST ballot must be rejected (401 Unauthorized)
        unauth_res = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "open"}),
            data=json.dumps({
                "round_id": round_id,
                "votes": {
                    "GK": self.gk.player_id,
                    "ST": self.st1.player_id,
                },
            }),
            content_type="application/json",
        )
        self.assertEqual(unauth_res.status_code, 401)

        # 3. Log in as a registered club player
        login_res = self.client.post(
            reverse("tournaments:api_auth_player_login"),
            data=json.dumps({
                "player_id": self.st1.player_id,
                "access_code": "titans2026",
                "category_key": "open",
            }),
            content_type="application/json",
        )
        self.assertEqual(login_res.status_code, 200)
        player_token = login_res.json()["token"]

        # 4. Authenticated player POST ballot succeeds
        post_res = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "open"}),
            data=json.dumps({
                "round_id": round_id,
                "votes": {
                    "GK": self.gk.player_id,
                    "ST": self.st1.player_id,
                },
            }),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=player_token,
        )
        self.assertEqual(post_res.status_code, 200)
        submit_data = post_res.json()
        self.assertTrue(submit_data["success"])
        self.assertIn("GK", submit_data["saved_votes"])
        self.assertIn("ST", submit_data["saved_votes"])

        # 5. POST admin toggle window
        admin_res = self.client.post(
            reverse("tournaments:api_category_voting_admin_toggle", kwargs={"key": "open"}),
            data=json.dumps({
                "round_id": round_id,
                "is_open": False,
            }),
            content_type="application/json",
        )
        self.assertEqual(admin_res.status_code, 200)
        self.assertFalse(admin_res.json()["round"]["is_open"])

        # 6. GET TOTT (publicly accessible without login)
        tott_res = self.client.get(
            reverse("tournaments:api_category_voting_tott", kwargs={"key": "open"})
        )
        self.assertEqual(tott_res.status_code, 200)
        self.assertIn("lineup", tott_res.json())

    def test_exact_category_enforcement(self):
        from tournaments.services import get_category_voting_data, submit_voter_ballot, get_or_create_active_voting_round
        v_data = get_category_voting_data(self.category)
        candidates = v_data["candidates"]

        # 1. Every player across the category must have one of the 9 official positions:
        # GK, RW, LW, ST, CM, CDM, LB, RB, CB
        valid_positions = {"GK", "LB", "CB", "RB", "CDM", "CM", "LW", "RW", "ST"}
        for p in v_data["all_players"]:
            self.assertIn(p["position"], valid_positions)

        # 2. Every candidate in each of the 9 position buckets must have that exact position
        for pos in valid_positions:
            self.assertIn(pos, candidates)
            for p in candidates[pos]:
                self.assertEqual(p["position"], pos)

        # 3. Attempting to vote a Defender (CB) as a Striker (ST) must be rejected with ValueError
        v_round = get_or_create_active_voting_round(self.category)
        with self.assertRaises(ValueError) as ctx:
            submit_voter_ballot(
                self.category,
                v_round.id,
                "voter_illegal",
                "Illegal Voter",
                {"ST": self.def1.player_id},
            )
        self.assertIn("registered position", str(ctx.exception))

    def test_two_votes_per_position_optional_gk_and_six_player_display(self):
        from tournaments.services import (
            get_or_create_active_voting_round,
            submit_voter_ballot,
            compute_team_of_tournament,
        )

        v_round = get_or_create_active_voting_round(self.category)

        # Get candidates for each of the official positions
        cbs = list(Player.objects.filter(team__category=self.category, position="CB")[:3])
        lbs = list(Player.objects.filter(team__category=self.category, position="LB")[:3])
        rbs = list(Player.objects.filter(team__category=self.category, position="RB")[:3])
        cdms = list(Player.objects.filter(team__category=self.category, position="CDM")[:3])
        cms = list(Player.objects.filter(team__category=self.category, position="CM")[:3])
        lws = list(Player.objects.filter(team__category=self.category, position="LW")[:3])
        rws = list(Player.objects.filter(team__category=self.category, position="RW")[:3])
        strikers = list(Player.objects.filter(team__category=self.category, position="ST")[:3])
        gks = list(Player.objects.filter(team__category=self.category, position="GK")[:2])

        self.assertGreaterEqual(len(cbs), 2)
        self.assertGreaterEqual(len(cms), 2)
        self.assertGreaterEqual(len(rws), 2)
        self.assertGreaterEqual(len(strikers), 2)

        # 1. Ballot with 2 votes for outfield positions and NO GK (GK is optional)
        ballot_no_gk = {
            "CB": [cbs[0].player_id, cbs[1].player_id],
            "LB": [lbs[0].player_id],
            "RB": [rbs[0].player_id],
            "CDM": [cdms[0].player_id],
            "CM": [cms[0].player_id, cms[1].player_id],
            "LW": [lws[0].player_id],
            "RW": [rws[0].player_id, rws[1].player_id],
            "ST": [strikers[0].player_id, strikers[1].player_id],
            "GK": [],
        }
        res = submit_voter_ballot(self.category, v_round.id, "voter_multi_1", "Multi Voter 1", ballot_no_gk)
        self.assertTrue(res["success"])
        self.assertEqual(PositionVote.objects.filter(voting_round=v_round, voter_id="voter_multi_1").count(), 12)

        # 2. TOTW lineup must feature exactly 6 players when GK has 0 votes
        totw_no_gk = v_round.get_totw()
        self.assertEqual(len(totw_no_gk), 6)
        # Verify no GK in active slots since no GK was voted
        gk_slots = [p for p in totw_no_gk if p.get("position") == "GK" and p.get("player_id")]
        self.assertEqual(len(gk_slots), 0)

        # 3. Voter 2 votes for GK (1 GK) and 2 Strikers
        ballot_with_gk = {
            "GK": [gks[0].player_id],
            "ST": [strikers[0].player_id, strikers[1].player_id],
        }
        res2 = submit_voter_ballot(self.category, v_round.id, "voter_multi_2", "Multi Voter 2", ballot_with_gk)
        self.assertTrue(res2["success"])

        # 4. TOTW lineup must feature exactly 6 players when GK has votes (1 GK + 5 outfielders)
        totw_with_gk = v_round.get_totw()
        self.assertEqual(len(totw_with_gk), 6)
        gk_in_totw = [p for p in totw_with_gk if p.get("position") == "GK"]
        self.assertEqual(len(gk_in_totw), 1)
        self.assertEqual(gk_in_totw[0]["player_id"], gks[0].player_id)

        # 5. Team of Tournament (TOTT) lineup must feature exactly 6 players
        tott = compute_team_of_tournament(self.category)
        self.assertEqual(len(tott["lineup"]), 6)

        # 6. Validation: Exceeding maximum votes per position must be rejected
        with self.assertRaises(ValueError) as ctx:
            submit_voter_ballot(
                self.category,
                v_round.id,
                "voter_greedy",
                "Greedy",
                {"CB": [cbs[0].player_id, cbs[1].player_id, cbs[2].player_id]},
            )
        self.assertIn("Maximum 2 players can be voted for CB", str(ctx.exception))

        with self.assertRaises(ValueError) as ctx:
            submit_voter_ballot(
                self.category,
                v_round.id,
                "voter_greedy_gk",
                "Greedy GK",
                {"GK": [gks[0].player_id, gks[1].player_id]},
            )
        self.assertIn("Maximum 1 player can be voted for GK", str(ctx.exception))

        # 7. Validation: Duplicate player in the same position
        with self.assertRaises(ValueError) as ctx:
            submit_voter_ballot(
                self.category,
                v_round.id,
                "voter_dup",
                "Dup",
                {"CB": [cbs[0].player_id, cbs[0].player_id]},
            )
        self.assertIn("Duplicate player selected for CB", str(ctx.exception))

        # 8. Test API endpoint with logged-in player and 2 votes per outfield position
        login_res = self.client.post(
            reverse("tournaments:api_auth_player_login"),
            data=json.dumps({
                "player_id": strikers[0].player_id,
                "access_code": "titans2026",
                "category_key": "open",
            }),
            content_type="application/json",
        )
        self.assertEqual(login_res.status_code, 200)
        token = login_res.json()["token"]

        api_res = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "open"}),
            data=json.dumps({
                "round_id": v_round.id,
                "votes": {
                    "CB": [cbs[0].player_id, cbs[1].player_id],
                    "ST": [strikers[0].player_id],
                    "GK": [],
                },
            }),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=token,
        )
        self.assertEqual(api_res.status_code, 200)
        api_data = api_res.json()
        self.assertTrue(api_data["success"])
        self.assertEqual(len(api_data["saved_votes"]["CB"]), 2)
        self.assertEqual(len(api_data["saved_votes"]["GK"]), 0)
        self.assertEqual(len(api_data["totw"]), 6)

    def test_cms_and_player_authentication_and_cup_progression(self):
        from tournaments.services import build_real_cup_season_dict
        cup_data = build_real_cup_season_dict()
        import_state_to_db({
            "categories": {"open": build_real_open_season_dict(), "titans-cup": cup_data},
            "activeCategory": "open",
        })

        # Verify Cup progression levels & fixtures persisted
        cup_cat = Category.objects.get(key="titans-cup")
        self.assertEqual(cup_cat.mode, "cup")
        self.assertEqual(cup_cat.group_letters, ["A", "B"])
        self.assertEqual(len(cup_cat.rounds_data), 3)  # QF, SF, Final

        # Verify CMS Admin Login
        cms_res = self.client.post(
            reverse("tournaments:api_auth_cms_login"),
            data=json.dumps({"username": "admin", "password": "admin123"}),
            content_type="application/json",
        )
        self.assertEqual(cms_res.status_code, 200)
        self.assertTrue(cms_res.json()["success"])
        self.assertEqual(cms_res.json()["role"], "cms")

        # Verify Session Check
        session_res = self.client.get(reverse("tournaments:api_auth_session"))
        self.assertEqual(session_res.status_code, 200)
        self.assertTrue(session_res.json()["cms_authenticated"])

    def test_admin_voting_player_count_and_gk_toggle_and_homepage_api(self):
        from tournaments.services import (
            get_or_create_active_voting_round,
            submit_voter_ballot,
            compute_team_of_tournament,
            get_category_voting_data,
        )

        v_round = get_or_create_active_voting_round(self.category)
        gks = list(Player.objects.filter(team__category=self.category, position="GK")[:1])
        strikers = list(Player.objects.filter(team__category=self.category, position="ST")[:3])

        # Vote for a GK while GK is still enabled
        submit_voter_ballot(
            self.category,
            v_round.id,
            "voter_gk_test",
            "Voter GK",
            {"GK": [gks[0].player_id], "ST": [strikers[0].player_id]},
        )

        # 1. Admin adjusts team_size to 8, max_picks_per_position to 3, and toggles include_gk OFF (False)
        toggle_res = self.client.post(
            reverse("tournaments:api_category_voting_admin_toggle", kwargs={"key": "open"}),
            data=json.dumps({
                "round_id": v_round.id,
                "team_size": 8,
                "max_picks_per_position": 3,
                "include_gk": False,
            }),
            content_type="application/json",
        )
        self.assertEqual(toggle_res.status_code, 200)
        toggle_data = toggle_res.json()
        self.assertEqual(toggle_data["voting_config"]["team_size"], 8)
        self.assertEqual(toggle_data["voting_config"]["max_picks_per_position"], 3)
        self.assertFalse(toggle_data["voting_config"]["include_gk"])

        self.category.refresh_from_db()
        self.assertEqual(self.category.voting_team_size, 8)
        self.assertEqual(self.category.voting_max_picks, 3)
        self.assertFalse(self.category.voting_include_gk)

        # 2. Verify GK is excluded from candidates when include_gk is False
        v_data = get_category_voting_data(self.category)
        self.assertNotIn("GK", v_data["candidates"])

        # 3. Verify voting for GK is rejected when include_gk is False
        with self.assertRaises(ValueError) as ctx:
            submit_voter_ballot(
                self.category,
                v_round.id,
                "voter_gk_blocked",
                "Blocked GK Voter",
                {"GK": [gks[0].player_id]},
            )
        self.assertIn("excluded", str(ctx.exception).lower())

        # 4. Verify voter can now pick 3 players for an outfield position (max_picks_per_position=3)
        res_three = submit_voter_ballot(
            self.category,
            v_round.id,
            "voter_three_picks",
            "Three Picks",
            {"ST": [strikers[0].player_id, strikers[1].player_id, strikers[2].player_id]},
        )
        self.assertTrue(res_three["success"])

        # 5. Verify TOTW and TOTT have 8 players and NO GK when include_gk is False
        totw = v_round.get_totw()
        self.assertEqual(len(totw), 8)
        for slot in totw:
            self.assertNotEqual(slot["position"], "GK")

        tott = compute_team_of_tournament(self.category)
        self.assertEqual(len(tott["lineup"]), 8)
        for slot in tott["lineup"]:
            self.assertNotEqual(slot["position"], "GK")

        # 6. Verify Homepage API returns carousel, u13/u15/u17/wazae jerseys, and categorized fixtures
        hp_get = self.client.get(reverse("tournaments:api_homepage"))
        self.assertEqual(hp_get.status_code, 200)
        hp_data = hp_get.json()
        self.assertIn("carousel", hp_data)
        self.assertIn("jerseys", hp_data)
        for group in ("u13", "u15", "u17", "wazae"):
            self.assertIn(group, hp_data["jerseys"])
            self.assertGreaterEqual(len(hp_data["jerseys"][group]), 1)
        self.assertIn("upcoming_fixtures", hp_data)
        fixture_cats = {f["category"] for f in hp_data["upcoming_fixtures"]}
        self.assertTrue({"internal", "friendly", "tournament", "league", "cup"}.issubset(fixture_cats))

    def test_permanent_player_id_assignment_and_username_password_login(self):
        from tournaments.services import get_or_create_active_voting_round

        team = self.category.teams.first()
        # 1. Admin creates a player without specifying player_id -> system assigns permanent ID
        new_player = Player.objects.create(
            team=team,
            name="Kelvin Kiptoo",
            username="kelvin_k",
            password="mysecretpassword",
            position="ST",
        )
        self.assertTrue(new_player.player_id.startswith(f"{team.team_id}-P"))
        assigned_permanent_id = new_player.player_id

        # 2. Updating player later must preserve the permanent ID
        new_player.name = "Kelvin Kiptoo Jr"
        new_player.player_id = "ATTEMPTED-CHANGE"
        new_player.save()
        new_player.refresh_from_db()
        self.assertEqual(new_player.player_id, assigned_permanent_id)

        # 3. Player logs in using ONLY username and password
        login_res = self.client.post(
            reverse("tournaments:api_auth_player_login"),
            data=json.dumps({
                "username": "kelvin_k",
                "password": "mysecretpassword",
            }),
            content_type="application/json",
        )
        self.assertEqual(login_res.status_code, 200)
        login_data = login_res.json()
        self.assertTrue(login_data["success"])
        self.assertEqual(login_data["player"]["player_id"], assigned_permanent_id)
        self.assertEqual(login_data["player"]["permanent_id"], assigned_permanent_id)
        token = login_data["token"]

        # 4. Player votes using their token; the vote is recorded under their permanent player_id
        v_round = get_or_create_active_voting_round(self.category)
        vote_res = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "open"}),
            data=json.dumps({
                "round_id": v_round.id,
                "votes": {
                    "ST": [assigned_permanent_id],
                },
            }),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=token,
        )
        self.assertEqual(vote_res.status_code, 200)
        self.assertTrue(
            PositionVote.objects.filter(
                voting_round=v_round,
                voter_id=assigned_permanent_id,
                player=new_player,
            ).exists()
        )

    def test_team_balancer_excel_csv_google_sheet_and_balancing(self):
        import base64
        import io
        import zipfile
        from tournaments.services import extract_google_sheet_csv_url

        # 1. Verify Google Sheet link conversion
        gsheet_url = "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=42"
        csv_export_url = extract_google_sheet_csv_url(gsheet_url)
        self.assertEqual(
            csv_export_url,
            "https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=42",
        )

        # 2. Verify CSV / Table text parsing & stratified balancing via API
        raw_csv = "\n".join([
            "Player Name,Class,Position",
            "Elite1,A,ST",
            "Elite2,A,CM",
            "Elite3,A,CB",
            "Good1,B,RW",
            "Good2,B,LW",
            "Good3,B,CDM",
            "Mid1,C,LB",
            "Mid2,C,RB",
            "Mid3,C,CM",
            "Amateur1,D,GK",
            "Amateur2,D,GK",
            "Amateur3,D,GK",
        ])
        res = self.client.post(
            reverse("tournaments:api_team_balancer"),
            data=json.dumps({
                "raw_text": raw_csv,
                "players_per_team": 4,
                "team_names": ["Titans Alpha", "Titans Beta", "Titans Gamma"],
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        payload = res.json()
        self.assertTrue(payload["success"])
        self.assertEqual(payload["team_count"], 3)
        self.assertEqual(payload["classes"], ["A", "B", "C", "D"])
        for idx, team in enumerate(payload["teams"]):
            self.assertEqual(team["player_count"], 4)
            # Every team must have exactly 1 A, 1 B, 1 C, and 1 D player!
            self.assertEqual(team["class_counts"], {"A": 1, "B": 1, "C": 1, "D": 1})
        self.assertEqual(
            [t["name"] for t in payload["teams"]],
            ["Titans Alpha", "Titans Beta", "Titans Gamma"],
        )

        # 3. Verify .xlsx Excel file parsing via base64 upload
        xlsx_buf = io.BytesIO()
        with zipfile.ZipFile(xlsx_buf, "w") as zf:
            zf.writestr(
                "xl/sharedStrings.xml",
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                '<si><t>Player Name</t></si>'
                '<si><t>Category</t></si>'
                '<si><t>Pato</t></si>'
                '<si><t>A</t></si>'
                '<si><t>Mrefu</t></si>'
                '<si><t>B</t></si>'
                '</sst>',
            )
            zf.writestr(
                "xl/worksheets/sheet1.xml",
                '<?xml version="1.0" encoding="UTF-8"?>'
                '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
                '<sheetData>'
                '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
                '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>'
                '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="s"><v>5</v></c></row>'
                '</sheetData>'
                '</worksheet>',
            )
        b64_xlsx = base64.b64encode(xlsx_buf.getvalue()).decode("ascii")
        xlsx_res = self.client.post(
            reverse("tournaments:api_team_balancer"),
            data=json.dumps({
                "action": "parse",
                "filename": "players.xlsx",
                "file_base64": b64_xlsx,
            }),
            content_type="application/json",
        )
        self.assertEqual(xlsx_res.status_code, 200)
        xlsx_data = xlsx_res.json()
        self.assertEqual(len(xlsx_data["players"]), 2)
        self.assertEqual(xlsx_data["players"][0]["name"], "Pato")
        self.assertEqual(xlsx_data["players"][0]["player_class"], "A")
        self.assertEqual(xlsx_data["players"][1]["name"], "Mrefu")
        self.assertEqual(xlsx_data["players"][1]["player_class"], "B")

    def test_balanced_competition_fixtures_and_specific_voting(self):
        # Create a new balanced Cup competition with generated group fixtures & knockout bracket
        state_payload = {
            "activeCategory": "weekend-balanced-cup",
            "categories": {
                "open": build_real_open_season_dict(),
                "weekend-balanced-cup": {
                    "label": "Weekend Balanced Cup",
                    "mode": "cup",
                    "format": "knockout",
                    "teams": [
                        {
                            "id": "WAK",
                            "name": "Wakanda FC",
                            "color": "#C9A227",
                            "players": [
                                {"id": "WAK-UNK", "name": "Unrecorded scorer", "unknown": True},
                                {"id": "WAK-P1", "name": "CupStarGK", "username": "cupstargk", "position": "GK"},
                                {"id": "WAK-P2", "name": "CupStarCB", "username": "cupstarcb", "position": "CB"},
                            ],
                        },
                        {
                            "id": "MAN",
                            "name": "Mancheli FC",
                            "color": "#2E8B57",
                            "players": [
                                {"id": "MAN-UNK", "name": "Unrecorded scorer", "unknown": True},
                                {"id": "MAN-P1", "name": "CupStarST", "username": "cupstarst", "position": "ST"},
                                {"id": "MAN-P2", "name": "CupStarCM", "username": "cupstarcm", "position": "CM"},
                            ],
                        },
                    ],
                    "groupLetters": ["A"],
                    "groupOf": {"WAK": "A", "MAN": "A"},
                    "groupFixtures": {
                        "A": [
                            {
                                "id": "GF-A-1",
                                "round": 1,
                                "group": "A",
                                "date": "Sat, 18 Apr · 15:00",
                                "home": "WAK",
                                "away": "MAN",
                                "played": False,
                                "walkover": None,
                                "referee": "",
                                "events": [],
                            }
                        ]
                    },
                    "fixtures": [
                        {
                            "id": "GF-A-1",
                            "round": 1,
                            "group": "A",
                            "date": "Sat, 18 Apr · 15:00",
                            "home": "WAK",
                            "away": "MAN",
                            "played": False,
                            "walkover": None,
                            "referee": "",
                            "events": [],
                        }
                    ],
                    "rounds": [
                        [
                            {
                                "id": "CUP-R1-T1",
                                "stage": "Grand Final",
                                "date": "Sun, 26 Apr · 15:00",
                                "home": "WAK",
                                "away": "MAN",
                                "match": {"played": False, "events": []},
                                "pen": {"h": "", "a": ""},
                            }
                        ]
                    ],
                    "votingConfig": {"team_size": 5, "max_picks_per_position": 2, "include_gk": True},
                },
            },
        }
        import_state_to_db(state_payload)

        cup_cat = Category.objects.get(key="weekend-balanced-cup")
        state_dict = cup_cat.to_state_dict()
        self.assertEqual(len(state_dict["fixtures"]), 2)
        self.assertEqual(state_dict["fixtures"][0]["id"], "GF-A-1")
        self.assertEqual(state_dict["fixtures"][1]["id"], "CUP-R1-T1")

        # Verify VotingRound was automatically created for the new balanced Cup competition
        vote_res = self.client.get(
            reverse("tournaments:api_category_voting", kwargs={"key": "weekend-balanced-cup"})
        )
        self.assertEqual(vote_res.status_code, 200)
        vote_data = vote_res.json()
        self.assertTrue(vote_data["round"]["is_open"])

        # Log in as the Cup player WAK-P1 ("cupstargk")
        login_res = self.client.post(
            reverse("tournaments:api_auth_player_login"),
            data=json.dumps({
                "username": "cupstargk",
                "password": "titans2026",
            }),
            content_type="application/json",
        )
        self.assertEqual(login_res.status_code, 200)
        cup_player_token = login_res.json()["token"]
        self.assertEqual(login_res.json()["player"]["category_key"], "weekend-balanced-cup")

        # Cup player can vote in their own competition ("weekend-balanced-cup")
        cup_vote_post = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "weekend-balanced-cup"}),
            data=json.dumps({
                "votes": {"GK": ["WAK-P1"], "ST": ["MAN-P1"]},
            }),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=cup_player_token,
        )
        self.assertEqual(cup_vote_post.status_code, 200)
        self.assertTrue(cup_vote_post.json()["success"])

        # Cup player WAK-P1 is blocked from voting in the "open" League competition they do not play in
        wrong_cat_post = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "open"}),
            data=json.dumps({
                "votes": {"ST": ["SS-P1"]},
            }),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=cup_player_token,
        )
        self.assertEqual(wrong_cat_post.status_code, 400)
        self.assertIn("registered in", wrong_cat_post.json()["error"])

    def test_competition_referees_and_soft_delete_restore(self):
        """
        Verify:
        1. Referees pool and fixture referee assignments (both group and knockout) persist in DB.
        2. Soft-deleting a competition moves it to deletedCategories (is_deleted=True) while preserving
           all teams, players, and fixtures.
        3. Restoring a soft-deleted competition returns it to active categories (is_deleted=False).
        """
        state_payload = {
            "activeCategory": "open",
            "categories": {
                "open": {
                    "label": "Open League",
                    "mode": "league",
                    "format": "double",
                    "teams": [
                        {
                            "id": "SS",
                            "name": "Super Strikers",
                            "color": "#B23A2E",
                            "players": [{"id": "SS-P1", "name": "Jimmy", "position": "ST"}],
                        },
                        {
                            "id": "OXF",
                            "name": "Oxford",
                            "color": "#2E5A8F",
                            "players": [{"id": "OXF-P1", "name": "Pato", "position": "ST"}],
                        },
                    ],
                    "referees": ["Ref Kamau", "Ref Otieno"],
                    "fixtures": [
                        {
                            "id": "F1",
                            "round": 1,
                            "date": "Sat · 15:00",
                            "home": "SS",
                            "away": "OXF",
                            "played": False,
                            "referee": "Ref Otieno",
                            "events": [],
                        }
                    ],
                },
                "test-cup": {
                    "label": "Test Cup 2026",
                    "mode": "cup",
                    "format": "knockout",
                    "teams": [
                        {
                            "id": "WAK",
                            "name": "Wakanda FC",
                            "color": "#C9A227",
                            "players": [{"id": "WAK-P1", "name": "Alpha", "position": "GK"}],
                        },
                        {
                            "id": "MAN",
                            "name": "Mancheli FC",
                            "color": "#2E5A8F",
                            "players": [{"id": "MAN-P1", "name": "Bravo", "position": "ST"}],
                        },
                    ],
                    "referees": ["Ref Njoroge", "Ref Mwangi"],
                    "fixtures": [],
                    "rounds": [
                        [
                            {
                                "id": "CUP-R1-T1",
                                "stage": "Grand Final",
                                "date": "Sun · 15:00",
                                "home": "WAK",
                                "away": "MAN",
                                "referee": "Ref Mwangi",
                                "match": {"played": False, "events": [], "referee": "Ref Mwangi"},
                                "pen": {"h": "", "a": ""},
                            }
                        ]
                    ],
                },
            },
        }
        import_state_to_db(state_payload)

        exported = export_state_from_db()
        self.assertIn("open", exported["categories"])
        self.assertIn("test-cup", exported["categories"])
        self.assertEqual(exported["categories"]["open"]["referees"], ["Ref Kamau", "Ref Otieno"])
        self.assertEqual(exported["categories"]["open"]["fixtures"][0]["referee"], "Ref Otieno")
        self.assertEqual(exported["categories"]["test-cup"]["referees"], ["Ref Njoroge", "Ref Mwangi"])
        self.assertEqual(exported["categories"]["test-cup"]["fixtures"][0]["referee"], "Ref Mwangi")

        # Now soft-delete "test-cup" by moving it to deletedCategories
        soft_deleted_cup = dict(exported["categories"]["test-cup"])
        soft_deleted_cup["isDeleted"] = True
        soft_delete_payload = {
            "activeCategory": "open",
            "categories": {
                "open": exported["categories"]["open"],
            },
            "deletedCategories": {
                "test-cup": soft_deleted_cup,
            },
        }
        import_state_to_db(soft_delete_payload)

        cup_db = Category.objects.get(key="test-cup")
        self.assertTrue(cup_db.is_deleted)
        self.assertIsNotNone(cup_db.deleted_at)
        # Teams and fixtures remain intact in the DB
        self.assertEqual(cup_db.teams.count(), 2)
        self.assertEqual(cup_db.fixtures.count(), 1)

        exported_after_del = export_state_from_db()
        self.assertNotIn("test-cup", exported_after_del["categories"])
        self.assertIn("test-cup", exported_after_del["deletedCategories"])

        # Restore "test-cup" back to active categories
        restored_cup = dict(exported_after_del["deletedCategories"]["test-cup"])
        restored_cup["isDeleted"] = False
        restore_payload = {
            "activeCategory": "test-cup",
            "categories": {
                "open": exported_after_del["categories"]["open"],
                "test-cup": restored_cup,
            },
            "deletedCategories": {},
        }
        import_state_to_db(restore_payload)

        cup_db.refresh_from_db()
        self.assertFalse(cup_db.is_deleted)
        self.assertIsNone(cup_db.deleted_at)
        exported_after_restore = export_state_from_db()
        self.assertIn("test-cup", exported_after_restore["categories"])
        self.assertNotIn("test-cup", exported_after_restore["deletedCategories"])


class DisciplineAndSchedulingTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(
            key="discipline-league",
            label="Discipline League",
            mode="league",
            format="single",
            schedule={
                "days": ["Mon", "Wed", "Sat"],
                "time": "16:00",
                "matches_per_day": 2,
            },
        )
        self.team_a = Team.objects.create(category=self.category, team_id="TA", name="Titans Alpha", color="#C9A227")
        self.team_b = Team.objects.create(category=self.category, team_id="TB", name="Titans Beta", color="#2E8B57")
        self.team_c = Team.objects.create(category=self.category, team_id="TC", name="Titans Gamma", color="#2563EB")

        self.player_a1 = Player.objects.create(team=self.team_a, player_id="TA-P1", name="Alpha Striker", position="ST")
        self.player_a2 = Player.objects.create(team=self.team_a, player_id="TA-P2", name="Alpha Playmaker", position="CM")
        self.player_b1 = Player.objects.create(team=self.team_b, player_id="TB-P1", name="Beta Defender", position="CB")
        self.player_c1 = Player.objects.create(team=self.team_c, player_id="TC-P1", name="Gamma Sideline", position="LW")

    def test_goal_with_assist_penalty_owngoal_and_interference(self):
        fix = Fixture.objects.create(
            category=self.category,
            fixture_id="FIX-TEST-EVENTS",
            round_index=1,
            home_team=self.team_a,
            away_team=self.team_b,
            played=True,
            date="Mon · 16:00",
        )
        # Goal with assist
        g1 = MatchEvent.objects.create(
            fixture=fix,
            team=self.team_a,
            player=self.player_a1,
            assist_player=self.player_a2,
            event_type="goal",
            order=1,
        )
        # Penalty goal
        g2 = MatchEvent.objects.create(
            fixture=fix,
            team=self.team_a,
            player=self.player_a1,
            event_type="goal",
            is_penalty=True,
            order=2,
        )
        # Own goal
        og = MatchEvent.objects.create(
            fixture=fix,
            team=self.team_b,
            player=self.player_b1,
            event_type="owngoal",
            order=3,
        )
        # Sideline interference booking by player from Team C during Team A vs Team B match
        interf_card = MatchEvent.objects.create(
            fixture=fix,
            team=self.team_c,
            player=self.player_c1,
            event_type="yellow",
            is_interference=True,
            order=4,
        )

        d1 = g1.to_dict()
        self.assertEqual(d1["assistPlayerId"], "TA-P2")
        self.assertEqual(d1["assistPlayer"], "Alpha Playmaker")

        d2 = g2.to_dict()
        self.assertTrue(d2["is_penalty"])
        self.assertTrue(d2["penalty"])

        d_og = og.to_dict()
        self.assertEqual(d_og["type"], "owngoal")

        d_interf = interf_card.to_dict()
        self.assertTrue(d_interf["is_interference"])
        self.assertTrue(d_interf["interference"])
        self.assertEqual(d_interf["team"], "TC")

    def test_four_yellow_card_accumulation_suspends_player(self):
        # 4 consecutive fixtures where player_a1 gets a yellow card
        f1 = Fixture.objects.create(category=self.category, fixture_id="F-1", round_index=1, home_team=self.team_a, away_team=self.team_b, played=True)
        MatchEvent.objects.create(fixture=f1, team=self.team_a, player=self.player_a1, event_type="yellow", order=1)

        f2 = Fixture.objects.create(category=self.category, fixture_id="F-2", round_index=2, home_team=self.team_c, away_team=self.team_a, played=True)
        MatchEvent.objects.create(fixture=f2, team=self.team_a, player=self.player_a1, event_type="yellow", order=1)

        f3 = Fixture.objects.create(category=self.category, fixture_id="F-3", round_index=3, home_team=self.team_a, away_team=self.team_b, played=True)
        MatchEvent.objects.create(fixture=f3, team=self.team_a, player=self.player_a1, event_type="yellow", order=1)

        f4 = Fixture.objects.create(category=self.category, fixture_id="F-4", round_index=4, home_team=self.team_c, away_team=self.team_a, played=True)
        MatchEvent.objects.create(fixture=f4, team=self.team_a, player=self.player_a1, event_type="yellow", order=1)

        # Fixture 5 is upcoming (unplayed) for Team A
        f5 = Fixture.objects.create(category=self.category, fixture_id="F-5", round_index=5, home_team=self.team_a, away_team=self.team_b, played=False)

        # Fixture 6 is also upcoming for Team A
        f6 = Fixture.objects.create(category=self.category, fixture_id="F-6", round_index=6, home_team=self.team_a, away_team=self.team_c, played=False)

        suspensions = compute_category_suspensions(self.category)
        self.assertIn("F-5", suspensions)
        f5_suspended = [s["playerId"] for s in suspensions["F-5"]]
        self.assertIn("TA-P1", f5_suspended)
        self.assertIn("4 Yellow Cards", suspensions["F-5"][0]["reason"])

        # Once served in F-5, player is no longer suspended in F-6
        f6_suspended = [s["playerId"] for s in suspensions.get("F-6", [])]
        self.assertNotIn("TA-P1", f6_suspended)

    def test_red_card_misses_next_match(self):
        f1 = Fixture.objects.create(category=self.category, fixture_id="RED-1", round_index=1, home_team=self.team_b, away_team=self.team_a, played=True)
        MatchEvent.objects.create(fixture=f1, team=self.team_b, player=self.player_b1, event_type="red", order=1)

        # Next match for Team B
        f2 = Fixture.objects.create(category=self.category, fixture_id="RED-2", round_index=2, home_team=self.team_c, away_team=self.team_b, played=False)

        suspensions = compute_category_suspensions(self.category)
        self.assertIn("RED-2", suspensions)
        f2_suspended = [s["playerId"] for s in suspensions["RED-2"]]
        self.assertIn("TB-P1", f2_suspended)
        self.assertIn("Red Card", suspensions["RED-2"][0]["reason"])

    def test_sideline_interference_suspends_player_in_actual_team_fixture(self):
        # Match is between Team A and Team B
        f_ab = Fixture.objects.create(
            category=self.category,
            fixture_id="INT-1",
            round_index=1,
            home_team=self.team_a,
            away_team=self.team_b,
            played=True,
        )
        # Player from Team C interferes from the sidelines and receives a red card!
        MatchEvent.objects.create(
            fixture=f_ab,
            team=self.team_c,
            player=self.player_c1,
            event_type="red",
            is_interference=True,
            order=1,
        )

        # Team A plays Team B again in INT-2 (Team C is not playing)
        f_ab_next = Fixture.objects.create(
            category=self.category,
            fixture_id="INT-2",
            round_index=2,
            home_team=self.team_b,
            away_team=self.team_a,
            played=False,
        )

        # Team C plays their actual next match in INT-3
        f_c_next = Fixture.objects.create(
            category=self.category,
            fixture_id="INT-3",
            round_index=3,
            home_team=self.team_c,
            away_team=self.team_a,
            played=False,
        )

        suspensions = compute_category_suspensions(self.category)

        # INT-2 is between A and B, so player_c1 should NOT be listed as suspended in INT-2
        int2_suspended = [s["playerId"] for s in suspensions.get("INT-2", [])]
        self.assertNotIn("TC-P1", int2_suspended)

        # INT-3 is Team C's next match, so player_c1 MUST be suspended in INT-3!
        self.assertIn("INT-3", suspensions)
        int3_suspended = [s["playerId"] for s in suspensions["INT-3"]]
        self.assertIn("TC-P1", int3_suspended)
        self.assertTrue(suspensions["INT-3"][0]["interference"])
        self.assertIn("Interference", suspensions["INT-3"][0]["reason"])

    def test_schedule_settings_persistence(self):
        schedule_data = {
            "days": ["Tue", "Thu", "Sun"],
            "time": "15:30",
            "matches_per_day": 4,
        }
        self.category.schedule = schedule_data
        self.category.save()

        exported = export_state_from_db()
        cat_exported = exported["categories"]["discipline-league"]
        self.assertEqual(cat_exported["schedule"]["days"], ["Tue", "Thu", "Sun"])
        self.assertEqual(cat_exported["schedule"]["time"], "15:30")
        self.assertEqual(cat_exported["schedule"]["matches_per_day"], 4)

        # Re-import and check persistence
        import_state_to_db(exported)
        self.category.refresh_from_db()
        self.assertEqual(self.category.schedule["days"], ["Tue", "Thu", "Sun"])
        self.assertEqual(self.category.schedule["time"], "15:30")
        self.assertEqual(self.category.schedule["matches_per_day"], 4)


class TeamAnalyticsAPITests(TestCase):
    def setUp(self):
        self.client = Client()
        self.category = Category.objects.create(
            key="open-analytics",
            label="Open Analytics League",
            mode="league",
        )
        self.team1 = Team.objects.create(category=self.category, team_id="T1", name="Alpha Titans", color="#C9A227")
        self.team2 = Team.objects.create(category=self.category, team_id="T2", name="Beta Titans", color="#2E5A8F")

        self.p1 = Player.objects.create(team=self.team1, player_id="T1-P1", name="Alpha Striker", position="ST")
        self.p2 = Player.objects.create(team=self.team2, player_id="T2-P1", name="Beta Keeper", position="GK")

        # Played fixture
        self.f1 = Fixture.objects.create(
            category=self.category,
            fixture_id="AN-1",
            round_index=1,
            home_team=self.team1,
            away_team=self.team2,
            played=True,
            date="2026-10-10",
        )
        MatchEvent.objects.create(fixture=self.f1, team=self.team1, player=self.p1, event_type="goal", order=1)

        # Upcoming fixture
        self.f2 = Fixture.objects.create(
            category=self.category,
            fixture_id="AN-2",
            round_index=2,
            home_team=self.team2,
            away_team=self.team1,
            played=False,
            date="2026-10-17",
        )

    def test_team_analytics_api_endpoint(self):
        url = reverse("tournaments:api_team_analytics", kwargs={"key": "open-analytics", "team_id": "T1"})
        res = self.client.get(url)
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(data["team"]["id"], "T1")
        self.assertEqual(data["team"]["name"], "Alpha Titans")
        self.assertEqual(len(data["roster"]), 1)
        self.assertEqual(data["roster"][0]["goals"], 1)

        # Last 20 matches contains AN-1
        self.assertEqual(len(data["last20_matches"]), 1)
        self.assertEqual(data["last20_matches"][0]["result"], "W")
        self.assertEqual(data["last20_matches"][0]["team_score"], 1)

        # Next 5 fixtures contains AN-2
        self.assertEqual(len(data["next5_fixtures"]), 1)
        self.assertEqual(data["next5_fixtures"][0]["fixture_id"], "AN-2")

        # Form metrics
        self.assertEqual(data["form"]["badges"], ["W"])
        self.assertEqual(data["form"]["points_last_5"], 3)
        self.assertEqual(data["form"]["win_rate"], 100.0)
        self.assertEqual(data["form"]["clean_sheets"], 1)

        # Projections
        self.assertEqual(data["tournament_projections"]["mode"], "league")
        self.assertFalse(data["tournament_projections"]["mathematically_eliminated"])

    def test_team_analytics_not_found(self):
        url = reverse("tournaments:api_team_analytics", kwargs={"key": "open-analytics", "team_id": "NON-EXISTENT"})
        res = self.client.get(url)
        self.assertEqual(res.status_code, 404)


class PlayerManagementAndJerseyTests(TestCase):
    def setUp(self):
        self.client = Client()
        self.category = Category.objects.create(
            key="test-league",
            label="Test League",
            mode="league",
        )
        self.team = Team.objects.create(
            category=self.category,
            team_id="TL1",
            name="Test Titans",
            color="#22C55E",
        )
        self.player = Player.objects.create(
            team=self.team,
            player_id="TL1-P1",
            name="Victor Wanyama",
            username="victor_wanyama",
            position="CDM",
            jersey_number=67,
            password="titans_secret",
            is_active=True,
        )

    def test_registration_requires_mandatory_jersey_number(self):
        url = reverse("tournaments:api_admin_players_register")
        # 1. Missing jersey number should fail
        res_fail = self.client.post(
            url,
            data=json.dumps({
                "category_key": "test-league",
                "team_id": "TL1",
                "name": "Michael Olunga",
                "position": "ST",
            }),
            content_type="application/json",
        )
        self.assertEqual(res_fail.status_code, 400)
        self.assertIn("mandatory", res_fail.json()["error"].lower())

        # 2. Duplicate jersey number on same team should fail
        res_dup = self.client.post(
            url,
            data=json.dumps({
                "category_key": "test-league",
                "team_id": "TL1",
                "name": "Duplicate Number Player",
                "position": "ST",
                "jersey_number": 67,
            }),
            content_type="application/json",
        )
        self.assertEqual(res_dup.status_code, 400)
        self.assertIn("already assigned", res_dup.json()["error"].lower())

        # 3. Valid unique jersey number succeeds
        res_ok = self.client.post(
            url,
            data=json.dumps({
                "category_key": "test-league",
                "team_id": "TL1",
                "name": "Michael Olunga",
                "position": "ST",
                "jersey_number": 14,
            }),
            content_type="application/json",
        )
        self.assertEqual(res_ok.status_code, 201)
        data = res_ok.json()
        self.assertEqual(data["player"]["jerseyNumber"], 14)
        self.assertEqual(len(data["code"]), 4)

    def test_search_player_by_jersey_number(self):
        url = reverse("tournaments:api_player_lookup")
        # Search by jersey number 67
        res = self.client.get(f"{url}?name=67")
        self.assertEqual(res.status_code, 200)
        results = res.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "Victor Wanyama")
        self.assertEqual(results[0]["username"], "victor_wanyama")
        self.assertEqual(results[0]["jersey_number"], 67)

    def test_reset_password_using_jersey_number(self):
        url = reverse("tournaments:api_admin_players_reset_password")
        # Admin inputs jersey number "67"
        res = self.client.post(
            url,
            data=json.dumps({
                "category_key": "test-league",
                "team_id": "TL1",
                "username": "67",
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["username"], "victor_wanyama")
        self.assertEqual(len(data["code"]), 4)

        # Player must change password on login with new code
        self.player.refresh_from_db()
        self.assertTrue(self.player.must_change_password)
        self.assertEqual(self.player.temp_code, data["code"])

    def test_toggle_player_status_disable_and_enable(self):
        toggle_url = reverse("tournaments:api_admin_players_toggle_status")
        login_url = reverse("tournaments:api_auth_player_login")

        # 1. Disable account
        res_dis = self.client.post(
            toggle_url,
            data=json.dumps({
                "player_id": "TL1-P1",
                "is_active": False,
            }),
            content_type="application/json",
        )
        self.assertEqual(res_dis.status_code, 200)
        self.assertFalse(res_dis.json()["is_active"])

        self.player.refresh_from_db()
        self.assertFalse(self.player.is_active)

        # 2. Disabled account cannot authenticate
        res_login = self.client.post(
            login_url,
            data=json.dumps({
                "username": "victor_wanyama",
                "password": "titans_secret",
            }),
            content_type="application/json",
        )
        self.assertEqual(res_login.status_code, 401)
        self.assertIn("disabled", res_login.json()["error"].lower())

        # 3. Re-enable account
        res_en = self.client.post(
            toggle_url,
            data=json.dumps({
                "player_id": "TL1-P1",
                "is_active": True,
            }),
            content_type="application/json",
        )
        self.assertEqual(res_en.status_code, 200)
        self.assertTrue(res_en.json()["is_active"])

        self.player.refresh_from_db()
        self.assertTrue(self.player.is_active)

    def test_release_jersey_number_from_player(self):
        url = reverse("tournaments:api_admin_players_release_number")
        self.assertEqual(self.player.jersey_number, 67)

        res = self.client.post(
            url,
            data=json.dumps({
                "player_id": "TL1-P1",
                "team_id": "TL1",
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["released_number"], 67)

        self.player.refresh_from_db()
        self.assertIsNone(self.player.jersey_number)

    def test_first_time_login_and_change_password_with_token(self):
        # 1. Reset password generates 4-digit code and flags must_change_password=True
        reset_url = reverse("tournaments:api_admin_players_reset_password")
        res_reset = self.client.post(
            reset_url,
            data=json.dumps({"username": "victor_wanyama"}),
            content_type="application/json",
        )
        self.assertEqual(res_reset.status_code, 200)
        temp_code = res_reset.json()["code"]

        # 2. Player logs in with 4-digit code
        login_url = reverse("tournaments:api_auth_player_login")
        res_login = self.client.post(
            login_url,
            data=json.dumps({
                "username": "victor_wanyama",
                "password": temp_code,
            }),
            content_type="application/json",
        )
        self.assertEqual(res_login.status_code, 200)
        login_data = res_login.json()
        self.assertTrue(login_data["player"]["must_change_password"])
        token = login_data["token"]

        # 3. Player changes password while authenticated with token
        change_pw_url = reverse("tournaments:api_auth_player_change_password")
        res_change = self.client.post(
            change_pw_url,
            data=json.dumps({
                "username": "victor_wanyama",
                "current_code": temp_code,
                "new_password": "permanentPassword2026",
            }),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=token,
        )
        self.assertEqual(res_change.status_code, 200)
        self.assertFalse(res_change.json()["player"]["must_change_password"])

        # 4. Player can now log in with permanent password
        res_login_perm = self.client.post(
            login_url,
            data=json.dumps({
                "username": "victor_wanyama",
                "password": "permanentPassword2026",
            }),
            content_type="application/json",
        )
        self.assertEqual(res_login_perm.status_code, 200)
        self.assertFalse(res_login_perm.json()["player"]["must_change_password"])

    def test_player_cannot_vote_twice_in_same_week_and_can_vote_next_week(self):
        from tournaments.services import get_or_create_active_voting_round, admin_toggle_voting_round
        w1_round = get_or_create_active_voting_round(self.category)
        p2 = Player.objects.create(team=self.team, player_id="TL1-P2", name="McDonald Mariga", position="CDM", jersey_number=17)

        # 1. Login as player
        login_res = self.client.post(
            reverse("tournaments:api_auth_player_login"),
            data=json.dumps({
                "username": self.player.username,
                "password": "titans_secret",
                "category_key": self.category.key,
            }),
            content_type="application/json",
        )
        self.assertEqual(login_res.status_code, 200)
        token = login_res.json()["token"]

        # 2. Player casts first vote in Week 1 -> Success
        vote1_res = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": self.category.key}),
            data=json.dumps({
                "round_id": w1_round.id,
                "votes": {
                    "CDM": self.player.player_id,
                },
            }),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=token,
        )
        self.assertEqual(vote1_res.status_code, 200)
        self.assertTrue(vote1_res.json()["success"])
        self.assertTrue(vote1_res.json()["has_voted"])

        # 3. Player attempts to vote a second time in Week 1 -> Rejected with error
        vote2_res = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": self.category.key}),
            data=json.dumps({
                "round_id": w1_round.id,
                "votes": {
                    "CDM": p2.player_id,
                },
            }),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=token,
        )
        self.assertEqual(vote2_res.status_code, 400)
        self.assertIn("already submitted", vote2_res.json()["error"])

        # 4. GET voting data returns has_voted = True for Week 1
        data_res = self.client.get(
            reverse("tournaments:api_category_voting", kwargs={"key": self.category.key}) + f"?voter_id={self.player.player_id}",
        )
        self.assertEqual(data_res.status_code, 200)
        v_payload = data_res.json()
        self.assertTrue(v_payload["has_voted"])
        self.assertIn(w1_round.id, v_payload["voted_round_ids"])

        # 5. Admin creates Week 2 (another week)
        w2_round = admin_toggle_voting_round(self.category, create_new=True, title="Week 2")

        # 6. GET voting data for Week 2 shows has_voted = False
        data_w2_res = self.client.get(
            reverse("tournaments:api_category_voting", kwargs={"key": self.category.key}) + f"?voter_id={self.player.player_id}&round_id={w2_round.id}",
        )
        self.assertEqual(data_w2_res.status_code, 200)
        self.assertFalse(data_w2_res.json()["has_voted"])

        # 7. Player can now cast vote in Week 2 -> Success
        vote_w2_res = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": self.category.key}),
            data=json.dumps({
                "round_id": w2_round.id,
                "votes": {
                    "CDM": p2.player_id,
                },
            }),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=token,
        )
        self.assertEqual(vote_w2_res.status_code, 200)
        self.assertTrue(vote_w2_res.json()["has_voted"])


class HighlightsAPITests(TestCase):
    def setUp(self):
        self.client = Client()
        self.category = Category.objects.create(
            key="aug-league",
            label="August League",
            mode="league",
        )

    def test_highlights_crud(self):
        # 1. Create highlight video (YouTube link)
        create_res = self.client.post(
            reverse("tournaments:api_highlights"),
            data=json.dumps({
                "title": "Mancheli vs Super Strikers Title Decider",
                "description": "Epic 2-1 thriller",
                "categoryKey": "aug-league",
                "matchName": "Mancheli vs Super Strikers",
                "matchDate": "23 Aug 2026",
                "videoType": "youtube",
                "videoUrl": "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
                "duration": "08:42",
            }),
            content_type="application/json",
        )
        self.assertEqual(create_res.status_code, 201)
        res_data = create_res.json()
        self.assertTrue(res_data["success"])
        h_id = res_data["highlight"]["id"]
        self.assertEqual(res_data["highlight"]["title"], "Mancheli vs Super Strikers Title Decider")

        # 2. List highlights
        list_res = self.client.get(reverse("tournaments:api_highlights"))
        self.assertEqual(list_res.status_code, 200)
        items = list_res.json()
        self.assertEqual(len(items), 1)

        # 3. Filter by category
        filtered_res = self.client.get(reverse("tournaments:api_highlights") + "?category=aug-league")
        self.assertEqual(len(filtered_res.json()), 1)
        empty_res = self.client.get(reverse("tournaments:api_highlights") + "?category=non-existent")
        self.assertEqual(len(empty_res.json()), 0)

        # 4. Search query
        search_res = self.client.get(reverse("tournaments:api_highlights") + "?q=Mancheli")
        self.assertEqual(len(search_res.json()), 1)

        # 5. Delete highlight
        del_res = self.client.delete(reverse("tournaments:api_highlight_delete", kwargs={"pk": h_id}))
        self.assertEqual(del_res.status_code, 200)
        self.assertTrue(del_res.json()["success"])

        # Check deleted
        list_after = self.client.get(reverse("tournaments:api_highlights"))
        self.assertEqual(len(list_after.json()), 0)


class CategoryArchiveAPITests(TestCase):
    def setUp(self):
        self.client = Client()
        self.category = Category.objects.create(
            key="aug-league-2026",
            label="August 2026 League",
            mode="league",
            is_ended=False,
        )

    def test_toggle_archive_and_champion(self):
        # 1. Initially active
        self.assertFalse(self.category.is_ended)

        # 2. Toggle to ended with champion
        res = self.client.post(
            reverse("tournaments:api_category_toggle_archive", kwargs={"key": self.category.key}),
            data=json.dumps({
                "isEnded": True,
                "championTeam": "Mancheli",
                "runnerUpTeam": "Super Strikers",
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertTrue(data["isEnded"])
        self.assertEqual(data["championTeam"], "Mancheli")

        # 3. Check model state and serialized dictionary
        self.category.refresh_from_db()
        self.assertTrue(self.category.is_ended)
        self.assertEqual(self.category.champion_team, "Mancheli")
        self.assertEqual(self.category.runner_up_team, "Super Strikers")
        self.assertIsNotNone(self.category.ended_at)

        state_dict = self.category.to_state_dict()
        self.assertTrue(state_dict["isEnded"])
        self.assertEqual(state_dict["championTeam"], "Mancheli")
        self.assertEqual(state_dict["runnerUpTeam"], "Super Strikers")

        # 4. Reopen tournament
        res_reopen = self.client.post(
            reverse("tournaments:api_category_toggle_archive", kwargs={"key": self.category.key}),
            data=json.dumps({
                "isEnded": False,
            }),
            content_type="application/json",
        )
        self.assertEqual(res_reopen.status_code, 200)
        self.assertFalse(res_reopen.json()["isEnded"])
        self.category.refresh_from_db()
        self.assertFalse(self.category.is_ended)


class CMSChangePasswordTests(TestCase):
    def setUp(self):
        from django.contrib.auth.models import User
        from tournaments.services import create_signed_token
        self.admin_user = User.objects.create_superuser(
            username="manager_test",
            email="manager@ruirutitans.com",
            password="old_password_123",
        )
        self.cms_token = create_signed_token(
            {"role": "cms", "username": "manager_test", "email": "manager@ruirutitans.com"},
            salt="titans-cms-auth",
        )

    def test_unauthorized_without_manager_credentials(self):
        res = self.client.post(
            reverse("tournaments:api_auth_cms_change_password"),
            data=json.dumps({
                "current_password": "old_password_123",
                "new_password": "new_password_456",
                "confirm_password": "new_password_456",
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 401)
        self.assertIn("Unauthorized", res.json()["error"])

    def test_wrong_current_password(self):
        res = self.client.post(
            reverse("tournaments:api_auth_cms_change_password"),
            data=json.dumps({
                "current_password": "wrong_password",
                "new_password": "new_password_456",
                "confirm_password": "new_password_456",
            }),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("Current manager password is incorrect", res.json()["error"])

    def test_new_password_too_short(self):
        res = self.client.post(
            reverse("tournaments:api_auth_cms_change_password"),
            data=json.dumps({
                "current_password": "old_password_123",
                "new_password": "abc",
                "confirm_password": "abc",
            }),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("at least 4 characters", res.json()["error"])

    def test_new_password_mismatch(self):
        res = self.client.post(
            reverse("tournaments:api_auth_cms_change_password"),
            data=json.dumps({
                "current_password": "old_password_123",
                "new_password": "new_password_456",
                "confirm_password": "different_password",
            }),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(res.status_code, 400)
        self.assertIn("do not match", res.json()["error"])

    def test_successful_password_change(self):
        res = self.client.post(
            reverse("tournaments:api_auth_cms_change_password"),
            data=json.dumps({
                "current_password": "old_password_123",
                "new_password": "new_strong_password_789",
                "confirm_password": "new_strong_password_789",
            }),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["success"])
        self.assertIn("token", data)
        self.assertEqual(data["cms_user"]["username"], "manager_test")

        # Verify old password no longer works
        self.admin_user.refresh_from_db()
        self.assertFalse(self.admin_user.check_password("old_password_123"))
        self.assertTrue(self.admin_user.check_password("new_strong_password_789"))

        # Verify can login with new password
        login_res = self.client.post(
            reverse("tournaments:api_auth_cms_login"),
            data=json.dumps({
                "username": "manager_test",
                "password": "new_strong_password_789",
            }),
            content_type="application/json",
        )
        self.assertEqual(login_res.status_code, 200)
        self.assertTrue(login_res.json()["success"])








