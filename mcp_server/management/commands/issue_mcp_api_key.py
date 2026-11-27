"""Management command to issue an MCP API Key for a staff user."""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from mcp_server.models import McpApiKey

User = get_user_model()


class Command(BaseCommand):
    help = "Issues a new MCP API key for a staff or admin user."

    def add_arguments(self, parser):
        parser.add_argument("username", type=str, help="Username of the staff member.")
        parser.add_argument("--name", type=str, default=None, help="Descriptive label for the key.")
        parser.add_argument("--label", type=str, default=None, help="Alias for --name.")

    def handle(self, *args, **options):
        username = options["username"]
        name = options.get("label") or options.get("name") or "Staff MCP Key"

        user = User.objects.filter(username__iexact=username).first()
        if not user:
            raise CommandError(f"User '{username}' does not exist.")
        if not (user.is_staff or user.is_superuser):
            raise CommandError(f"User '{username}' must be staff or superuser to hold an MCP API key.")

        key_instance, raw_key = McpApiKey.generate_key(user=user, name=name)

        self.stdout.write(self.style.SUCCESS(f"Successfully generated MCP API Key for {user.username}:"))
        self.stdout.write(f"Key ID: {key_instance.id}")
        self.stdout.write(f"Key Prefix: {key_instance.key_prefix}")
        self.stdout.write(self.style.WARNING(f"Secret API Key: {raw_key}"))
        self.stdout.write(self.style.NOTICE("Store this key securely; it will not be displayed again."))
