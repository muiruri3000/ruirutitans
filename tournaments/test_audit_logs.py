import json
from django.test import TestCase, Client
from django.contrib.auth.models import User

from tournaments.models import AuditLog, Category, Team, Player, Fixture
from tournaments.services import (
    create_signed_token,
    get_cms_user_credential_fingerprint,
    get_player_credential_fingerprint,
    export_state_from_db,
)


class AuditLogsTestCase(TestCase):
    def setUp(self):
        self.category = Category.objects.create(
            key="open-audit",
            label="Audit League 2026",
            mode="league",
            transfer_window_open=True,
        )
        self.team_a = Team.objects.create(
            category=self.category,
            team_id="RAN",
            name="Rangers",
            color="#3F7A4E",
        )
        self.team_b = Team.objects.create(
            category=self.category,
            team_id="MAN",
            name="Mancheli",
            color="#C9A227",
        )
        self.player = Player.objects.create(
            team=self.team_a,
            category=self.category,
            player_id="RAN-P1",
            name="Brayo",
            first_name="Brayo",
            surname="Titan",
            username="brayo",
            position="CM",
            jersey_number=8,
            is_active=True,
            must_change_password=False,
        )
        self.player.set_password("PlayerPass123!")
        self.player.save()

        self.superadmin = User.objects.create_superuser(
            username="audit_super",
            email="super@ruirutitans.com",
            password="SuperSecret123!",
            is_staff=True,
            is_superuser=True,
            is_active=True,
        )
        self.staff_admin = User.objects.create_user(
            username="coach_john",
            email="john@ruirutitans.com",
            password="CoachSecret123!",
            is_staff=True,
            is_superuser=False,
            is_active=True,
        )

        self.client = Client()
        self.cms_token = create_signed_token(
            {
                "role": "cms",
                "username": self.superadmin.username,
                "_cv": get_cms_user_credential_fingerprint(self.superadmin),
            },
            salt="titans-cms-auth",
        )
        self.staff_token = create_signed_token(
            {
                "role": "cms",
                "username": self.staff_admin.username,
                "_cv": get_cms_user_credential_fingerprint(self.staff_admin),
            },
            salt="titans-cms-auth",
        )
        self.player_token = create_signed_token(
            {
                "role": "player",
                "player_id": self.player.player_id,
                "username": self.player.username,
                "category_key": self.category.key,
                "_cv": get_player_credential_fingerprint(self.player),
            },
            salt="titans-player-auth",
        )

    def test_cms_and_player_logins_create_audit_logs(self):
        # 1. Failed CMS login
        res_fail = self.client.post(
            "/api/auth/cms-login/",
            data=json.dumps({"username": "audit_super", "password": "WrongPassword"}),
            content_type="application/json",
            REMOTE_ADDR="10.10.0.5",
        )
        self.assertEqual(res_fail.status_code, 401)
        fail_log = AuditLog.objects.filter(event_type="login_failed", actor_username="audit_super").first()
        self.assertIsNotNone(fail_log)
        self.assertEqual(fail_log.ip_address, "10.10.0.5")

        # 2. Successful CMS login
        res_ok = self.client.post(
            "/api/auth/cms-login/",
            data=json.dumps({"username": "coach_john", "password": "CoachSecret123!"}),
            content_type="application/json",
            REMOTE_ADDR="10.10.0.8",
        )
        self.assertEqual(res_ok.status_code, 200)
        cms_log = AuditLog.objects.filter(event_type="login", actor_username="coach_john").first()
        self.assertIsNotNone(cms_log)
        self.assertEqual(cms_log.actor_type, "cms")
        self.assertEqual(cms_log.ip_address, "10.10.0.8")
        self.assertIn("coach_john", cms_log.actor_name)

        # 3. Failed Player login
        res_p_fail = self.client.post(
            "/api/auth/player-login/",
            data=json.dumps({"username": "brayo", "password": "WrongPassword"}),
            content_type="application/json",
        )
        self.assertEqual(res_p_fail.status_code, 401)
        p_fail_log = AuditLog.objects.filter(event_type="login_failed", actor_username="brayo").first()
        self.assertIsNotNone(p_fail_log)
        self.assertEqual(p_fail_log.actor_type, "player")

        # 4. Successful Player login
        res_p_ok = self.client.post(
            "/api/auth/player-login/",
            data=json.dumps({"username": "brayo", "password": "PlayerPass123!"}),
            content_type="application/json",
        )
        self.assertEqual(res_p_ok.status_code, 200)
        p_log = AuditLog.objects.filter(event_type="login", actor_username="brayo").first()
        self.assertIsNotNone(p_log)
        self.assertEqual(p_log.actor_type, "player")
        self.assertEqual(p_log.actor_role, "player")
        self.assertIn("Brayo", p_log.actor_name)

    def test_activities_attribute_exact_actor_and_details(self):
        # Staff admin creates a player
        reg_res = self.client.post(
            "/api/admin/players/register/",
            data=json.dumps({
                "name": "Kevin Striker",
                "username": "kevinstriker",
                "team_id": "MAN",
                "category_key": self.category.key,
                "position": "ST",
                "jersey_number": 10,
            }),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.staff_token,
        )
        self.assertEqual(reg_res.status_code, 201)
        reg_log = AuditLog.objects.filter(event_type="player_management", actor_username="coach_john").first()
        self.assertIsNotNone(reg_log)
        self.assertIn("Kevin Striker", reg_log.action)

        # Superadmin issues a disciplinary ban on Brayo, then lifts it
        ban_res = self.client.post(
            f"/api/categories/{self.category.key}/bans/",
            data=json.dumps({
                "player_id": self.player.player_id,
                "ban_type": "games",
                "games_banned": 2,
                "reason": "Two yellows",
            }),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(ban_res.status_code, 201)
        ban_id = ban_res.json()["ban"]["id"]
        ban_log = AuditLog.objects.filter(event_type="ban", actor_username="audit_super").first()
        self.assertIsNotNone(ban_log)
        self.assertIn("Brayo", ban_log.action)

        lift_res = self.client.post(
            f"/api/categories/{self.category.key}/bans/{ban_id}/lift/",
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(lift_res.status_code, 200)
        lift_log = AuditLog.objects.filter(event_type="ban", action__icontains="Lifted").first()
        self.assertIsNotNone(lift_log)
        self.assertEqual(lift_log.actor_username, "audit_super")

        # Player submits a transfer request -> attributed to the player
        tr_res = self.client.post(
            f"/api/categories/{self.category.key}/transfers/",
            data=json.dumps({"to_team_id": "MAN", "reason": "New challenge"}),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=self.player_token,
        )
        self.assertEqual(tr_res.status_code, 201)
        transfer_id = tr_res.json()["transfer"]["id"]
        tr_player_log = AuditLog.objects.filter(event_type="transfer", actor_username="brayo").first()
        self.assertIsNotNone(tr_player_log)
        self.assertEqual(tr_player_log.actor_type, "player")

        # Coach John approves transfer -> attributed to coach_john
        tr_approve_res = self.client.post(
            f"/api/categories/{self.category.key}/transfers/{transfer_id}/action/",
            data=json.dumps({"action": "approve", "admin_notes": "Cleared"}),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.staff_token,
        )
        self.assertEqual(tr_approve_res.status_code, 200)
        tr_admin_log = AuditLog.objects.filter(event_type="transfer", actor_username="coach_john").first()
        self.assertIsNotNone(tr_admin_log)
        self.assertIn("Approved", tr_admin_log.action)

        # Fixture match result update via /api/state/
        Fixture.objects.create(
            category=self.category,
            fixture_id="FX-100",
            phase="league",
            home_team=self.team_a,
            away_team=self.team_b,
            played=False,
        )
        state = export_state_from_db()
        fx_list = state["categories"][self.category.key]["fixtures"]
        fx_list[0]["played"] = True
        fx_list[0]["events"] = [{"team": "RAN", "player": "RAN-P1", "type": "goal", "isPenalty": False}]

        state_res = self.client.post(
            "/api/state/",
            data=json.dumps(state),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.staff_token,
        )
        self.assertEqual(state_res.status_code, 200)
        match_log = AuditLog.objects.filter(event_type="match_update", actor_username="coach_john").first()
        self.assertIsNotNone(match_log)
        self.assertIn("RAN", match_log.action)

    def test_audit_logs_api_endpoint_filters_and_permissions(self):
        # Unauthenticated request denied
        unauth = self.client.get("/api/admin/audit-logs/")
        self.assertIn(unauth.status_code, (401, 403))

        # Trigger a couple events
        self.client.post(
            "/api/auth/cms-login/",
            data=json.dumps({"username": "coach_john", "password": "CoachSecret123!"}),
            content_type="application/json",
        )
        self.client.post(
            f"/api/categories/{self.category.key}/bans/",
            data=json.dumps({"player_id": self.player.player_id, "ban_type": "games", "games_banned": 1, "reason": "Red card"}),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )

        # Fetch all logs as CMS admin
        res_all = self.client.get("/api/admin/audit-logs/", HTTP_X_TITANS_CMS_TOKEN=self.cms_token)
        self.assertEqual(res_all.status_code, 200)
        body = res_all.json()
        self.assertGreaterEqual(body["summary"]["total_count"], 2)
        self.assertGreaterEqual(body["summary"]["logins_count"], 1)
        self.assertGreaterEqual(body["summary"]["activities_count"], 1)

        # Filter by actor
        res_actor = self.client.get(
            "/api/admin/audit-logs/?actor=coach_john",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(res_actor.status_code, 200)
        actor_logs = res_actor.json()["logs"]
        self.assertTrue(len(actor_logs) >= 1)
        self.assertTrue(all(l["actor_username"] == "coach_john" for l in actor_logs))

        # Filter by event_type group 'transfers_bans'
        res_bans = self.client.get(
            "/api/admin/audit-logs/?event_type=transfers_bans&q=Brayo",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(res_bans.status_code, 200)
        ban_logs = res_bans.json()["logs"]
        self.assertEqual(len(ban_logs), 1)
        self.assertEqual(ban_logs[0]["event_type"], "ban")
        self.assertEqual(ban_logs[0]["actor_username"], "audit_super")
