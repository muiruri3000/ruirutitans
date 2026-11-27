"""Unit tests for the MCP Gateway HTTP endpoint and audit logging."""

import json
from django.contrib.auth import get_user_model
from django.test import TestCase, Client
from django.urls import reverse
from mcp_server.models import McpApiKey, McpExternalAuditLog

User = get_user_model()


class McpGatewayTestCase(TestCase):
    def setUp(self):
        self.client = Client()
        self.staff_user = User.objects.create_user(
            username="analyst_mcp",
            password="securepassword123",
            is_staff=True,
            is_active=True,
        )
        self.key_obj, self.raw_key = McpApiKey.generate_key(self.staff_user, name="Gateway Test")
        self.gateway_url = reverse("mcp_server:gateway")

    def test_missing_api_key_returns_401(self):
        resp = self.client.post(self.gateway_url, data={}, content_type="application/json")
        self.assertEqual(resp.status_code, 401)
        data = resp.json()
        self.assertIn("error", data)

    def test_invalid_api_key_returns_401(self):
        resp = self.client.post(
            self.gateway_url,
            data={},
            content_type="application/json",
            HTTP_AUTHORIZATION="Bearer rt_mcp_live_invalidkey123456789",
        )
        self.assertEqual(resp.status_code, 401)

    def test_valid_key_tools_list_call(self):
        payload = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/list",
            "params": {},
        }
        resp = self.client.post(
            self.gateway_url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {self.raw_key}",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("result", data)
        tools = data["result"].get("tools", [])
        tool_names = [t["name"] for t in tools]
        self.assertIn("list_categories", tool_names)
        self.assertIn("get_standings", tool_names)
        self.assertIn("get_fixtures", tool_names)

    def test_tool_call_generates_audit_log(self):
        payload = {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {
                "name": "list_categories",
                "arguments": {"include_ended": True},
            },
        }
        resp = self.client.post(
            self.gateway_url,
            data=json.dumps(payload),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {self.raw_key}",
        )
        self.assertEqual(resp.status_code, 200)

        logs = McpExternalAuditLog.objects.filter(tool_name="list_categories")
        self.assertTrue(logs.exists())
        log = logs.first()
        self.assertEqual(log.user, self.staff_user)
        self.assertEqual(log.api_key, self.key_obj)
        self.assertEqual(log.status, "success")
