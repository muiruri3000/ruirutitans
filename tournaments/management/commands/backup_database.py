import os
import sys
import gzip
import shutil
import sqlite3
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.conf import settings
from tournaments.services import export_state_from_db


class Command(BaseCommand):
    help = "Creates a persistent, timestamped, compressed backup of the active database and tournament state."

    def add_arguments(self, parser):
        parser.add_argument(
            "--output-dir",
            type=str,
            default="",
            help="Directory to save backups in (defaults to 'backups/' in project root).",
        )
        parser.add_argument(
            "--keep-days",
            type=int,
            default=30,
            help="Number of days to keep backups (default: 30 days).",
        )
        parser.add_argument(
            "--max-backups",
            type=int,
            default=15,
            help="Maximum number of backups to keep before pruning older files (default: 15).",
        )
        parser.add_argument(
            "--skip-state",
            action="store_true",
            help="Skip exporting JSON tournament state snapshot.",
        )
        parser.add_argument(
            "--restore",
            type=str,
            help="Restore database from a given backup file (.sqlite3.gz or .sqlite3).",
        )

    def handle(self, *args, **options):
        if options.get("restore"):
            self.restore_backup(options["restore"])
            return

        out_dir_opt = options.get("output_dir")
        if out_dir_opt:
            backup_dir = Path(out_dir_opt)
        else:
            backup_dir = settings.BASE_DIR / "backups"

        backup_dir.mkdir(parents=True, exist_ok=True)
        try:
            backup_dir.chmod(0o700)
        except OSError:
            pass
        now_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

        db_conf = settings.DATABASES["default"]
        engine = db_conf["ENGINE"]

        self.stdout.write(self.style.NOTICE(f"Initiating database backup for engine: {engine}..."))
        created_files = []

        # 1. Back up database by engine type
        if "sqlite3" in engine:
            db_name_str = str(db_conf["NAME"])
            is_memory = db_name_str == ":memory:" or "mode=memory" in db_name_str
            if not is_memory and not Path(db_name_str).exists():
                raise CommandError(f"SQLite database file not found at: {db_name_str}")

            target_archive = backup_dir / f"db_backup_sqlite_{now_str}.sqlite3.gz"
            self.backup_sqlite(db_name_str, target_archive)
            created_files.append(target_archive)

        elif "mysql" in engine:
            target_archive = backup_dir / f"db_backup_mysql_{now_str}.sql.gz"
            self.backup_mysql(db_conf, target_archive)
            created_files.append(target_archive)

        elif "postgresql" in engine:
            target_archive = backup_dir / f"db_backup_postgres_{now_str}.sql.gz"
            self.backup_postgres(db_conf, target_archive)
            created_files.append(target_archive)

        else:
            self.stdout.write(self.style.WARNING(f"Direct raw dump not implemented for {engine}. Falling back to state snapshot."))

        # 2. Export full tournament state JSON snapshot (extra persistence layer)
        if not options.get("skip_state"):
            state_file = backup_dir / f"state_snapshot_{now_str}.json.gz"
            try:
                state_data = export_state_from_db()
                import json
                raw_json = json.dumps(state_data, indent=2).encode("utf-8")
                with gzip.open(state_file, "wb", compresslevel=9) as gz:
                    gz.write(raw_json)
                created_files.append(state_file)
                self.stdout.write(self.style.SUCCESS(f"  ✓ Exported tournament state snapshot: {state_file.name} ({len(raw_json) / 1024:.1f} KB raw)"))
            except Exception as e:
                self.stdout.write(self.style.WARNING(f"  ⚠ Failed to export tournament state snapshot: {e}"))

        # Enforce secure file permissions (owner read/write only: 0o600)
        for f in created_files:
            try:
                f.chmod(0o600)
            except OSError:
                pass

        # 3. Prune old backups according to retention policy
        self.prune_old_backups(backup_dir, max_backups=options["max_backups"], keep_days=options["keep_days"])

        self.stdout.write(self.style.SUCCESS(f"\nSuccessfully generated {len(created_files)} backup archive(s) in: {backup_dir}"))

    def backup_sqlite(self, src_path: Path, dest_archive: Path):
        """
        Creates an atomic SQLite backup using sqlite3's live backup API, then gzip compresses it.
        """
        temp_raw = dest_archive.with_suffix("")
        src_str = str(src_path)
        is_uri = src_str.startswith("file:") or "mode=memory" in src_str
        try:
            # Atomic live copy without locking writer threads
            src_conn = sqlite3.connect(src_str, uri=is_uri)
            dst_conn = sqlite3.connect(str(temp_raw))
            with dst_conn:
                src_conn.backup(dst_conn)
            dst_conn.close()
            src_conn.close()

            # Compress to target .gz
            with open(temp_raw, "rb") as f_in:
                with gzip.open(dest_archive, "wb", compresslevel=9) as f_out:
                    shutil.copyfileobj(f_in, f_out)

            raw_size = temp_raw.stat().st_size
            gz_size = dest_archive.stat().st_size
            self.stdout.write(self.style.SUCCESS(
                f"  ✓ Created atomic SQLite snapshot: {dest_archive.name} "
                f"({gz_size / 1024:.1f} KB compressed / {raw_size / 1024:.1f} KB raw)"
            ))
        finally:
            if temp_raw.exists():
                temp_raw.unlink()

    def backup_mysql(self, db_conf: dict, dest_archive: Path):
        """
        Dumps MySQL database using mysqldump or falls back to python export.
        """
        user = db_conf.get("USER", "")
        password = db_conf.get("PASSWORD", "")
        host = db_conf.get("HOST", "127.0.0.1")
        port = str(db_conf.get("PORT", "3306"))
        name = db_conf.get("NAME", "")

        mysqldump_bin = shutil.which("mysqldump")
        if not mysqldump_bin:
            self.stdout.write(self.style.WARNING("mysqldump not found in PATH. Performing Django dumpdata fallback."))
            self.backup_django_dumpdata(dest_archive)
            return

        cmd = [
            mysqldump_bin,
            f"--host={host}",
            f"--port={port}",
            f"--user={user}",
            "--single-transaction",
            "--quick",
            "--routines",
            "--triggers",
            name,
        ]
        env = os.environ.copy()
        if password:
            env["MYSQL_PWD"] = password

        try:
            with gzip.open(dest_archive, "wb", compresslevel=9) as gz:
                proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
                shutil.copyfileobj(proc.stdout, gz)
                _, stderr = proc.communicate()
                if proc.returncode != 0:
                    raise CommandError(f"mysqldump failed (code {proc.returncode}): {stderr.decode('utf-8')}")
            self.stdout.write(self.style.SUCCESS(f"  ✓ Exported MySQL dump: {dest_archive.name} ({dest_archive.stat().st_size / 1024:.1f} KB)"))
        except Exception as e:
            if dest_archive.exists():
                dest_archive.unlink()
            raise CommandError(f"MySQL backup error: {e}")

    def backup_postgres(self, db_conf: dict, dest_archive: Path):
        user = db_conf.get("USER", "")
        password = db_conf.get("PASSWORD", "")
        host = db_conf.get("HOST", "127.0.0.1")
        port = str(db_conf.get("PORT", "5432"))
        name = db_conf.get("NAME", "")

        pg_dump_bin = shutil.which("pg_dump")
        if not pg_dump_bin:
            self.stdout.write(self.style.WARNING("pg_dump not found in PATH. Performing Django dumpdata fallback."))
            self.backup_django_dumpdata(dest_archive)
            return

        cmd = [
            pg_dump_bin,
            f"--host={host}",
            f"--port={port}",
            f"--username={user}",
            "--clean",
            "--no-owner",
            name,
        ]
        env = os.environ.copy()
        if password:
            env["PGPASSWORD"] = password

        with gzip.open(dest_archive, "wb", compresslevel=9) as gz:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
            shutil.copyfileobj(proc.stdout, gz)
            _, stderr = proc.communicate()
            if proc.returncode != 0:
                raise CommandError(f"pg_dump failed: {stderr.decode('utf-8')}")

        self.stdout.write(self.style.SUCCESS(f"  ✓ Exported PostgreSQL dump: {dest_archive.name}"))

    def backup_django_dumpdata(self, dest_archive: Path):
        from django.core import management
        import io
        buf = io.StringIO()
        management.call_command("dumpdata", indent=2, stdout=buf)
        with gzip.open(dest_archive, "wt", encoding="utf-8", compresslevel=9) as gz:
            gz.write(buf.getvalue())
        self.stdout.write(self.style.SUCCESS(f"  ✓ Exported Django dumpdata JSON: {dest_archive.name}"))

    def restore_backup(self, backup_file_str: str):
        backup_path = Path(backup_file_str)
        if not backup_path.exists():
            raise CommandError(f"Backup file not found: {backup_path}")

        db_conf = settings.DATABASES["default"]
        engine = db_conf["ENGINE"]

        self.stdout.write(self.style.NOTICE(f"Restoring database from {backup_path}..."))

        if "sqlite3" in engine:
            db_file = Path(db_conf["NAME"])
            temp_extracted = backup_path.with_suffix(".tmp")
            try:
                if backup_path.suffix == ".gz":
                    with gzip.open(backup_path, "rb") as f_in:
                        with open(temp_extracted, "wb") as f_out:
                            shutil.copyfileobj(f_in, f_out)
                    restore_source = temp_extracted
                else:
                    restore_source = backup_path

                # Verify valid sqlite
                conn = sqlite3.connect(str(restore_source))
                cursor = conn.cursor()
                cursor.execute("PRAGMA integrity_check;")
                result = cursor.fetchone()
                conn.close()
                if not result or result[0] != "ok":
                    raise CommandError("SQLite backup failed integrity check!")

                # Safely preserve existing database and WAL/SHM state before overwriting
                if db_file.exists():
                    failed_ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
                    failed_archive = db_file.with_name(f"{db_file.name}.failed_{failed_ts}")
                    shutil.copy2(db_file, failed_archive)
                    self.stdout.write(self.style.WARNING(f"  Preserved existing database state to: {failed_archive.name}"))

                    wal_file = db_file.with_name(db_file.name + "-wal")
                    shm_file = db_file.with_name(db_file.name + "-shm")
                    if wal_file.exists():
                        shutil.copy2(wal_file, db_file.with_name(f"{wal_file.name}.failed_{failed_ts}"))
                        wal_file.unlink()
                        self.stdout.write(self.style.WARNING(f"  Preserved and removed stale WAL file: {wal_file.name}"))
                    if shm_file.exists():
                        shutil.copy2(shm_file, db_file.with_name(f"{shm_file.name}.failed_{failed_ts}"))
                        shm_file.unlink()
                        self.stdout.write(self.style.WARNING(f"  Preserved and removed stale SHM file: {shm_file.name}"))

                # Atomic swap into target database
                shutil.copy2(restore_source, db_file)

                # Final post-restore integrity check
                post_conn = sqlite3.connect(str(db_file))
                post_cur = post_conn.cursor()
                post_cur.execute("PRAGMA integrity_check;")
                post_res = post_cur.fetchone()
                post_conn.close()
                if not post_res or post_res[0] != "ok":
                    raise CommandError("Restored SQLite database failed post-restoration integrity check!")

                self.stdout.write(self.style.SUCCESS(f"Successfully restored SQLite database: {db_file}"))
            finally:
                if temp_extracted.exists():
                    temp_extracted.unlink()
        else:
            raise CommandError("Automated restore currently implemented for SQLite. For MySQL/Postgres, use mysql/psql CLI with the dump file.")

    def prune_old_backups(self, backup_dir: Path, max_backups: int, keep_days: int):
        """
        Prunes backup archives according to both keep_days (age-based retention)
        and max_backups (maximum number of backup sets).
        Treats a database snapshot (db_backup_<engine>_<timestamp>.*) and its
        corresponding tournament state snapshot (state_snapshot_<timestamp>.json.gz)
        as a single logical backup set.
        Never deletes the newest valid backup set even if keep_days=0 or max_backups=1.
        """
        import re
        from datetime import timedelta

        valid_suffixes = (".gz", ".sql", ".sqlite3")
        all_files = [
            f for f in backup_dir.glob("*.*")
            if f.is_file() and f.name.endswith(valid_suffixes)
        ]
        if not all_files:
            return

        ts_pattern = re.compile(r"(\d{8}_\d{6})")
        sets_map = {}

        for f in all_files:
            try:
                mtime = f.stat().st_mtime
            except OSError:
                continue
            match = ts_pattern.search(f.name)
            if match:
                set_key = f"ts:{match.group(1)}"
            else:
                set_key = f"file:{f.name}"

            entry = sets_map.setdefault(set_key, {"files": [], "mtime": mtime, "has_db": False})
            entry["files"].append(f)
            if mtime > entry["mtime"]:
                entry["mtime"] = mtime
            if f.name.startswith("db_backup_"):
                entry["has_db"] = True

        if not sets_map:
            return

        # Sort backup sets newest first by timestamp key / mtime
        sorted_sets = sorted(
            sets_map.values(),
            key=lambda s: s["mtime"],
            reverse=True,
        )

        # Always protect at least the newest valid backup set (preferring one with a DB dump)
        protected_set = next((s for s in sorted_sets if s["has_db"]), sorted_sets[0])

        eff_max = max(1, int(max_backups)) if max_backups is not None else 15
        cutoff_epoch = None
        if keep_days is not None and int(keep_days) >= 0:
            cutoff_epoch = (datetime.now(timezone.utc) - timedelta(days=int(keep_days))).timestamp()

        kept_count = 0
        for bset in sorted_sets:
            if bset is protected_set:
                kept_count += 1
                continue

            is_over_max = kept_count >= eff_max
            is_expired = (cutoff_epoch is not None) and (bset["mtime"] < cutoff_epoch)

            if is_over_max or is_expired:
                for f in bset["files"]:
                    try:
                        f.unlink()
                        self.stdout.write(self.style.NOTICE(f"  - Pruned old backup: {f.name}"))
                    except OSError:
                        pass
            else:
                kept_count += 1
