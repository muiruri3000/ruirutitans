"""Unit tests for Claude Desktop / Claude Code stdio bridge."""

import json
from unittest.mock import MagicMock, patch
from django.test import SimpleTestCase

from mcp_server.cli import (
    _sanitize_for_log,
    load_credentials,
    forward_request,
    run_stdio_bridge,
)


class ClaudeBridgeTestCase(SimpleTestCase):
    def test_sanitize_for_log_redacts_api_key(self):
        secret = "rt_mcp_live_secret12345"
        text = f"Connecting with Bearer {secret} to server"
        sanitized = _sanitize_for_log(text, secret)
        self.assertNotIn("secret12345", sanitized)
        self.assertIn("[REDACTED_API_KEY]", sanitized)

    def test_load_credentials_from_environment(self):
        with patch.dict(
            "os.environ",
            {
                "TITANS_MCP_URL": "http://127.0.0.1:8000/api/mcp",
                "TITANS_MCP_API_KEY": "rt_mcp_live_testkey",
            },
        ):
            url, key = load_credentials()
            self.assertEqual(url, "http://127.0.0.1:8000/api/mcp/")
            self.assertEqual(key, "rt_mcp_live_testkey")

    @patch("urllib.request.urlopen")
    def test_forward_request_success(self, mock_urlopen):
        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.read.return_value = json.dumps(
            {"jsonrpc": "2.0", "result": {"protocolVersion": "2024-11-05"}, "id": 1}
        ).encode("utf-8")
        mock_resp.headers.get.return_value = "session-abc-123"
        mock_resp.__enter__.return_value = mock_resp
        mock_resp.__exit__.return_value = None
        mock_urlopen.return_value = mock_resp

        status, body, session_id = forward_request(
            url="http://127.0.0.1:8000/api/mcp/",
            api_key="rt_mcp_live_key",
            payload_bytes=b'{"jsonrpc":"2.0","method":"initialize","id":1}',
        )
        self.assertEqual(status, 200)
        self.assertEqual(session_id, "session-abc-123")
        parsed = json.loads(body.decode("utf-8"))
        self.assertEqual(parsed["id"], 1)

    @patch("sys.stdin")
    @patch("sys.stdout")
    @patch("mcp_server.cli.forward_request")
    def test_run_stdio_bridge_loop(self, mock_forward, mock_stdout, mock_stdin):
        # Simulate Claude Desktop sending an initialize line followed by EOF
        mock_stdin.readline.side_effect = [
            '{"jsonrpc":"2.0","method":"initialize","id":1}\n',
            "",
        ]
        mock_forward.return_value = (
            200,
            json.dumps({"jsonrpc": "2.0", "result": {"protocolVersion": "2024-11-05"}, "id": 1}).encode("utf-8"),
            "sess-1",
        )

        exit_code = run_stdio_bridge("http://127.0.0.1:8000/api/mcp/", "rt_mcp_live_key")
        self.assertEqual(exit_code, 0)
        mock_stdout.write.assert_called()
