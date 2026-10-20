from django.core.management.base import BaseCommand
from tournaments.services import (
    build_real_open_season_dict,
    build_real_cup_season_dict,
    build_default_homepage_data,
    import_state_to_db,
    seed_default_honours_votes,
    ensure_default_cms_admin,
)
from tournaments.models import Category, Team, Player, Fixture, MatchEvent, VotingRound


class Command(BaseCommand):
    help = "Loads or resets the initial Ruiru Titans real league and cup season data."

    def handle(self, *args, **options):
        self.stdout.write("Seeding Ruiru Titans Open League & Ruiru Titans Cup...")
        open_data = build_real_open_season_dict()
        cup_data = build_real_cup_season_dict()
        import_state_to_db({
            "categories": {"open": open_data, "titans-cup": cup_data},
            "activeCategory": "open",
            "homepage": build_default_homepage_data(),
        })
        VotingRound.objects.all().delete()
        seed_default_honours_votes()
        ensure_default_cms_admin()

        cat_count = Category.objects.count()
        team_count = Team.objects.count()
        player_count = Player.objects.count()
        fixture_count = Fixture.objects.count()
        event_count = MatchEvent.objects.count()

        self.stdout.write(
            self.style.SUCCESS(
                f"Successfully loaded Ruiru Titans data!\n"
                f"Categories: {cat_count}\n"
                f"Teams: {team_count}\n"
                f"Players: {player_count}\n"
                f"Fixtures: {fixture_count}\n"
                f"Match Events: {event_count}"
            )
        )


