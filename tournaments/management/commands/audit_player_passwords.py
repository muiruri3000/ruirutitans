from django.core.management.base import BaseCommand
from django.contrib.auth.hashers import check_password, is_password_usable, make_password
from tournaments.models import Player


class Command(BaseCommand):
    help = (
        "Audits Player accounts for predictable legacy default passwords ('titans2026') "
        "without exposing password hashes or personal data. "
        "Optionally flags affected accounts with must_change_password=True and an unusable password hash "
        "only when --apply is explicitly passed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            default=False,
            help="Invalidate legacy 'titans2026' password hashes and set must_change_password=True on affected accounts.",
        )

    def handle(self, *args, **options):
        apply_changes = options.get("apply", False)
        known_players = Player.objects.filter(is_unknown=False)
        total_known = known_players.count()

        affected_pks = []
        custom_pw_count = 0
        unusable_count = 0

        # Cache results by password string to avoid redundant PBKDF2 hashing for identical hashes
        hash_cache = {}

        for p in known_players.only("id", "password", "must_change_password"):
            pw = p.password or ""
            if not pw or not is_password_usable(pw):
                unusable_count += 1
                continue
            if pw not in hash_cache:
                if pw.startswith(("pbkdf2_", "argon2", "bcrypt")):
                    hash_cache[pw] = check_password("titans2026", pw)
                else:
                    hash_cache[pw] = (pw == "titans2026")
            if hash_cache[pw]:
                affected_pks.append(p.pk)
            else:
                custom_pw_count += 1

        self.stdout.write(f"Total registered player records audited: {total_known}")
        self.stdout.write(f"Players with custom password hashes: {custom_pw_count}")
        self.stdout.write(f"Players with unusable/pending activation passwords: {unusable_count}")
        self.stdout.write(f"Players with legacy shared default password ('titans2026'): {len(affected_pks)}")

        if not apply_changes:
            self.stdout.write(
                self.style.WARNING(
                    "Dry-run audit complete. No database records were modified. "
                    "Run with --apply after approval to replace legacy 'titans2026' hashes with unusable hashes "
                    "and require admin-issued 4-digit activation codes."
                )
            )
            return

        if affected_pks:
            unusable_hash = make_password(None)
            updated = Player.objects.filter(pk__in=affected_pks).update(
                password=unusable_hash,
                must_change_password=True,
            )
            self.stdout.write(
                self.style.SUCCESS(
                    f"Remediated {updated} player record(s): legacy default password invalidated and must_change_password=True set."
                )
            )
        else:
            self.stdout.write(self.style.SUCCESS("No player records required remediation."))
