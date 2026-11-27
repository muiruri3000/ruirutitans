"""Unit tests for McpApiKey generation, verification, and revocation."""

from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied
from django.test import TestCase
from django.utils import timezone

from mcp_server.models import API_KEY_PREFIX, McpApiKey

User = get_user_model()


class McpApiKeyTestCase(TestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username="coach_joseph",
            password="securepassword123",
            is_staff=True,
            is_active=True,
        )
        self.player_user = User.objects.create_user(
            username="striker_dan",
            password="securepassword123",
            is_staff=False,
            is_active=True,
        )

    def test_generate_and_verify_key(self):
        key_obj, raw_key = McpApiKey.generate_key(self.staff_user, name="Coach Laptop")
        self.assertTrue(raw_key.startswith(API_KEY_PREFIX))
        self.assertEqual(key_obj.user, self.staff_user)
        self.assertTrue(key_obj.is_active)

        # Verify raw key
        verified = McpApiKey.verify_raw_key(raw_key)
        self.assertIsNotNone(verified)
        self.assertEqual(verified.id, key_obj.id)
        self.assertEqual(verified.user.username, "coach_joseph")

    def test_non_staff_cannot_generate_key(self):
        with self.assertRaises(PermissionDenied):
            McpApiKey.generate_key(self.player_user, name="Player Key")

    def test_revoked_key_fails_verification(self):
        key_obj, raw_key = McpApiKey.generate_key(self.staff_user, name="Temporary Key")
        key_obj.revoke()

        verified = McpApiKey.verify_raw_key(raw_key)
        self.assertIsNone(verified)

    def test_tampered_key_fails_verification(self):
        _key_obj, raw_key = McpApiKey.generate_key(self.staff_user, name="Valid Key")
        tampered = raw_key[:-4] + "ABCD"
        self.assertIsNone(McpApiKey.verify_raw_key(tampered))

    def test_expired_key_fails_verification(self):
        past = timezone.now() - timezone.timedelta(days=1)
        key_obj, raw_key = McpApiKey.generate_key(self.staff_user, expires_at=past)
        self.assertIsNone(McpApiKey.verify_raw_key(raw_key))
