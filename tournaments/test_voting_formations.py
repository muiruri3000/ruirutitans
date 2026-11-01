import json
from django.test import TestCase, Client
from django.contrib.auth.models import User
from tournaments.models import Category, Team, Player, VotingRound, PositionVote
from tournaments.services import (
    get_or_create_active_voting_round,
    submit_voter_ballot,
    compute_team_of_tournament,
    update_voting_formation,
    create_signed_token,
)


class VotingFormationTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(
            key="open",
            label="Open League",
            voting_team_size=6,
            voting_include_gk=True,
        )
        self.team = Team.objects.create(
            category=self.category,
            team_id="TIT",
            name="Ruiru Titans",
            color="#FF9500",
        )
        self.gk = Player.objects.create(team=self.team, player_id="P_GK", name="Keeper Dan", position="GK", is_unknown=False)
        self.cb = Player.objects.create(team=self.team, player_id="P_CB", name="Defender Dan", position="CB", is_unknown=False)
        self.lb = Player.objects.create(team=self.team, player_id="P_LB", name="LeftBack Dan", position="LB", is_unknown=False)
        self.cm = Player.objects.create(team=self.team, player_id="P_CM", name="Mid Dan", position="CM", is_unknown=False)
        self.cdm = Player.objects.create(team=self.team, player_id="P_CDM", name="Pivot Dan", position="CDM", is_unknown=False)
        self.st = Player.objects.create(team=self.team, player_id="P_ST", name="Striker Dan", position="ST", is_unknown=False)

        self.admin_user = User.objects.create_superuser(
            username="admin_formation",
            password="admin_password_123",
            email="admin@ruirutitans.com",
        )
        self.cms_token = create_signed_token(
            {"role": "cms", "username": "admin_formation", "email": "admin@ruirutitans.com"},
            salt="titans-cms-auth",
        )
        self.client = Client()

    def test_totw_pitch_coordinates_default(self):
        """Default TOTW lineup should assign valid x, y coordinates to all players."""
        v_round = get_or_create_active_voting_round(self.category)
        submit_voter_ballot(self.category, v_round.id, "voter_1", "Voter 1", {
            "GK": [self.gk.player_id],
            "CB": [self.cb.player_id],
            "CM": [self.cm.player_id],
            "ST": [self.st.player_id],
        })
        totw = v_round.get_totw()
        self.assertEqual(len(totw), 6)
        for p in totw:
            self.assertIn("x", p)
            self.assertIn("y", p)
            self.assertIsInstance(p["x"], (int, float))
            self.assertIsInstance(p["y"], (int, float))
            self.assertGreaterEqual(p["x"], 0)
            self.assertLessEqual(p["x"], 100)
            self.assertGreaterEqual(p["y"], 0)
            self.assertLessEqual(p["y"], 100)

    def test_tots_pitch_coordinates_default(self):
        """Default TOTS lineup should assign valid x, y coordinates and default formation."""
        v_round = get_or_create_active_voting_round(self.category)
        submit_voter_ballot(self.category, v_round.id, "voter_1", "Voter 1", {
            "GK": [self.gk.player_id],
            "CB": [self.cb.player_id],
            "CM": [self.cm.player_id],
            "ST": [self.st.player_id],
        })
        tott = compute_team_of_tournament(self.category)
        self.assertEqual(len(tott["lineup"]), 6)
        self.assertTrue(tott.get("formation"))
        for p in tott["lineup"]:
            self.assertIn("x", p)
            self.assertIn("y", p)

    def test_admin_update_totw_formation_and_drag_positions(self):
        """Admin can change formation, drag players to custom coordinates, and change positions for TOTW."""
        v_round = get_or_create_active_voting_round(self.category)
        custom_lineup = [
            {"player_id": self.gk.player_id, "player_name": self.gk.name, "position": "GK", "x": 50.0, "y": 88.0, "votes": 5},
            {"player_id": self.cb.player_id, "player_name": self.cb.name, "position": "LB", "x": 25.0, "y": 65.0, "votes": 4}, # Changed position CB -> LB
            {"player_id": self.lb.player_id, "player_name": self.lb.name, "position": "RB", "x": 75.0, "y": 65.0, "votes": 4},
            {"player_id": self.cm.player_id, "player_name": self.cm.name, "position": "CAM", "x": 50.0, "y": 38.0, "votes": 3},
            {"player_id": self.cdm.player_id, "player_name": self.cdm.name, "position": "LW", "x": 22.0, "y": 20.0, "votes": 3},
            {"player_id": self.st.player_id, "player_name": self.st.name, "position": "ST", "x": 52.0, "y": 15.0, "votes": 8},
        ]
        res = update_voting_formation(
            self.category,
            target="totw",
            round_id=v_round.id,
            formation="2-1-2-1 Custom",
            lineup=custom_lineup,
        )
        self.assertEqual(res["formation"], "2-1-2-1 Custom")
        v_round.refresh_from_db()
        totw = v_round.get_totw()
        self.assertEqual(len(totw), 6)
        # Verify custom dragged coordinates and changed position are preserved
        lb_entry = next(p for p in totw if p["player_id"] == self.cb.player_id)
        self.assertEqual(lb_entry["position"], "LB")
        self.assertEqual(lb_entry["x"], 25.0)
        self.assertEqual(lb_entry["y"], 65.0)

        # Reset to automatic votes
        reset_res = update_voting_formation(self.category, target="totw", round_id=v_round.id, reset=True)
        self.assertEqual(reset_res["formation"], "")
        v_round.refresh_from_db()
        self.assertEqual(v_round.custom_lineup, [])

    def test_admin_update_tots_formation_and_positions(self):
        """Admin can change formation, drag players to custom coordinates, and change positions for TOTS."""
        custom_lineup = [
            {"player_id": self.gk.player_id, "player_name": self.gk.name, "position": "GK", "x": 50.0, "y": 90.0, "average_votes": 4.5},
            {"player_id": self.cb.player_id, "player_name": self.cb.name, "position": "CB", "x": 50.0, "y": 70.0, "average_votes": 3.8},
            {"player_id": self.lb.player_id, "player_name": self.lb.name, "position": "LM", "x": 20.0, "y": 45.0, "average_votes": 3.2},
            {"player_id": self.cm.player_id, "player_name": self.cm.name, "position": "CM", "x": 50.0, "y": 45.0, "average_votes": 4.0},
            {"player_id": self.cdm.player_id, "player_name": self.cdm.name, "position": "RM", "x": 80.0, "y": 45.0, "average_votes": 3.1},
            {"player_id": self.st.player_id, "player_name": self.st.name, "position": "ST", "x": 50.0, "y": 18.0, "average_votes": 5.0},
        ]
        res = update_voting_formation(
            self.category,
            target="tots",
            formation="1-3-1 (Midfield Dominance)",
            lineup=custom_lineup,
        )
        self.assertEqual(res["formation"], "1-3-1 (Midfield Dominance)")
        tott = compute_team_of_tournament(self.category)
        self.assertEqual(tott["formation"], "1-3-1 (Midfield Dominance)")
        self.assertEqual(len(tott["lineup"]), 6)
        st_entry = next(p for p in tott["lineup"] if p["player_id"] == self.st.player_id)
        self.assertEqual(st_entry["x"], 50.0)
        self.assertEqual(st_entry["y"], 18.0)

        # Reset TOTS
        update_voting_formation(self.category, target="tots", reset=True)
        self.category.refresh_from_db()
        self.assertEqual(self.category.tots_custom_lineup, [])
        self.assertEqual(self.category.tots_formation, "")

    def test_api_voting_formation_endpoint_auth(self):
        """API endpoint requires CMS Admin authentication."""
        url = f"/api/categories/{self.category.key}/voting/admin/formation/"
        # Unauthenticated request
        res = self.client.post(url, data=json.dumps({"target": "totw"}), content_type="application/json")
        self.assertIn(res.status_code, [401, 403])

        # Authenticated request with CMS token
        v_round = get_or_create_active_voting_round(self.category)
        payload = {
            "target": "totw",
            "round_id": v_round.id,
            "formation": "2-2-1",
            "lineup": [
                {"player_id": self.gk.player_id, "player_name": self.gk.name, "position": "GK", "x": 50, "y": 88},
                {"player_id": self.cb.player_id, "player_name": self.cb.name, "position": "CB", "x": 30, "y": 68},
                {"player_id": self.lb.player_id, "player_name": self.lb.name, "position": "RB", "x": 70, "y": 68},
                {"player_id": self.cm.player_id, "player_name": self.cm.name, "position": "LM", "x": 28, "y": 44},
                {"player_id": self.cdm.player_id, "player_name": self.cdm.name, "position": "RM", "x": 72, "y": 44},
                {"player_id": self.st.player_id, "player_name": self.st.name, "position": "ST", "x": 50, "y": 18},
            ]
        }
        res_auth = self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(res_auth.status_code, 200)
        data = res_auth.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("formation"), "2-2-1")
        self.assertEqual(len(data.get("totw")), 6)
