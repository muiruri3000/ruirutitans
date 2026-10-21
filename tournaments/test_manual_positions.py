import json
from django.test import TestCase, Client
from django.contrib.auth.models import User
from tournaments.models import Category, Team, Player
from tournaments.services import (
    ensure_player_default_positions,
    extract_players_from_rows,
    balance_players_into_teams,
    update_player_position_by_admin,
    build_real_open_season_dict,
)


class ManualPlayerPositionTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(key="test-open", label="Test Open")
        self.team = Team.objects.create(category=self.category, team_id="TST", name="Test FC", color="#C9A227")
        self.player_unassigned = Player.objects.create(
            team=self.team,
            player_id="TST-P1",
            name="John Doe",
            username="john_doe",
            position="",
            is_unknown=False,
        )
        self.player_legacy = Player.objects.create(
            team=self.team,
            player_id="TST-P2",
            name="Jane Smith",
            username="jane_smith",
            position="DEF",
            is_unknown=False,
        )
        self.admin_user = User.objects.create_superuser(
            username="admin_test",
            password="admin_password_123",
            email="admin@ruirutitans.com",
        )
        self.client = Client()

    def test_ensure_player_default_positions_does_not_auto_assign(self):
        """
        Verify that ensure_player_default_positions normalizes legacy positions (DEF -> CB)
        but DOES NOT auto-assign tactical positions to unassigned players.
        """
        ensure_player_default_positions(self.category)
        self.player_unassigned.refresh_from_db()
        self.player_legacy.refresh_from_db()

        self.assertEqual(self.player_unassigned.position, "")
        self.assertEqual(self.player_legacy.position, "CB")

    def test_extract_players_from_rows_no_position_defaults_empty(self):
        """
        Verify that importing players from CSV/table without a position column leaves position empty.
        """
        rows = [
            ["Name", "Class"],
            ["Alex Hunter", "A"],
            ["Marcus Rashford", "B"],
        ]
        players = extract_players_from_rows(rows)
        self.assertEqual(len(players), 2)
        for p in players:
            self.assertEqual(p["position"], "")

    def test_balance_players_into_teams_preserves_empty_and_manual_positions(self):
        """
        Verify that balance_players_into_teams retains manual positions and does not force CM.
        """
        players = [
            {"id": "P1", "name": "Player 1", "player_class": "A", "position": "GK"},
            {"id": "P2", "name": "Player 2", "player_class": "A", "position": ""},
            {"id": "P3", "name": "Player 3", "player_class": "B", "position": "ST"},
            {"id": "P4", "name": "Player 4", "player_class": "B", "position": ""},
        ]
        result = balance_players_into_teams(players, players_per_team=2)
        all_balanced_players = []
        for t in result["teams"]:
            all_balanced_players.extend(t["players"])

        p1 = next(p for p in all_balanced_players if p["id"] == "P1")
        p2 = next(p for p in all_balanced_players if p["id"] == "P2")
        self.assertEqual(p1["position"], "GK")
        self.assertEqual(p2["position"], "")

    def test_manual_position_update_service(self):
        """
        Verify update_player_position_by_admin updates position, clears position, and rejects invalid positions.
        """
        # Assign position manually
        updated = update_player_position_by_admin(self.player_unassigned.player_id, position="LB")
        self.assertEqual(updated.position, "LB")
        self.player_unassigned.refresh_from_db()
        self.assertEqual(self.player_unassigned.position, "LB")

        # Clear position manually
        updated_cleared = update_player_position_by_admin(self.player_unassigned.player_id, position="")
        self.assertEqual(updated_cleared.position, "")
        self.player_unassigned.refresh_from_db()
        self.assertEqual(self.player_unassigned.position, "")

        # Reject invalid position
        with self.assertRaises(ValueError):
            update_player_position_by_admin(self.player_unassigned.player_id, position="INVALID_POS")

    def test_admin_update_position_api(self):
        """
        Verify POST /api/admin/players/update-position/ endpoint.
        """
        url = "/api/admin/players/update-position/"

        # Successfully assign position
        resp = self.client.post(
            url,
            data=json.dumps({"player_id": self.player_unassigned.player_id, "position": "CDM"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("position"), "CDM")

        self.player_unassigned.refresh_from_db()
        self.assertEqual(self.player_unassigned.position, "CDM")

        # Successfully clear position
        resp = self.client.post(
            url,
            data=json.dumps({"player_id": self.player_unassigned.player_id, "position": ""}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(data.get("position"), "")

        self.player_unassigned.refresh_from_db()
        self.assertEqual(self.player_unassigned.position, "")

    def test_intelligently_add_players_maintains_balance_without_reshuffle(self):
        """
        Verify that new players added after balancing are intelligently assigned to teams
        to maintain roster sizes and class tier distribution without reshuffling existing players.
        """
        from tournaments.services import intelligently_add_players_to_balanced_teams

        existing_teams = [
            {
                "id": "TEAM-1",
                "name": "Mancheli",
                "players": [
                    {"id": "P1", "name": "Player 1", "player_class": "A", "position": "CB", "skill_points": 3},
                    {"id": "P2", "name": "Player 2", "player_class": "B", "position": "CM", "skill_points": 2},
                    {"id": "P3", "name": "Player 3", "player_class": "C", "position": "", "skill_points": 1},
                ],
                "class_counts": {"A": 1, "B": 1, "C": 1},
                "total_skill_score": 6,
            },
            {
                "id": "TEAM-2",
                "name": "Rangers",
                "players": [
                    {"id": "P4", "name": "Player 4", "player_class": "A", "position": "ST", "skill_points": 3},
                    {"id": "P5", "name": "Player 5", "player_class": "B", "position": "RW", "skill_points": 2},
                    {"id": "P6", "name": "Player 6", "player_class": "C", "position": "", "skill_points": 1},
                ],
                "class_counts": {"A": 1, "B": 1, "C": 1},
                "total_skill_score": 6,
            },
        ]

        # 1. Add single new player
        new_player_1 = [{"id": "P-NEW1", "name": "Late Arrival 1", "player_class": "A", "position": "CM"}]
        res1 = intelligently_add_players_to_balanced_teams(existing_teams, new_player_1)
        self.assertEqual(len(res1["assignments"]), 1)
        assigned_team_id = res1["assignments"][0]["team_id"]

        team1 = next(t for t in res1["teams"] if t["id"] == "TEAM-1")
        team2 = next(t for t in res1["teams"] if t["id"] == "TEAM-2")
        self.assertEqual(len(team1["players"]) + len(team2["players"]), 7)

        # 2. Add second new player of same class A: should go to the other team to equalize sizes and class counts
        new_player_2 = [{"id": "P-NEW2", "name": "Late Arrival 2", "player_class": "A", "position": "LB"}]
        res2 = intelligently_add_players_to_balanced_teams(res1["teams"], new_player_2)
        team1_final = next(t for t in res2["teams"] if t["id"] == "TEAM-1")
        team2_final = next(t for t in res2["teams"] if t["id"] == "TEAM-2")

        # Both teams must now have exactly 4 players and 2 Class A players
        self.assertEqual(len(team1_final["players"]), 4)
        self.assertEqual(len(team2_final["players"]), 4)
        self.assertEqual(team1_final["class_counts"]["A"], 2)
        self.assertEqual(team2_final["class_counts"]["A"], 2)

        # Crucially: original players P1..P6 remain on their original teams
        team1_player_ids = {p["id"] for p in team1_final["players"]}
        team2_player_ids = {p["id"] for p in team2_final["players"]}
        self.assertTrue({"P1", "P2", "P3"}.issubset(team1_player_ids))
        self.assertTrue({"P4", "P5", "P6"}.issubset(team2_player_ids))

    def test_intelligently_add_goalkeeper_prefers_team_without_gk(self):
        """
        Verify that adding a goalkeeper prioritizes candidate teams that currently lack a goalkeeper.
        """
        from tournaments.services import intelligently_add_players_to_balanced_teams

        existing_teams = [
            {
                "id": "TEAM-1",
                "name": "Team With GK",
                "players": [
                    {"id": "P1", "name": "GK Player", "player_class": "B", "position": "GK", "skill_points": 2},
                ],
                "class_counts": {"B": 1},
                "total_skill_score": 2,
            },
            {
                "id": "TEAM-2",
                "name": "Team Without GK",
                "players": [
                    {"id": "P2", "name": "Outfield Player", "player_class": "B", "position": "CM", "skill_points": 2},
                ],
                "class_counts": {"B": 1},
                "total_skill_score": 2,
            },
        ]

        new_gk = [{"id": "P-GK", "name": "New Goalie", "player_class": "B", "position": "GK"}]
        res = intelligently_add_players_to_balanced_teams(existing_teams, new_gk)
        assignment = res["assignments"][0]
        self.assertEqual(assignment["team_id"], "TEAM-2")

    def test_team_balancer_api_add_players_action(self):
        """
        Verify POST /api/team-balancer/ with action='add_players'.
        """
        teams = [
            {
                "id": "TEAM-1",
                "name": "Team 1",
                "players": [{"id": "P1", "name": "P1", "player_class": "A", "position": "", "skill_points": 2}],
                "class_counts": {"A": 1},
                "total_skill_score": 2,
            },
            {
                "id": "TEAM-2",
                "name": "Team 2",
                "players": [{"id": "P2", "name": "P2", "player_class": "A", "position": "", "skill_points": 2}],
                "class_counts": {"A": 1},
                "total_skill_score": 2,
            },
        ]
        new_players = [
            {"name": "New Star", "player_class": "B", "position": "ST"},
        ]

        resp = self.client.post(
            "/api/team-balancer/",
            data=json.dumps({
                "action": "add_players",
                "teams": teams,
                "new_players": new_players,
            }),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("success"))
        self.assertEqual(len(data.get("assignments", [])), 1)
        self.assertEqual(data["assignments"][0]["player"]["name"], "New Star")

