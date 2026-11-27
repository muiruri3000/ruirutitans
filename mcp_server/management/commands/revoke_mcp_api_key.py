"""Management command to revoke an active MCP API Key."""

from django.core.management.base import BaseCommand, CommandError
from mcp_server.models import McpApiKey


class Command(BaseCommand):
    help = "Revokes an active MCP API key by key prefix or key ID."

    def add_arguments(self, parser):
        parser.add_argument("identifier", type=str, help="Key ID (UUID) or key prefix (e.g. rt_mcp_live_...)")

    def handle(self, *args, **options):
        ident = options["identifier"].strip()
        key = (
            McpApiKey.objects.filter(id=ident).first()
            if "-" in ident and len(ident) == 36
            else McpApiKey.objects.filter(key_prefix__startswith=ident).first()
        )
        if not key:
            raise CommandError(f"No MCP API key found matching '{ident}'.")

        key.revoke()
        self.stdout.write(self.style.SUCCESS(f"Successfully revoked MCP API key '{key.name}' ({key.key_prefix})."))
