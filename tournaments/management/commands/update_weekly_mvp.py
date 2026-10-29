from django.core.management.base import BaseCommand
from django.utils import timezone
from tournaments.models import Category
from tournaments.services import compute_weekly_mvps


class Command(BaseCommand):
    help = "Calculates and updates Weekly MVPs for ended matchweeks (cutoff every Saturday at 8:00 PM)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--category",
            type=str,
            default=None,
            help="Category key to update (default: all active categories)",
        )
        parser.add_argument(
            "--force",
            action="store_true",
            help="Force overwrite existing MVP records even if manually customized",
        )

    def handle(self, *args, **options):
        cat_key = options.get("category")
        force = options.get("force", False)
        now = timezone.now()

        self.stdout.write(
            self.style.NOTICE(f"[{now.isoformat()}] Running Weekly MVP calculation (Saturday 8:00 PM window)...")
        )

        qs = Category.objects.filter(is_deleted=False)
        if cat_key:
            qs = qs.filter(key=cat_key)

        if not qs.exists():
            self.stdout.write(self.style.WARNING("No active categories found to process."))
            return

        for cat in qs:
            self.stdout.write(f"Processing category: {cat.label} ({cat.key})...")
            summary = compute_weekly_mvps(cat, reference_dt=now, force=force)
            curr = summary.get("current_mvp")
            if curr:
                p = curr["player"]
                self.stdout.write(
                    self.style.SUCCESS(
                        f"  -> Matchweek {curr['week_number']} MVP: {p['displayName']} ({p['team_name']}) - "
                        f"Finalized: {curr['is_finalized']} ({curr['stats']['points']} pts)"
                    )
                )
            else:
                self.stdout.write(self.style.WARNING(f"  -> No MVP calculated for {cat.key}."))

            self.stdout.write(f"  Next weekly update: {summary.get('next_update')}")

        self.stdout.write(self.style.SUCCESS("Weekly MVP calculation completed."))
