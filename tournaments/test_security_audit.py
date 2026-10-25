import json
from datetime import timedelta
from unittest import mock

from django.test import TestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from django.contrib.auth.models import User
from django.contrib.auth.hashers import identify_hasher, make_password

from tournaments.models import Category, Team, Player, GlobalSettings, HighlightVideo
from tournaments.services import (
    create_signed_token,
    import_state_to_db,
    export_state_from_db,
    register_player_by_admin,
    reset_player_password_by_admin,
    change_player_password,
    authenticate_player_credentials,
)


class SecurityAuditEndpointAuthorizationTests(TestCase):
    def setUp(self):
        # Create standard test category and team
        self.category = Category.objects.create(
            key="open",
            label="Open League",
            mode="league",
            format="double",
            voting_team_size=6,
            voting_max_picks=2,
            voting_include_gk=True,
        )
        self.team = Team.objects.create(category=self.category, team_id="MAN", name="Mancheli", color="#C9A227")
        self.player = Player.objects.create(
            team=self.team,
            player_id="MAN-P1",
            name="Patrick Oduor",
            username="pato",
            jersey_number=10,
            position="ST",
        )
        self.player.set_password("RealPlayerSecret2026!")
        self.player.save()

        # Staff user and tokens
        self.cms_user = User.objects.create_user(
            username="titans_cms_admin",
            password="ManagerAdminPass123!",
            is_staff=True,
            is_active=True,
        )
        self.cms_token = create_signed_token(
            {"role": "cms", "username": "titans_cms_admin"},
            salt="titans-cms-auth",
        )
        self.player_token = create_signed_token(
            {"role": "player", "player_id": "MAN-P1", "username": "pato", "category_key": "open"},
            salt="titans-player-auth",
        )

    def test_unauthenticated_requests_to_protected_endpoints_return_401(self):
        """
        Verify that unauthenticated requests to protected write endpoints return HTTP 401 Unauthorized.
        """
        protected_endpoints = [
            ("post", reverse("tournaments:api_state"), {"categories": {}}),
            ("post", reverse("tournaments:api_reset_season"), {}),
            ("post", reverse("tournaments:api_categories"), {"name": "Test Cat"}),
            ("patch", reverse("tournaments:api_category_detail", kwargs={"key": "open"}), {"label": "New Label"}),
            ("delete", reverse("tournaments:api_category_detail", kwargs={"key": "open"}), {}),
            ("post", reverse("tournaments:api_category_toggle_archive", kwargs={"key": "open"}), {"isEnded": True}),
            ("post", reverse("tournaments:api_category_voting_admin_toggle", kwargs={"key": "open"}), {"is_open": True}),
            ("post", reverse("tournaments:api_admin_players_register"), {"name": "New P", "jersey_number": 7}),
            ("post", reverse("tournaments:api_admin_players_reset_password"), {"username": "pato"}),
            ("post", reverse("tournaments:api_admin_players_toggle_status"), {"player_id": "MAN-P1"}),
            ("post", reverse("tournaments:api_admin_players_release_number"), {"player_id": "MAN-P1"}),
            ("post", reverse("tournaments:api_admin_players_update_position"), {"player_id": "MAN-P1", "position": "MID"}),
            ("post", reverse("tournaments:api_highlights"), {"title": "Highlight 1"}),
            ("post", reverse("tournaments:api_auth_cms_change_password"), {"current_password": "x", "new_password": "y"}),
            ("post", reverse("tournaments:api_team_balancer"), {"raw_text": "Name,Class\nPato,A"}),
        ]

        for method, url, data in protected_endpoints:
            if method == "post":
                res = self.client.post(url, data=json.dumps(data), content_type="application/json")
            elif method == "patch":
                res = self.client.patch(url, data=json.dumps(data), content_type="application/json")
            elif method == "delete":
                res = self.client.delete(url)
            self.assertEqual(
                res.status_code,
                401,
                f"Endpoint {method.upper()} {url} did not return 401 when unauthenticated (got {res.status_code})",
            )
            # Ensure error response is normalized with either detail or error key
            res_json = res.json()
            self.assertTrue(
                "error" in res_json or "detail" in res_json,
                f"Endpoint {url} did not return error or detail key in payload: {res_json}",
            )

    def test_player_token_cannot_access_cms_endpoints(self):
        """
        Verify that an authenticated club player attempting to perform CMS administrative
        actions receives HTTP 403 Forbidden.
        """
        cms_endpoints = [
            ("post", reverse("tournaments:api_state"), {"categories": {}}),
            ("post", reverse("tournaments:api_categories"), {"name": "Hacked Cat"}),
            ("post", reverse("tournaments:api_category_toggle_archive", kwargs={"key": "open"}), {"isEnded": True}),
            ("post", reverse("tournaments:api_category_voting_admin_toggle", kwargs={"key": "open"}), {"is_open": True}),
            ("post", reverse("tournaments:api_admin_players_register"), {"name": "Hacked", "jersey_number": 99}),
            ("post", reverse("tournaments:api_admin_players_reset_password"), {"username": "pato"}),
            ("post", reverse("tournaments:api_admin_players_toggle_status"), {"player_id": "MAN-P1"}),
            ("post", reverse("tournaments:api_admin_players_release_number"), {"player_id": "MAN-P1"}),
            ("post", reverse("tournaments:api_admin_players_update_position"), {"player_id": "MAN-P1", "position": "GK"}),
            ("post", reverse("tournaments:api_highlights"), {"title": "Player Hack"}),
            ("post", reverse("tournaments:api_team_balancer"), {"raw_text": "Name,Class\nPato,A"}),
        ]

        for method, url, data in cms_endpoints:
            res = self.client.post(
                url,
                data=json.dumps(data),
                content_type="application/json",
                HTTP_AUTHORIZATION=f"Bearer {self.player_token}",
            )
            self.assertEqual(
                res.status_code,
                403,
                f"Player token accessed CMS route {url} without 403 Forbidden (got {res.status_code})",
            )

    def test_public_read_endpoints_remain_accessible(self):
        """
        Verify that public read-only endpoints are accessible without any credentials (HTTP 200).
        """
        public_urls = [
            reverse("tournaments:api_state"),
            reverse("tournaments:api_homepage"),
            reverse("tournaments:api_categories"),
            reverse("tournaments:api_category_detail", kwargs={"key": "open"}),
            reverse("tournaments:api_standings", kwargs={"key": "open"}),
            reverse("tournaments:api_category_voting", kwargs={"key": "open"}),
            reverse("tournaments:api_highlights"),
            reverse("tournaments:api_auth_session"),
        ]

        for url in public_urls:
            res = self.client.get(url)
            self.assertEqual(
                res.status_code,
                200,
                f"Public endpoint {url} was not accessible (status {res.status_code})",
            )


class SecurityAuditMutualExclusivityTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(key="open", label="Open")
        self.team = Team.objects.create(category=self.category, team_id="OXF", name="Oxford")
        self.player = Player.objects.create(
            team=self.team,
            player_id="OXF-P1",
            name="Brian Kemboi",
            username="kemboi",
            jersey_number=8,
        )
        self.player.set_password("KemboiSecure2026!")
        self.player.save()

        self.cms_user = User.objects.create_user(
            username="test_manager",
            password="ManagerSecret123!",
            is_staff=True,
        )

    def test_manager_login_clears_player_session(self):
        session = self.client.session
        session["titans_player"] = {"player_id": "OXF-P1", "username": "kemboi"}
        session.save()

        res = self.client.post(
            reverse("tournaments:api_auth_cms_login"),
            data=json.dumps({"username": "test_manager", "password": "ManagerSecret123!"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("titans_player", self.client.session)
        self.assertIn("titans_cms", self.client.session)

    def test_player_login_clears_manager_session(self):
        session = self.client.session
        session["titans_cms"] = {"username": "test_manager", "role": "cms"}
        session.save()

        res = self.client.post(
            reverse("tournaments:api_auth_player_login"),
            data=json.dumps({"username": "kemboi", "password": "KemboiSecure2026!"}),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertNotIn("titans_cms", self.client.session)
        self.assertIn("titans_player", self.client.session)

    def test_auth_session_endpoint_enforces_exclusivity(self):
        session = self.client.session
        session["titans_cms"] = {"username": "test_manager", "role": "cms"}
        session["titans_player"] = {"player_id": "OXF-P1", "username": "kemboi"}
        session.save()

        res = self.client.get(reverse("tournaments:api_auth_session"))
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data["cms_authenticated"])
        self.assertFalse(data["player_authenticated"])
        self.assertIsNone(data["player"])


class SecurityAuditPasswordAndLifecycleTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(key="open", label="Open")
        self.team = Team.objects.create(category=self.category, team_id="SS", name="Super Strikers")

    def test_player_password_stored_as_cryptographic_hash(self):
        """
        Verify player password in database is never stored in plaintext and uses standard PBKDF2.
        """
        p = Player.objects.create(
            team=self.team,
            player_id="SS-P1",
            name="John Doe",
            username="jdoe",
            jersey_number=9,
        )
        p.set_password("MySecretPass123!")
        p.save()

        p.refresh_from_db()
        self.assertNotEqual(p.password, "MySecretPass123!")
        self.assertTrue(p.password.startswith("pbkdf2_"))
        self.assertEqual(identify_hasher(p.password).algorithm, "pbkdf2_sha256")

    def test_legacy_plaintext_password_auto_upgrades_on_successful_authentication(self):
        """
        Verify that legacy plaintext passwords are automatically upgraded to PBKDF2 hash on check.
        """
        p = Player.objects.create(
            team=self.team,
            player_id="SS-P2",
            name="Legacy Player",
            username="legacy_p",
            jersey_number=11,
            password="LegacyPlaintextPassword!",
        )
        # Directly store plaintext in database to simulate legacy database record
        Player.objects.filter(pk=p.pk).update(password="LegacyPlaintextPassword!")
        p.refresh_from_db()
        self.assertEqual(p.password, "LegacyPlaintextPassword!")

        # Authenticate using services
        profile, token = authenticate_player_credentials(
            username="legacy_p",
            password="LegacyPlaintextPassword!",
        )
        self.assertIsNotNone(profile)
        self.assertIsNotNone(token)

        # Database record must now be upgraded to cryptographic hash
        p.refresh_from_db()
        self.assertTrue(p.password.startswith("pbkdf2_"))
        self.assertTrue(p.check_password("LegacyPlaintextPassword!"))

    def test_predictable_fallback_passwords_are_rejected(self):
        """
        Verify that predictable fallback passwords (username, player_id, 'titans2026' when not set)
        are rejected.
        """
        p = Player.objects.create(
            team=self.team,
            player_id="SS-P3",
            name="Target Player",
            username="target_user",
            jersey_number=4,
        )
        p.set_password("ActualSecretPass999!")
        p.save()

        # Reject username as password
        with self.assertRaises(ValueError):
            authenticate_player_credentials(username="target_user", password="target_user")

        # Reject player_id as password
        with self.assertRaises(ValueError):
            authenticate_player_credentials(username="target_user", password="SS-P3")

        # Reject arbitrary incorrect password
        with self.assertRaises(ValueError):
            authenticate_player_credentials(username="target_user", password="titans2026")

    def test_activation_code_single_use_and_invalidation(self):
        """
        Verify that single-use activation codes generated by admin are required for initial setup,
        and are invalidated upon changing password.
        """
        player, code = register_player_by_admin(
            category_key="open",
            team_id="SS",
            name="New Recruit",
            username="recruit1",
            position="MID",
            jersey_number=14,
        )
        self.assertEqual(len(code), 4)
        self.assertTrue(code.isdigit())
        self.assertTrue(player.must_change_password)
        self.assertTrue(player.is_temp_code_valid(code))

        # Successfully change password using the 4-digit code
        profile, token = change_player_password(
            player_or_ident=player,
            new_password="NewPermanentPassword2026!",
            current_code=code,
        )
        self.assertFalse(profile["must_change_password"])

        player.refresh_from_db()
        self.assertEqual(player.temp_code, "")
        self.assertIsNone(player.temp_code_created_at)
        self.assertFalse(player.must_change_password)

        # Reusing the old 4-digit code must fail
        self.assertFalse(player.is_temp_code_valid(code))
        with self.assertRaises(ValueError):
            authenticate_player_credentials(username="recruit1", password=code)

    def test_activation_code_expiration_after_24_hours(self):
        """
        Verify that an activation code older than 24 hours expires.
        """
        player, code = register_player_by_admin(
            category_key="open",
            team_id="SS",
            name="Expiring Player",
            username="expire_me",
            position="DEF",
            jersey_number=15,
        )
        self.assertTrue(player.is_temp_code_valid(code))

        # Age the code by 25 hours
        past_time = timezone.now() - timedelta(hours=25)
        Player.objects.filter(pk=player.pk).update(temp_code_created_at=past_time)
        player.refresh_from_db()

        self.assertFalse(player.is_temp_code_valid(code))


class SecurityAuditStateSyncTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(key="open", label="Open League")
        self.team = Team.objects.create(category=self.category, team_id="OXF", name="Oxford")
        self.player = Player.objects.create(
            team=self.team,
            player_id="OXF-P1",
            name="Kevin Ochieng",
            username="kochieng",
            jersey_number=7,
            position="LW",
            temp_code="4921",
            must_change_password=True,
        )
        self.player.set_password("TopSecretPassword456!")
        self.player.save()

    def test_state_export_never_exposes_passwords_or_activation_codes(self):
        """
        Verify export_state_from_db() strips all credential fields (password, hash, temp_code).
        """
        state = export_state_from_db()
        open_cat = state["categories"]["open"]
        oxf_team = next(t for t in open_cat["teams"] if t["id"] == "OXF")
        exported_player = next(p for p in oxf_team["players"] if p["id"] == "OXF-P1")

        self.assertNotIn("password", exported_player)
        self.assertNotIn("temp_code", exported_player)
        self.assertNotIn("tempCode", exported_player)
        self.assertNotIn("temp_code_created_at", exported_player)

        # Convert entire state to JSON string and verify credentials do not appear anywhere
        json_str = json.dumps(state)
        self.assertNotIn("TopSecretPassword456!", json_str)
        self.assertNotIn("4921", json_str)
        self.assertNotIn("pbkdf2_", json_str)

    def test_state_import_preserves_existing_player_password_hashes(self):
        """
        Verify import_state_to_db() does not overwrite an existing player's password hash
        when client payload omits or provides placeholder values.
        """
        orig_hash = self.player.password

        # Simulate state export and re-import
        state = export_state_from_db()
        import_state_to_db(state)

        self.player.refresh_from_db()
        self.assertEqual(self.player.password, orig_hash)
        self.assertTrue(self.player.check_password("TopSecretPassword456!"))

    def test_state_import_transactional_atomicity_on_error(self):
        """
        Verify that import_state_to_db() executes atomically: failures rollback cleanly.
        """
        state = export_state_from_db()
        # Corrupt data mid-import
        state["categories"]["invalid_cat"] = {
            "mode": "league",
            "teams": [{"id": None, "name": None}],  # Trigger DB integrity error
        }

        with self.assertRaises(Exception):
            import_state_to_db(state)

        # Ensure corrupted category was rolled back and was not created
        self.assertFalse(Category.objects.filter(key="invalid_cat").exists())


class SecurityAuditTokenAndAttemptHardeningTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(key="open", label="Open League")
        self.team = Team.objects.create(category=self.category, team_id="HAW", name="Hawks")
        self.player_a = Player.objects.create(
            team=self.team,
            player_id="HAW-P1",
            name="Alice Anyango",
            username="alice",
            jersey_number=10,
        )
        self.player_a.set_password("AlicePass2026!")
        self.player_a.save()

        self.player_b = Player.objects.create(
            team=self.team,
            player_id="HAW-P2",
            name="Bob Barasa",
            username="bob",
            jersey_number=11,
        )
        self.player_b.set_password("BobPass2026!")
        self.player_b.save()

        self.token_a = create_signed_token(
            {"role": "player", "player_id": "HAW-P1", "username": "alice", "category_key": "open"},
            salt="titans-player-auth",
        )

    def test_activation_code_attempt_limit_lockout(self):
        """
        Verify that after 5 failed activation code attempts, the temporary code is invalidated.
        """
        player, code = register_player_by_admin(
            category_key="open",
            team_id="HAW",
            name="Charlie Chege",
            username="charlie",
            position="CB",
            jersey_number=5,
        )
        self.assertTrue(player.is_temp_code_valid(code))

        # Attempt 4 wrong codes
        for _ in range(4):
            self.assertFalse(player.is_temp_code_valid("9999"))

        player.refresh_from_db()
        self.assertEqual(player.temp_code_attempts, 4)
        # 5th wrong attempt triggers lockout and clears temp_code
        self.assertFalse(player.is_temp_code_valid("9999"))

        player.refresh_from_db()
        self.assertEqual(player.temp_code, "")
        self.assertEqual(player.temp_code_attempts, 5)

        # Even the original correct code now fails because the account is locked/invalidated
        self.assertFalse(player.is_temp_code_valid(code))

    def test_authenticated_player_cannot_change_another_players_password(self):
        """
        Verify that an authenticated player A cannot change player B's password (HTTP 403 Forbidden).
        """
        res = self.client.post(
            reverse("tournaments:api_auth_player_change_password"),
            data=json.dumps({
                "username": "bob",
                "new_password": "HackedBobPassword123!",
                "current_code": "BobPass2026!",
            }),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {self.token_a}",
        )
        self.assertEqual(res.status_code, 403)
        self.assertIn("forbidden", res.json()["error"].lower())

        # Verify Bob's password was unchanged
        self.player_b.refresh_from_db()
        self.assertTrue(self.player_b.check_password("BobPass2026!"))

    def test_unauthenticated_cannot_change_password_without_current_credentials(self):
        """
        Verify that an unauthenticated user cannot change a player's password without providing
        the valid current code or password.
        """
        # 1. Missing current_code fails
        res = self.client.post(
            reverse("tournaments:api_auth_player_change_password"),
            data=json.dumps({
                "username": "alice",
                "new_password": "HackedAlicePassword123!",
            }),
            content_type="application/json",
        )
        self.assertEqual(res.status_code, 400)

        # 2. Wrong current password fails
        res2 = self.client.post(
            reverse("tournaments:api_auth_player_change_password"),
            data=json.dumps({
                "username": "alice",
                "new_password": "HackedAlicePassword123!",
                "current_code": "WrongPassword!",
            }),
            content_type="application/json",
        )
        self.assertEqual(res2.status_code, 400)

        self.player_a.refresh_from_db()
        self.assertTrue(self.player_a.check_password("AlicePass2026!"))

    def test_tampered_and_malformed_tokens_are_rejected(self):
        """
        Verify that tampered, malformed, or wrong-salt tokens are rejected with 401 Unauthorized.
        """
        # 1. Tampered token payload
        tampered_token = self.token_a[:-5] + "XXXXX"
        res = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "open"}),
            data=json.dumps({"round_id": 1, "votes": {"ST": "HAW-P1"}}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {tampered_token}",
        )
        self.assertEqual(res.status_code, 401)

        # 2. Token signed with wrong salt (e.g. CMS token on player endpoint)
        cms_token_fake = create_signed_token(
            {"role": "cms", "username": "admin"},
            salt="wrong-salt-value",
        )
        res2 = self.client.post(
            reverse("tournaments:api_category_voting_admin_toggle", kwargs={"key": "open"}),
            data=json.dumps({"is_open": False}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {cms_token_fake}",
        )
        self.assertEqual(res2.status_code, 401)

        # 3. Completely malformed token string
        res3 = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "open"}),
            data=json.dumps({"round_id": 1, "votes": {"ST": "HAW-P1"}}),
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer not-a-valid-token-format",
        )
        self.assertEqual(res3.status_code, 401)

    def test_newly_created_player_rejects_default_titans2026_password(self):
        """
        Verify that newly created players without an explicit password get an unusable
        password hash, have must_change_password=True, and cannot authenticate with 'titans2026'.
        """
        new_p = Player.objects.create(
            team=self.team,
            player_id="HAW-P99",
            name="Unactivated Player",
            username="unactivated_p",
            jersey_number=99,
        )
        new_p.refresh_from_db()
        self.assertTrue(new_p.password.startswith("!"))
        self.assertTrue(new_p.must_change_password)
        self.assertFalse(new_p.check_password("titans2026"))
        with self.assertRaises(ValueError):
            authenticate_player_credentials(username="unactivated_p", password="titans2026")

    def test_must_change_password_blocks_voting_until_password_updated(self):
        """
        Verify that a newly registered player who signs in with their 4-digit activation code
        (must_change_password=True) is blocked from submitting a ballot (403 Forbidden)
        until they complete their password change.
        """
        from tournaments.services import get_or_create_active_voting_round
        v_round = get_or_create_active_voting_round(self.category)
        player, code = register_player_by_admin(
            category_key="open",
            team_id="HAW",
            name="Pending Voter",
            username="pending_voter",
            position="ST",
            jersey_number=77,
        )
        login_res = self.client.post(
            reverse("tournaments:api_auth_player_login"),
            data=json.dumps({"username": "pending_voter", "password": code}),
            content_type="application/json",
        )
        self.assertEqual(login_res.status_code, 200)
        temp_token = login_res.json()["token"]
        self.assertTrue(login_res.json()["must_change_password"])

        # Attempting to vote before changing password must return 403 Forbidden
        vote_blocked = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "open"}),
            data=json.dumps({"round_id": v_round.id, "votes": {"ST": [player.player_id]}}),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=temp_token,
        )
        self.assertEqual(vote_blocked.status_code, 403)
        self.assertIn("change your temporary password", vote_blocked.json()["error"])

        # Complete password change
        pw_res = self.client.post(
            reverse("tournaments:api_auth_player_change_password"),
            data=json.dumps({
                "username": "pending_voter",
                "current_code": code,
                "new_password": "StrongPersonalPass2026!",
            }),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=temp_token,
        )
        self.assertEqual(pw_res.status_code, 200)
        new_token = pw_res.json()["token"]

        # Now voting succeeds
        vote_ok = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "open"}),
            data=json.dumps({"round_id": v_round.id, "votes": {"ST": [player.player_id]}}),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=new_token,
        )
        self.assertEqual(vote_ok.status_code, 200)

    def test_cms_token_for_nonexistent_user_does_not_fallback_to_other_staff(self):
        """
        Verify that a signed CMS token for a deleted or non-existent username is rejected
        and never falls back to another staff user in the database.
        """
        User.objects.create_user(username="real_staff", password="StaffPassword123!", is_staff=True, is_active=True)
        ghost_token = create_signed_token(
            {"role": "cms", "username": "deleted_ghost_admin"},
            salt="titans-cms-auth",
        )
        res = self.client.post(
            reverse("tournaments:api_category_voting_admin_toggle", kwargs={"key": "open"}),
            data=json.dumps({"is_open": False}),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=ghost_token,
        )
        self.assertEqual(res.status_code, 401)
        session_res = self.client.get(
            reverse("tournaments:api_auth_session"),
            HTTP_X_TITANS_CMS_TOKEN=ghost_token,
        )
        self.assertFalse(session_res.json()["cms_authenticated"])

    def test_login_rate_limiting_blocks_brute_force(self):
        """
        Verify that repeated failed CMS or Player login attempts trigger HTTP 429 Too Many Requests.
        """
        from django.core.cache import cache
        cache.clear()
        url = reverse("tournaments:api_auth_cms_login")
        for _ in range(8):
            r = self.client.post(
                url,
                data=json.dumps({"username": " brute_target ", "password": "wrong"}),
                content_type="application/json",
            )
            self.assertEqual(r.status_code, 401)
        r_limited = self.client.post(
            url,
            data=json.dumps({"username": " brute_target ", "password": "wrong"}),
            content_type="application/json",
        )
        self.assertEqual(r_limited.status_code, 429)
        cache.clear()


