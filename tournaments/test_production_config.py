import re
import tempfile
from pathlib import Path
from unittest import mock

from django.test import TestCase
from django.conf import settings
from django.core.management import call_command
from django.core.exceptions import ImproperlyConfigured
from django.contrib.auth.models import User
from django.contrib.auth.hashers import identify_hasher, make_password


class ProductionConfigTests(TestCase):
    def test_allowed_hosts_contains_ruirutitans_domain(self):
        """
        Verify that ALLOWED_HOSTS is restricted to ruirutitans.com and .ruirutitans.com (*.ruirutitans.com).
        """
        self.assertIn("ruirutitans.com", settings.ALLOWED_HOSTS)
        self.assertIn(".ruirutitans.com", settings.ALLOWED_HOSTS)
        self.assertNotIn("*", settings.ALLOWED_HOSTS)

    def test_cors_disallows_all_origins_when_credentials_enabled(self):
        """
        Verify that CORS_ALLOW_ALL_ORIGINS is False while CORS_ALLOW_CREDENTIALS is True.
        """
        self.assertFalse(settings.CORS_ALLOW_ALL_ORIGINS)
        self.assertTrue(settings.CORS_ALLOW_CREDENTIALS)

    def test_cors_regex_matches_domain_and_subdomains(self):
        """
        Verify CORS allowed origin regex correctly matches ruirutitans.com and any subdomain.
        """
        regexes = settings.CORS_ALLOWED_ORIGIN_REGEXES
        self.assertTrue(len(regexes) > 0)
        pattern = regexes[0]

        self.assertTrue(re.match(pattern, "https://ruirutitans.com"))
        self.assertTrue(re.match(pattern, "https://api.ruirutitans.com"))
        self.assertTrue(re.match(pattern, "https://admin.ruirutitans.com"))
        self.assertTrue(re.match(pattern, "https://staging.ruirutitans.com"))

        # Should NOT match unauthorized external origins
        self.assertFalse(re.match(pattern, "https://evil.com"))
        self.assertFalse(re.match(pattern, "https://ruirutitans.com.attacker.org"))

    def test_csrf_trusted_origins_includes_production_domains(self):
        """
        Verify that CSRF_TRUSTED_ORIGINS covers ruirutitans.com and *.ruirutitans.com.
        """
        self.assertIn("https://ruirutitans.com", settings.CSRF_TRUSTED_ORIGINS)
        self.assertIn("https://*.ruirutitans.com", settings.CSRF_TRUSTED_ORIGINS)

    def test_password_hashers_priority(self):
        """
        Verify that PBKDF2PasswordHasher is the default/primary hasher and MD5 is strictly a legacy fallback.
        """
        self.assertEqual(settings.PASSWORD_HASHERS[0], "django.contrib.auth.hashers.PBKDF2PasswordHasher")
        self.assertEqual(settings.PASSWORD_HASHERS[-1], "django.contrib.auth.hashers.MD5PasswordHasher")

        # Create password and check that it uses pbkdf2_sha256
        hashed = make_password("titansSecurePass2026!")
        hasher_name = identify_hasher(hashed).algorithm
        self.assertEqual(hasher_name, "pbkdf2_sha256")

    def test_password_validators_configured(self):
        """
        Verify all 4 production password validators are configured with minimum length 8.
        """
        val_names = [v["NAME"] for v in settings.AUTH_PASSWORD_VALIDATORS]
        self.assertIn("django.contrib.auth.password_validation.UserAttributeSimilarityValidator", val_names)
        self.assertIn("django.contrib.auth.password_validation.MinimumLengthValidator", val_names)
        self.assertIn("django.contrib.auth.password_validation.CommonPasswordValidator", val_names)
        self.assertIn("django.contrib.auth.password_validation.NumericPasswordValidator", val_names)

        min_len = next(
            v["OPTIONS"]["min_length"]
            for v in settings.AUTH_PASSWORD_VALIDATORS
            if "MinimumLengthValidator" in v["NAME"]
        )
        self.assertGreaterEqual(min_len, 8)

    def test_backup_database_command(self):
        """
        Verify that the backup_database management command runs and generates valid backup files.
        """
        with tempfile.TemporaryDirectory() as tmp_dir:
            call_command("backup_database", output_dir=tmp_dir)
            files = list(Path(tmp_dir).glob("*.gz"))
            self.assertTrue(len(files) >= 1)
            for f in files:
                self.assertGreater(f.stat().st_size, 0)
