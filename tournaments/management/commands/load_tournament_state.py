import json
import gzip
from pathlib import Path
from django.core.management.base import BaseCommand, CommandError
from tournaments.services import import_state_to_db


class Command(BaseCommand):
    help = "Imports a JSON tournament state snapshot into the active database (MySQL, SQLite, etc.)."

    def add_arguments(self, parser):
        parser.add_argument(
            "file_path",
            nargs="?",
            type=str,
            default="backups/current_tournament_state.json",
            help="Path to the JSON tournament state snapshot file (supports .json or .json.gz).",
        )

    def handle(self, *args, **options):
        file_path_str = options["file_path"]
        path = Path(file_path_str)

        if not path.exists():
            raise CommandError(f"Snapshot file not found: {path.resolve()}")

        self.stdout.write(f"Reading tournament state from {path}...")
        try:
            if path.suffix == ".gz":
                with gzip.open(path, "rt", encoding="utf-8") as f:
                    state_dict = json.load(f)
            else:
                with open(path, "r", encoding="utf-8") as f:
                    state_dict = json.load(f)
        except Exception as e:
            raise CommandError(f"Failed to parse JSON snapshot: {e}")

        if not state_dict or "categories" not in state_dict:
            raise CommandError("Invalid tournament state: 'categories' key is missing.")

        self.stdout.write("Importing tournament categories, teams, players, and match events into active database...")
        import_state_to_db(state_dict, soft_delete_missing=False)
        self.stdout.write(self.style.SUCCESS("✓ Successfully imported tournament state into database!"))