class SecurityAuditHardeningFollowUpTests(TestCase):
    def setUp(self):
        self.category = Category.objects.create(key="open", label="Open League")
        self.team = Team.objects.create(category=self.category, team_id="MAN", name="Mancheli")
        self.player = Player.objects.create(
            team=self.team,
            player_id="MAN-P10",
            name="Samuel Etoo",
            username="etoo",
            jersey_number=9,
            position="ST",
        )
        self.player.set_password("InitialPlayerSecret1!")
        self.player.save()

        self.cms_user = User.objects.create_user(
            username="cms_sec_manager",
            password="InitialManagerSecret1!",
            is_staff=True,
            is_active=True,
        )
        self.non_staff_user = User.objects.create_user(
            username="ordinary_django_user",
            password="OrdinaryUserPass1!",
            is_staff=False,
            is_active=True,
        )
        self.cms_token = create_signed_token(
            {"role": "cms", "username": "cms_sec_manager"},
            salt="titans-cms-auth",
        )
        self.player_token = create_signed_token(
            {"role": "player", "player_id": "MAN-P10", "username": "etoo", "category_key": "open"},
            salt="titans-player-auth",
        )

    def test_team_balancer_authorization_enforced(self):
        """
        Task 1: Verify POST /api/team-balancer/ rejects unauthenticated users, ordinary players,
        and non-staff Django users, while allowing authenticated CMS admins.
        """
        url = reverse("tournaments:api_team_balancer")
        payload = {"raw_text": "Player Name,Class,Position\nPato,A,ST\nJimmy,A,CM", "players_per_team": 1}

        # 1. Unauthenticated -> 401
        r_unauth = self.client.post(url, data=json.dumps(payload), content_type="application/json")
        self.assertEqual(r_unauth.status_code, 401)

        # 2. Player token -> 403
        r_player = self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=self.player_token,
        )
        self.assertEqual(r_player.status_code, 403)

        # 3. Non-staff Django user session -> 401/403
        self.client.force_login(self.non_staff_user)
        r_nonstaff = self.client.post(url, data=json.dumps(payload), content_type="application/json")
        self.assertIn(r_nonstaff.status_code, (401, 403))
        self.client.logout()

        # 4. Authorized CMS admin -> 200 OK
        r_cms = self.client.post(
            url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(r_cms.status_code, 200)
        self.assertTrue(r_cms.json()["success"])

    def test_spoofed_proxy_headers_ignored_when_peer_untrusted(self):
        """
        Task 2: Verify get_client_ip() and rate limiting ignore spoofed CF-Connecting-IP
        and X-Forwarded-For headers when REMOTE_ADDR is not in TRUSTED_PROXY_CIDRS,
        and only extract the non-proxy client IP when REMOTE_ADDR is explicitly trusted.
        """
        from django.test import RequestFactory, override_settings
        from django.core.cache import cache
        from tournaments.services import get_client_ip

        rf = RequestFactory()

        # 1. Default (TRUSTED_PROXY_CIDRS = []): spoofed headers are ignored
        with override_settings(TRUSTED_PROXY_CIDRS=[]):
            req = rf.post(
                "/api/auth/cms-login/",
                REMOTE_ADDR="198.51.100.42",
                HTTP_CF_CONNECTING_IP="1.2.3.4",
                HTTP_X_FORWARDED_FOR="5.6.7.8, 9.10.11.12",
            )
            self.assertEqual(get_client_ip(req), "198.51.100.42")

        # 2. When TRUSTED_PROXY_CIDRS is configured, untrusted peer still cannot spoof
        with override_settings(TRUSTED_PROXY_CIDRS=["10.42.0.0/16"]):
            req_untrusted = rf.post(
                "/api/auth/cms-login/",
                REMOTE_ADDR="198.51.100.42",
                HTTP_CF_CONNECTING_IP="1.2.3.4",
                HTTP_X_FORWARDED_FOR="5.6.7.8",
            )
            self.assertEqual(get_client_ip(req_untrusted), "198.51.100.42")

            # Trusted Traefik peer (10.42.0.15): walks right-to-left in X-Forwarded-For,
            # ignoring spoofed leftmost value ("6.6.6.6") and returning real client ("203.0.113.99")
            req_trusted = rf.post(
                "/api/auth/cms-login/",
                REMOTE_ADDR="10.42.0.15",
                HTTP_X_FORWARDED_FOR="6.6.6.6, 203.0.113.99",
            )
            self.assertEqual(get_client_ip(req_trusted), "203.0.113.99")

        # 3. Rotating spoofed CF-Connecting-IP and X-Forwarded-For on every request CANNOT bypass rate limit
        cache.clear()
        login_url = reverse("tournaments:api_auth_cms_login")
        for i in range(8):
            res = self.client.post(
                login_url,
                data=json.dumps({"username": "cms_sec_manager", "password": "WrongPassword"}),
                content_type="application/json",
                HTTP_CF_CONNECTING_IP=f"203.0.113.{i + 1}",
                HTTP_X_FORWARDED_FOR=f"198.51.100.{i + 1}",
            )
            self.assertEqual(res.status_code, 401)

        res_blocked = self.client.post(
            login_url,
            data=json.dumps({"username": "cms_sec_manager", "password": "WrongPassword"}),
            content_type="application/json",
            HTTP_CF_CONNECTING_IP="203.0.113.250",
            HTTP_X_FORWARDED_FOR="198.51.100.250",
        )
        self.assertEqual(res_blocked.status_code, 429)
        cache.clear()

    def test_shared_file_based_cache_across_processes(self):
        """
        Task 2: Verify FileBasedCache shares rate-limit counters across separate cache instances
        pointing to the same persistent directory (as used by multiple Gunicorn workers).
        """
        import tempfile
        from django.core.cache.backends.filebased import FileBasedCache
        from django.test import override_settings
        from tournaments.services import record_auth_failure, check_auth_rate_limit

        with tempfile.TemporaryDirectory() as tmp_cache_dir:
            cache_cfg = {
                "default": {
                    "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
                    "LOCATION": tmp_cache_dir,
                    "TIMEOUT": 300,
                }
            }
            with override_settings(CACHES=cache_cfg):
                for _ in range(4):
                    record_auth_failure("cms_login", "192.0.2.55", "shared_admin")
                # Instantiate a second FileBasedCache directly to verify on-disk persistence
                worker2_cache = FileBasedCache(tmp_cache_dir, {"TIMEOUT": 300})
                for _ in range(4):
                    record_auth_failure("cms_login", "192.0.2.55", "shared_admin")
                self.assertTrue(check_auth_rate_limit("cms_login", "192.0.2.55", "shared_admin"))
                worker2_cache.clear()

    def test_cms_token_revoked_immediately_after_password_change(self):
        """
        Task 3: Verify that a CMS token issued before a manager password change is immediately
        rejected (401) afterward, while the newly issued token succeeds.
        """
        old_cms_token = self.cms_token

        # Old token works initially
        res_before = self.client.post(
            reverse("tournaments:api_category_toggle_archive", kwargs={"key": "open"}),
            data=json.dumps({"isEnded": False}),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=old_cms_token,
        )
        self.assertEqual(res_before.status_code, 200)

        # Change CMS manager password
        pw_res = self.client.post(
            reverse("tournaments:api_auth_cms_change_password"),
            data=json.dumps({
                "current_password": "InitialManagerSecret1!",
                "new_password": "UpdatedManagerSecret2!",
                "confirm_password": "UpdatedManagerSecret2!",
            }),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=old_cms_token,
        )
        self.assertEqual(pw_res.status_code, 200)
        new_cms_token = pw_res.json()["token"]

        # Clear session so authentication relies solely on the header token
        self.client.logout()

        # Old token must now be rejected with 401 Unauthorized
        res_old = self.client.post(
            reverse("tournaments:api_category_toggle_archive", kwargs={"key": "open"}),
            data=json.dumps({"isEnded": True}),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=old_cms_token,
        )
        self.assertEqual(res_old.status_code, 401)

        # Auth session endpoint must also report cms_authenticated=False for old token
        sess_old = self.client.get(
            reverse("tournaments:api_auth_session"),
            HTTP_X_TITANS_CMS_TOKEN=old_cms_token,
        )
        self.assertFalse(sess_old.json()["cms_authenticated"])

        # New token succeeds
        res_new = self.client.post(
            reverse("tournaments:api_category_toggle_archive", kwargs={"key": "open"}),
            data=json.dumps({"isEnded": False}),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=new_cms_token,
        )
        self.assertEqual(res_new.status_code, 200)

    def test_player_token_revoked_immediately_after_password_change_or_admin_reset(self):
        """
        Task 3: Verify that a Player token issued before a password change or admin password reset
        is immediately rejected (401) afterward.
        """
        from tournaments.services import get_or_create_active_voting_round
        v_round = get_or_create_active_voting_round(self.category)
        old_player_token = self.player_token

        # 1. Player changes their own password
        pw_res = self.client.post(
            reverse("tournaments:api_auth_player_change_password"),
            data=json.dumps({
                "username": "etoo",
                "current_code": "InitialPlayerSecret1!",
                "new_password": "UpdatedPlayerSecret2!",
                "confirm_password": "UpdatedPlayerSecret2!",
            }),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=old_player_token,
        )
        self.assertEqual(pw_res.status_code, 200)
        second_player_token = pw_res.json()["token"]
        self.client.logout()

        # Old token must be rejected with 401 on voting endpoint and session check
        vote_old = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "open"}),
            data=json.dumps({"round_id": v_round.id, "votes": {"ST": ["MAN-P10"]}}),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=old_player_token,
        )
        self.assertEqual(vote_old.status_code, 401)

        sess_old = self.client.get(
            reverse("tournaments:api_auth_session"),
            HTTP_X_TITANS_PLAYER_TOKEN=old_player_token,
        )
        self.assertFalse(sess_old.json()["player_authenticated"])

        # 2. Admin resets player's password -> second_player_token is also immediately revoked
        reset_res = self.client.post(
            reverse("tournaments:api_admin_players_reset_password"),
            data=json.dumps({"username": "etoo"}),
            content_type="application/json",
            HTTP_X_TITANS_CMS_TOKEN=self.cms_token,
        )
        self.assertEqual(reset_res.status_code, 200)

        sess_after_reset = self.client.get(
            reverse("tournaments:api_auth_session"),
            HTTP_X_TITANS_PLAYER_TOKEN=second_player_token,
        )
        self.assertFalse(sess_after_reset.json()["player_authenticated"])

        vote_after_reset = self.client.post(
            reverse("tournaments:api_category_voting_submit", kwargs={"key": "open"}),
            data=json.dumps({"round_id": v_round.id, "votes": {"ST": ["MAN-P10"]}}),
            content_type="application/json",
            HTTP_X_TITANS_PLAYER_TOKEN=second_player_token,
        )
        self.assertEqual(vote_after_reset.status_code, 401)

    def test_backup_retention_paired_sets_keep_days_and_edge_cases(self):
        """
        Task 4: Verify prune_old_backups() treats paired DB + state snapshots as 1 set,
        enforces keep_days, enforces max_backups sets, handles incomplete pairs,
        and never deletes the newest valid backup set.
        """
        import os
        import time
        import tempfile
        from pathlib import Path
        from tournaments.management.commands.backup_database import Command as BackupCommand

        cmd = BackupCommand()
        now = time.time()

        with tempfile.TemporaryDirectory() as tmpdir:
            bdir = Path(tmpdir)

            # Create 4 paired sets (8 files total) and 1 incomplete orphan state file:
            # Set 1: 2 days old (paired)
            # Set 2: 5 days old (paired)
            # Set 3: 10 days old (paired)
            # Set 4: 40 days old (paired - expired beyond keep_days=30)
            # Set 5: 15 days old (incomplete: only state_snapshot, no db_backup)
            sets_spec = [
                ("20261022_020000", now - 2 * 86400, True, True),
                ("20261019_020000", now - 5 * 86400, True, True),
                ("20261014_020000", now - 10 * 86400, True, True),
                ("20261009_020000", now - 15 * 86400, False, True),
                ("20260914_020000", now - 40 * 86400, True, True),
            ]
            for ts, mtime, make_db, make_state in sets_spec:
                if make_db:
                    db_f = bdir / f"db_backup_sqlite_{ts}.sqlite3.gz"
                    db_f.write_bytes(b"sqlite-data")
                    os.utime(db_f, (mtime, mtime))
                if make_state:
                    st_f = bdir / f"state_snapshot_{ts}.json.gz"
                    st_f.write_bytes(b"state-data")
                    os.utime(st_f, (mtime, mtime))

            # 1. Prune with max_backups=10, keep_days=30 -> only the 40-day-old pair should be removed
            cmd.prune_old_backups(bdir, max_backups=10, keep_days=30)
            remaining = {f.name for f in bdir.iterdir()}
            self.assertNotIn("db_backup_sqlite_20260914_020000.sqlite3.gz", remaining)
            self.assertNotIn("state_snapshot_20260914_020000.json.gz", remaining)
            self.assertEqual(len(remaining), 7)  # 3 full pairs (6 files) + 1 incomplete state file

            # 2. Prune with max_backups=2, keep_days=30 -> keeps newest 2 sets (Set 1 and Set 2 = 4 files total!)
            cmd.prune_old_backups(bdir, max_backups=2, keep_days=30)
            remaining2 = {f.name for f in bdir.iterdir()}
            self.assertEqual(
                remaining2,
                {
                    "db_backup_sqlite_20261022_020000.sqlite3.gz",
                    "state_snapshot_20261022_020000.json.gz",
                    "db_backup_sqlite_20261019_020000.sqlite3.gz",
                    "state_snapshot_20261019_020000.json.gz",
                },
            )

            # 3. Edge case: even if keep_days=0 and max_backups=1, the newest valid backup set is NEVER deleted
            cmd.prune_old_backups(bdir, max_backups=1, keep_days=0)
            remaining3 = {f.name for f in bdir.iterdir()}
            self.assertEqual(
                remaining3,
                {
                    "db_backup_sqlite_20261022_020000.sqlite3.gz",
                    "state_snapshot_20261022_020000.json.gz",
                },
            )

    def test_lightweight_health_endpoint_liveness_and_readiness(self):
        """
        Task 5: Verify /api/health/ liveness and readiness behavior under production-like settings
        (Host header, X-Forwarded-Proto: https) without seeding categories.
        """
        Category.objects.all().delete()
        self.assertEqual(Category.objects.count(), 0)

        url = reverse("tournaments:api_health")

        # Liveness check
        res_live = self.client.get(
            url + "?check=live",
            HTTP_HOST="ruirutitans.com",
            HTTP_X_FORWARDED_PROTO="https",
        )
        self.assertEqual(res_live.status_code, 200)
        self.assertEqual(res_live.json(), {"status": "ok", "check": "live"})
        # Confirm it did NOT auto-seed categories
        self.assertEqual(Category.objects.count(), 0)

        # Readiness check
        res_ready = self.client.get(
            url + "?check=ready",
            HTTP_HOST="ruirutitans.com",
            HTTP_X_FORWARDED_PROTO="https",
        )
        self.assertEqual(res_ready.status_code, 200)
        self.assertEqual(res_ready.json(), {"status": "ok", "check": "ready", "database": "ok"})
        self.assertEqual(Category.objects.count(), 0)

    @override_settings(
        SECURE_SSL_REDIRECT=True,
        SECURE_REDIRECT_EXEMPT=[r"^api/health/?$"],
    )
    def test_health_probe_exempt_from_ssl_redirect(self):
        """
        Verify that when SECURE_SSL_REDIRECT is active, /api/health/ remains accessible
        over plain HTTP (unencrypted probe) without a 301 redirect, while normal endpoints
        are redirected to HTTPS.
        """
        url = reverse("tournaments:api_health")

        # Health endpoint over plain HTTP should NOT redirect to HTTPS
        res = self.client.get(url + "?check=live", HTTP_HOST="ruirutitans.com")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "ok", "check": "live"})

        # Normal endpoint over plain HTTP should redirect to HTTPS (301)
        res_state = self.client.get(reverse("tournaments:api_state"), HTTP_HOST="ruirutitans.com")
        self.assertEqual(res_state.status_code, 301)
        self.assertTrue(res_state["Location"].startswith("https://"))


