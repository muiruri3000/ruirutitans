"""URL routing for the MCP Gateway."""

from django.urls import path
from mcp_server.views import mcp_gateway_view

app_name = "mcp_server"

urlpatterns = [
    path("", mcp_gateway_view, name="gateway"),
]
