import json
from django.test import TestCase, Client
from django.urls import reverse
from django.contrib.auth.models import User

from tournaments.models import (
    Category,
    Team,
    Player,
    GroupRole,
    get_or_create_cms_profile,
)
from tournaments.services import create_signed_token, _build_player_auth_profile


class GroupRolesAndPermissionsTests(TestCase):
    def setUp(self):
        self.client = Client()

        # Create Category & Team & Players
        self.category = Category.objects.create(key="open", label="Open League")
        self.team = Team.objects.create(
            category=self.category,
            team_id="TITANS",
            name="Ruiru Titans FC",
            color="#FF9500",
        )
        self.player_alice = Player.objects.create(
            category=self.category,
            team=self.team,
            player_id="TITANS-01",
            name="Alice Wanjiku",
            username="alice_w",
            position="CM",
            jersey_number=8,
            is_active=True,
        )
        self.player_alice.set_password("pass1234")
        self.player_alice.must_change_password = False
        self.player_alice.save()

        self.player_bob = Player.objects.create(
            category=self.category,
            team=self.team,
            player_id="TITANS-02",
            name="Bob Kiprono",
            username="bob_k",
            position="ST",
            jersey_number=9,
            is_active=True,
        )
        self.player_bob.set_password("pass1234")
        self.player_bob.must_change_password = False
        self.player_bob.save()

        # Create Superadmin CMS User
        self.superadmin_user = User.objects.create_superuser(
            username="superadmin", email="super@titans.com", password="adminpassword"
        )
        self.superadmin_profile = get_or_create_cms_profile(self.superadmin_user)
        self.superadmin_token = create_signed_token(
            {
                "role": "cms",
                "username": self.superadmin_user.username,
                "is_superadmin": True,
            },
            salt="titans-cms-auth",
        )

        # Create standard player tokens
        self.alice_profile = _build_player_auth_profile(self.player_alice)
        self.alice_token = create_signed_token(self.alice_profile, salt="titans-player-auth")

        self.bob_profile = _build_player_auth_profile(self.player_bob)
        self.bob_token = create_signed_token(self.bob_profile, salt="titans-player-auth")

    def test_group_role_creation_and_listing(self):
        """Admin creates a group role with attached powers and lists it."""
        url = reverse("tournaments:api_auth_group_roles")
        res = self.client.post(
            url,
            data=json.dumps({
                "name": "Team Captains",
                "description": "Captains with tactics board access and fixture reporting",
                "permissions": {
                    "manage_tactics": True,
                    "manage_fixtures": True,
                },
            }),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {self.superadmin_token}",
        )
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["status"], "success")
        self.assertEqual(data["group_role"]["name"], "Team Captains")
        self.assertTrue(data["group_role"]["permissions"]["manage_tactics"])
        self.assertTrue(data["group_role"]["permissions"]["manage_fixtures"])
        self.assertFalse(data["group_role"]["permissions"]["manage_players"])

        # GET listing
        get_res = self.client.get(
            url,
            HTTP_AUTHORIZATION=f"Bearer {self.superadmin_token}",
        )
        self.assertEqual(get_res.status_code, 200)
        list_data = get_res.json()
        self.assertEqual(len(list_data["group_roles"]), 1)
        self.assertEqual(list_data["group_roles"][0]["name"], "Team Captains")
        # Check available players list for dropdown
        self.assertTrue(len(list_data["available_players"]) >= 2)
        p_names = [p["name"] for p in list_data["available_players"]]
        self.assertIn("Alice Wanjiku", p_names)
        self.assertIn("Bob Kiprono", p_names)

    def test_add_player_to_group_and_inherit_powers(self):
        """
        Add a player to a group role; player inherently assumes all functions
        attached to that group role.
        """
        # Create role
        group = GroupRole.objects.create(
            name="Tactics Coordinators",
            description="Manages pitch formations and rosters",
            permissions={"manage_tactics": True, "manage_duty_roster": True},
        )

        # Before adding, Alice has no effective permissions
        self.assertFalse(self.player_alice.get_effective_permissions()["manage_tactics"])
        self.assertFalse(self.player_alice.get_effective_permissions()["manage_duty_roster"])

        # Add Alice to the group using the members API
        members_url = reverse("tournaments:api_auth_group_role_members", kwargs={"role_id": group.id})
        res = self.client.post(
            members_url,
            data=json.dumps({"player_id": self.player_alice.player_id}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {self.superadmin_token}",
        )
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["group_role"]["members"]), 1)
        self.assertEqual(data["group_role"]["members"][0]["name"], "Alice Wanjiku")

        # Now Alice inherently assumes the functions from the group!
        self.player_alice.refresh_from_db()
        effective_perms = self.player_alice.get_effective_permissions()
        self.assertTrue(effective_perms["manage_tactics"])
        self.assertTrue(effective_perms["manage_duty_roster"])
        self.assertFalse(effective_perms["manage_players"])

        # Player profile and auth session reflects group roles and assumed powers
        alice_profile = _build_player_auth_profile(self.player_alice)
        self.assertTrue(alice_profile["has_group_powers"])
        self.assertEqual(len(alice_profile["group_roles"]), 1)
        self.assertEqual(alice_profile["group_roles"][0]["name"], "Tactics Coordinators")
        self.assertTrue(alice_profile["permissions"]["manage_tactics"])

    def test_player_inherent_permissions_authorize_endpoint_access(self):
        """
        Verify that a player with inherited 'manage_duty_roster' can update duty roster,
        while a player without 'manage_duty_roster' receives HTTP 403 Forbidden.
        """
        duty_group = GroupRole.objects.create(
            name="Duty Marshals",
            description="Can update duty roster",
            permissions={"manage_duty_roster": True},
        )
        duty_group.players.add(self.player_alice)

        # Alice's token
        alice_token = create_signed_token(
            _build_player_auth_profile(self.player_alice),
            salt="titans-player-auth",
        )

        duty_url = reverse("tournaments:api_category_duty_roster", kwargs={"key": "open"})
        payload = {
            "action": "regenerate",
        }

        # Alice (with inherited manage_duty_roster) can access the duty roster API
        res_alice = self.client.post(
            duty_url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {alice_token}",
        )
        self.assertEqual(res_alice.status_code, 200)

        # Bob (no group roles / no permissions) receives 403 Forbidden
        res_bob = self.client.post(
            duty_url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {self.bob_token}",
        )
        self.assertEqual(res_bob.status_code, 403)

        # Alice cannot access endpoints she doesn't have permissions for (e.g. register player)
        register_url = reverse("tournaments:api_admin_players_register")
        res_alice_unauthorized = self.client.post(
            register_url,
            data=json.dumps({"name": "New Player", "jersey_number": 99}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {alice_token}",
        )
        self.assertEqual(res_alice_unauthorized.status_code, 403)

    def test_remove_player_from_group_revokes_powers(self):
        """Removing a player from a group role revokes inherited functions."""
        group = GroupRole.objects.create(
            name="Match Officials",
            description="Scorekeepers and match recorders",
            permissions={"manage_fixtures": True},
        )
        group.players.add(self.player_bob)
        self.assertTrue(self.player_bob.get_effective_permissions()["manage_fixtures"])

        # Remove Bob from group
        del_url = reverse(
            "tournaments:api_auth_group_role_member_delete",
            kwargs={"role_id": group.id, "player_id": self.player_bob.player_id},
        )
        del_res = self.client.delete(
            del_url,
            HTTP_AUTHORIZATION=f"Bearer {self.superadmin_token}",
        )
        self.assertEqual(del_res.status_code, 200)

        self.player_bob.refresh_from_db()
        self.assertFalse(self.player_bob.get_effective_permissions()["manage_fixtures"])

    def test_delete_group_role_cleans_up(self):
        """Deleting a group role revokes all powers from its members."""
        group = GroupRole.objects.create(
            name="Temporary Committee",
            permissions={"manage_voting": True},
        )
        group.players.add(self.player_alice)
        self.assertTrue(self.player_alice.get_effective_permissions()["manage_voting"])

        detail_url = reverse("tournaments:api_auth_group_role_detail", kwargs={"role_id": group.id})
        res = self.client.delete(
            detail_url,
            HTTP_AUTHORIZATION=f"Bearer {self.superadmin_token}",
        )
        self.assertEqual(res.status_code, 200)

        self.player_alice.refresh_from_db()
        self.assertFalse(self.player_alice.get_effective_permissions()["manage_voting"])
