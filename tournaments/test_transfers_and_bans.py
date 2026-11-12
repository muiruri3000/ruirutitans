from django.test import TestCase, Client
from django.utils import timezone
from django.contrib.auth.models import User
from tournaments.models import Category, Team, Player, TransferRequest, PlayerBan
from tournaments.services import (
    create_signed_token,
    get_cms_user_credential_fingerprint,
    get_player_credential_fingerprint,
    submit_transfer_request,
    action_transfer_request,
    direct_admin_transfer,
    add_free_agent,
    authenticate_player_credentials,
    import_state_to_db,
    toggle_transfer_window,
    create_player_ban,
    lift_player_ban,
)


class TransfersAndBansTestCase(TestCase):
    def setUp(self):
        self.category = Category.objects.create(
            key="test-league",
            label="Test League 2026",
            mode="league",
            transfer_window_open=True,
        )
        self.team_a = Team.objects.create(
            category=self.category,
            team_id="team-alpha",
            name="Alpha FC",
            color="#FF9500",
        )
        self.team_b = Team.objects.create(
            category=self.category,
            team_id="team-bravo",
            name="Bravo Stars",
            color="#30D158",
        )
        self.player = Player.objects.create(
            team=self.team_a,
            player_id="P-ALPHA-01",
            name="John Titan",
            first_name="John",
            surname="Titan",
            username="johntitan",
            position="Forward",
            jersey_number=9,
            is_active=True,
        )
        self.player.set_password("TitanSecret123!")
        self.player.save()

        self.admin = User.objects.create_superuser(
            username="admin_test",
            email="admin@ruirutitans.com",
            password="AdminPassword123!",
            is_staff=True,
            is_superuser=True,
            is_active=True,
        )

        self.client = Client()
        self.cms_token = create_signed_token(
            {
                "role": "cms",
                "username": self.admin.username,
                "_cv": get_cms_user_credential_fingerprint(self.admin),
            },
            salt="titans-cms-auth"
        )
        self.player_token = create_signed_token(
            {
                "role": "player",
                "player_id": self.player.player_id,
                "username": self.player.username,
                "category_key": self.category.key,
                "_cv": get_player_credential_fingerprint(self.player),
            },
            salt="titans-player-auth"
        )

    def test_transfer_window_toggle(self):
        self.assertTrue(self.category.transfer_window_open)
        new_state = toggle_transfer_window(self.category, is_open=False)
        self.assertFalse(new_state)
        self.category.refresh_from_db()
        self.assertFalse(self.category.transfer_window_open)

        # Toggle back
        new_state = toggle_transfer_window(self.category)
        self.assertTrue(new_state)

    def test_player_transfer_workflow_requires_approval(self):
        # 1. Player submits request
        req = submit_transfer_request(
            category=self.category,
            player_id=self.player.player_id,
            to_team_id=self.team_b.team_id,
            reason="Looking for starting striker role",
        )
        self.assertEqual(req.status, "pending")
        self.assertEqual(req.from_team, self.team_a)
        self.assertEqual(req.to_team, self.team_b)

        # Player is STILL on team A before approval
        self.player.refresh_from_db()
        self.assertEqual(self.player.team, self.team_a)

        # 2. Admin approves request
        approved_req = action_transfer_request(
            category=self.category,
            transfer_id=req.id,
            action="approve",
            admin_notes="Approved by titans board",
            admin_username="HeadAdmin",
        )
        self.assertEqual(approved_req.status, "approved")
        self.assertEqual(approved_req.approved_by, "HeadAdmin")

        # Player is NOW officially on team B
        self.player.refresh_from_db()
        self.assertEqual(self.player.team, self.team_b)

    def test_player_transfer_rejection(self):
        req = submit_transfer_request(
            category=self.category,
            player_id=self.player.player_id,
            to_team_id=self.team_b.team_id,
            reason="Transfer request",
        )
        rejected_req = action_transfer_request(
            category=self.category,
            transfer_id=req.id,
            action="reject",
            admin_notes="Squad quota filled",
        )
        self.assertEqual(rejected_req.status, "rejected")
        self.player.refresh_from_db()
        self.assertEqual(self.player.team, self.team_a)

    def test_closed_transfer_window_blocks_requests(self):
        toggle_transfer_window(self.category, is_open=False)
        with self.assertRaises(ValueError):
            submit_transfer_request(
                category=self.category,
                player_id=self.player.player_id,
                to_team_id=self.team_b.team_id,
                reason="Should fail when window closed",
            )

    def test_direct_admin_transfer(self):
        req = direct_admin_transfer(
            category=self.category,
            player_id=self.player.player_id,
            to_team_id=self.team_b.team_id,
            notes="Direct tactical squad balancing",
            admin_username="ChiefAdmin",
        )
        self.assertEqual(req.status, "approved")
        self.player.refresh_from_db()
        self.assertEqual(self.player.team, self.team_b)

    def test_player_disciplinary_bans(self):
        # 1. Create a game-based ban
        ban = create_player_ban(
            category=self.category,
            player_id=self.player.player_id,
            ban_type="games",
            games_banned=3,
            reason="Violent conduct in Matchweek 2",
            expected_fixture_return="Matchweek 6 vs Lions",
            imposed_by="Disciplinary Committee",
        )
        self.assertTrue(ban.is_active)
        self.assertEqual(ban.games_banned, 3)

        # Check player property and serialization
        self.player.refresh_from_db()
        self.assertTrue(self.player.is_banned)
        p_dict = self.player.to_dict()
        self.assertTrue(p_dict.get("isBanned"))
        self.assertIsNotNone(p_dict.get("activeBan"))

        # 2. Lift ban
        lifted = lift_player_ban(self.category, ban.id)
        self.assertFalse(lifted.is_active)
        self.player.refresh_from_db()
        self.assertFalse(self.player.is_banned)

    def test_api_public_and_admin_transfers(self):
        # Public GET
        resp = self.client.get(f"/api/categories/{self.category.key}/transfers/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("transfer_window_open"))
        self.assertEqual(data.get("completed_transfers"), [])

        # Player submit transfer request
        resp = self.client.post(
            f"/api/categories/{self.category.key}/transfers/",
            data={
                "to_team_id": self.team_b.team_id,
                "reason": "Seeking new challenge",
                "transfer_type": "permanent",
            },
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=self.player_token,
        )
        self.assertEqual(resp.status_code, 201)
        transfer_id = resp.json()["transfer"]["id"]

        # Admin approve transfer
        resp = self.client.post(
            f"/api/categories/{self.category.key}/transfers/{transfer_id}/action/",
            data={"action": "approve", "admin_notes": "Welcome to Bravo Stars"},
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["transfer"]["status"], "approved")

        # Now public GET lists the completed transfer
        resp = self.client.get(f"/api/categories/{self.category.key}/transfers/")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data.get("completed_transfers", [])), 1)
        self.assertEqual(data["completed_transfers"][0]["player"]["name"], "John Titan")

    def test_api_disciplinary_bans(self):
        # Admin creates ban
        resp = self.client.post(
            f"/api/categories/{self.category.key}/bans/",
            data={
                "player_id": self.player.player_id,
                "ban_type": "period",
                "period_description": "2 Weeks",
                "reason": "Unsportsmanlike conduct",
                "expected_fixture_return": "Matchweek 4",
            },
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(resp.status_code, 201)
        ban_id = resp.json()["ban"]["id"]

        # Public GET returns active ban
        resp = self.client.get(f"/api/categories/{self.category.key}/bans/")
        self.assertEqual(resp.status_code, 200)
        bans = resp.json().get("active_bans", [])
        self.assertEqual(len(bans), 1)
        self.assertEqual(bans[0]["reason"], "Unsportsmanlike conduct")
        self.assertEqual(bans[0]["expected_fixture_return"], "Matchweek 4")

        # Admin lifts ban
        resp = self.client.post(
            f"/api/categories/{self.category.key}/bans/{ban_id}/lift/",
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json()["ban"]["is_active"])

    def test_add_free_agent_and_move_to_existing_team(self):
        # 1. Admin adds a free agent via API without assigning a team yet
        resp = self.client.post(
            f"/api/categories/{self.category.key}/transfers/free-agents/",
            data={
                "first_name": "Alex",
                "surname": "Kamau",
                "position": "CM",
            },
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["player"]["name"], "Alex Kamau")
        self.assertTrue(body["player"]["isFreeAgent"])
        self.assertIsNone(body["transfer"])
        fa_id = body["player"]["id"]
        self.assertTrue(fa_id.startswith("FA-P"))

        # 2. Public GET /transfers/ includes the free agent in free_agents
        resp = self.client.get(f"/api/categories/{self.category.key}/transfers/")
        self.assertEqual(resp.status_code, 200)
        free_agents = resp.json().get("free_agents", [])
        self.assertEqual(len(free_agents), 1)
        self.assertEqual(free_agents[0]["id"], fa_id)

        # 3. Saving category state preserves unassigned free agents
        state_dict = self.category.to_state_dict()
        self.assertEqual(len(state_dict.get("freeAgents", [])), 1)
        import_state_to_db({"categories": {self.category.key: state_dict}}, soft_delete_missing=False)
        self.assertTrue(Player.objects.filter(category=self.category, player_id=fa_id, team__isnull=True).exists())

        # 4. Admin moves the free agent to team_a via direct transfer
        resp = self.client.post(
            f"/api/categories/{self.category.key}/transfers/direct/",
            data={
                "player_id": fa_id,
                "to_team_id": self.team_a.team_id,
                "transfer_type": "free",
                "notes": "Free agent signed by Alpha FC",
            },
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(resp.status_code, 200)
        t_data = resp.json()["transfer"]
        self.assertEqual(t_data["from_team"]["name"], "Free Agent")
        self.assertIsNone(t_data["from_team"]["id"])
        self.assertEqual(t_data["to_team"]["id"], self.team_a.team_id)
        self.assertEqual(t_data["transfer_type"], "free")

        # Free agent is now on team_a and removed from free_agents pool
        fa_player = Player.objects.get(player_id=fa_id)
        self.assertEqual(fa_player.team, self.team_a)
        resp = self.client.get(f"/api/categories/{self.category.key}/transfers/")
        self.assertEqual(resp.json().get("free_agents", []), [])
        self.assertEqual(len(resp.json().get("completed_transfers", [])), 1)

    def test_add_free_agent_with_immediate_team_move(self):
        resp = self.client.post(
            f"/api/categories/{self.category.key}/transfers/free-agents/",
            data={
                "first_name": "Brian",
                "surname": "Otieno",
                "position": "ST",
                "jersey_number": 11,
                "to_team_id": self.team_b.team_id,
                "notes": "Immediate free agent signing",
            },
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(resp.status_code, 201)
        body = resp.json()
        self.assertEqual(body["player"]["teamId"], self.team_b.team_id)
        self.assertFalse(body["player"]["isFreeAgent"])
        self.assertIsNotNone(body["transfer"])
        self.assertEqual(body["transfer"]["from_team"]["name"], "Free Agent")
        self.assertEqual(body["transfer"]["to_team"]["id"], self.team_b.team_id)
        self.assertEqual(body["transfer"]["transfer_type"], "free")

    def test_free_agent_login_and_transfer_request_to_existing_team(self):
        fa, code, _ = add_free_agent(
            category=self.category,
            first_name="Dennis",
            surname="Mugo",
            position="GK",
        )
        profile, token = authenticate_player_credentials(
            username=fa.username,
            password=code,
            category_key=self.category.key,
        )
        self.assertIsNone(profile["team_id"])
        self.assertEqual(profile["team_name"], "Free Agent")

        # Free agent submits transfer request to team_b
        resp = self.client.post(
            f"/api/categories/{self.category.key}/transfers/",
            data={
                "to_team_id": self.team_b.team_id,
                "reason": "Joining Bravo Stars as free agent",
                "transfer_type": "free",
            },
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=token,
        )
        self.assertEqual(resp.status_code, 201)
        transfer_id = resp.json()["transfer"]["id"]
        self.assertEqual(resp.json()["transfer"]["from_team"]["name"], "Free Agent")

        # Admin approves request -> free agent moves to team_b
        resp = self.client.post(
            f"/api/categories/{self.category.key}/transfers/{transfer_id}/action/",
            data={"action": "approve"},
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(resp.status_code, 200)
        fa.refresh_from_db()
        self.assertEqual(fa.team, self.team_b)

    def test_non_admin_cannot_add_free_agent(self):
        resp = self.client.post(
            f"/api/categories/{self.category.key}/transfers/free-agents/",
            data={"first_name": "Unauthorized", "surname": "Player"},
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=self.player_token,
        )
        self.assertIn(resp.status_code, (401, 403))
