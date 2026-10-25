from django.core.management.base import BaseCommand
from tournaments.models import Category
from tournaments.services import reorganize_category_unplayed_fixtures


class Command(BaseCommand):
    help = "Reorganizes all unplayed fixtures so catch-up matches play first and no team plays an extra match ahead of trailing/new teams."

    def add_arguments(self, parser):
        parser.add_argument(
            "--category",
            type=str,
            default=None,
            help="Specific category key to reorganize (defaults to all active league categories).",
        )
        parser.add_argument(
            "--new-team",
            type=str,
            default=None,
            help="Optional team code or ID of newly added team to prioritize.",
        )

    def handle(self, *args, **options):
        cat_key = options.get("category")
        new_team = options.get("new_team")

        if cat_key:
            categories = Category.objects.filter(key=cat_key, mode="league")
        else:
            categories = Category.objects.filter(is_deleted=False, mode="league", is_ended=False)

        total_reordered = 0
        for cat in categories:
            reordered = reorganize_category_unplayed_fixtures(cat, newly_added_team_id=new_team)
            self.stdout.write(
                self.style.SUCCESS(
                    f"✓ Reorganized {reordered} unplayed fixtures in '{cat.label}' ({cat.key})."
                )
            )
            total_reordered += reordered

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully completed unplayed fixture reorganization ({total_reordered} total matches balanced)."
            )
        )
