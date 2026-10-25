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

    def test_restore_database_preserves_failed_state_and_cleans_wal(self):
        """
        Verify that restoring a database backup:
        1. Validates backup integrity before restore.
        2. Preserves existing failed database, WAL, and SHM files to a timestamped backup.
        3. Removes active stale WAL/SHM files to prevent corruption.
        4. Restores valid SQLite database passing integrity checks.
        """
        import sqlite3
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            fake_db = tmp_path / "test_db.sqlite3"
            fake_wal = tmp_path / "test_db.sqlite3-wal"
            fake_shm = tmp_path / "test_db.sqlite3-shm"

            # Create a valid initial database
            conn = sqlite3.connect(str(fake_db))
            conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);")
            conn.execute("INSERT INTO users VALUES (1, 'Alice');")
            conn.commit()
            conn.close()

            # Back it up using the management command helper
            backup_archive = tmp_path / "db_backup_sqlite_20261024_120000.sqlite3.gz"
            from tournaments.management.commands.backup_database import Command as BackupCommand
            cmd = BackupCommand()
            cmd.backup_sqlite(str(fake_db), backup_archive)
            self.assertTrue(backup_archive.exists())

            # Now modify fake_db (simulate failed state) and create WAL/SHM artifacts
            conn = sqlite3.connect(str(fake_db))
            conn.execute("INSERT INTO users VALUES (2, 'Bob_Corrupted_State');")
            conn.commit()
            conn.close()
            fake_wal.write_bytes(b"STALE_WAL_DATA")
            fake_shm.write_bytes(b"STALE_SHM_DATA")

            # Point settings.DATABASES["default"]["NAME"] to fake_db for restore test
            with self.settings(DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": str(fake_db)}}):
                cmd.restore_backup(str(backup_archive))

            # Verify active WAL and SHM are unlinked
            self.assertFalse(fake_wal.exists())
            self.assertFalse(fake_shm.exists())

            # Verify failed state archives were created
            failed_db_copies = list(tmp_path.glob("test_db.sqlite3.failed_*"))
            failed_wal_copies = list(tmp_path.glob("test_db.sqlite3-wal.failed_*"))
            failed_shm_copies = list(tmp_path.glob("test_db.sqlite3-shm.failed_*"))
            self.assertEqual(len(failed_db_copies), 1)
            self.assertEqual(len(failed_wal_copies), 1)
            self.assertEqual(len(failed_shm_copies), 1)

            # Verify restored DB contains original data and passes integrity check
            conn = sqlite3.connect(str(fake_db))
            cur = conn.cursor()
            cur.execute("PRAGMA integrity_check;")
            self.assertEqual(cur.fetchone()[0], "ok")
            cur.execute("SELECT name FROM users;")
            rows = [r[0] for r in cur.fetchall()]
            conn.close()
            self.assertEqual(rows, ["Alice"])
