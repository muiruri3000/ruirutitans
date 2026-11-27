"""Local stdio MCP bridge for Claude Desktop, Claude Code, and Antigravity.

This script runs as a subprocess communicating with Claude Desktop or Claude Code
via standard I/O (stdin/stdout) and forwards JSON-RPC messages over HTTP(S) to
the Ruiru Titans MCP Gateway endpoint (/api/mcp/).

Zero external dependencies required (uses standard library modules only).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_CONFIG_PATH = os.path.expanduser("~/.ruirutitans/mcp_config.json")


def _sanitize_for_log(text: str, secret: str) -> str:
    if not secret or len(secret) < 6:
        return text
    return text.replace(secret, "[REDACTED_API_KEY]")


def load_credentials(config_path: str = DEFAULT_CONFIG_PATH) -> tuple[str, str]:
    """Resolve gateway URL and API key from environment or config file."""
    url = os.environ.get("TITANS_MCP_URL") or os.environ.get("RUIRUTITANS_MCP_URL", "")
    api_key = os.environ.get("TITANS_MCP_API_KEY") or os.environ.get("RUIRUTITANS_MCP_API_KEY", "")

    if not url or not api_key:
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    config = json.load(f)
                    if not url:
                        url = config.get("url", "")
                    if not api_key:
                        api_key = config.get("api_key", "")
            except Exception as exc:
                sys.stderr.write(
                    f"[Titans MCP Bridge] Warning: Could not read config file {config_path}: {exc}\n"
                )

    url = (url or "").strip()
    api_key = (api_key or "").strip()

    if not url:
        url = "http://127.0.0.1:8000/api/mcp/"
    elif not url.endswith("/"):
        url = f"{url}/"

    return url, api_key


def forward_request(
    url: str,
    api_key: str,
    payload_bytes: bytes,
    session_id: str | None = None,
) -> tuple[int, bytes, str | None]:
    """Forward a raw JSON-RPC payload to the Ruiru Titans MCP Gateway."""
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": f"Bearer {api_key}",
    }
    if session_id:
        headers["mcp-session-id"] = session_id

    req = urllib.request.Request(url, data=payload_bytes, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            status = resp.status
            resp_body = resp.read()
            new_session_id = resp.headers.get("mcp-session-id") or session_id
            return status, resp_body, new_session_id
    except urllib.error.HTTPError as exc:
        err_body = exc.read()
        return exc.code, err_body, session_id
    except urllib.error.URLError as exc:
        sys.stderr.write(
            f"[Titans MCP Bridge] Network error: {_sanitize_for_log(str(exc.reason), api_key)}\n"
        )
        err_json = json.dumps(
            {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32000,
                    "message": f"Titans Gateway connection failed: {exc.reason}",
                },
            }
        ).encode("utf-8")
        return 503, err_json, session_id
    except Exception as exc:
        sys.stderr.write(
            f"[Titans MCP Bridge] Unexpected transport error: {_sanitize_for_log(str(exc), api_key)}\n"
        )
        err_json = json.dumps(
            {
                "jsonrpc": "2.0",
                "error": {
                    "code": -32603,
                    "message": f"Internal bridge transport error: {exc}",
                },
            }
        ).encode("utf-8")
        return 500, err_json, session_id


def run_stdio_bridge(url: str, api_key: str) -> int:
    """Read JSON-RPC lines from sys.stdin, forward to gateway, write response to sys.stdout."""
    sys.stderr.write(
        f"[Titans MCP Bridge] Started stdio bridge forwarding to {_sanitize_for_log(url, api_key)}\n"
    )
    session_id: str | None = None

    while True:
        try:
            line = sys.stdin.readline()
            if not line:
                break

            line_str = line.strip()
            if not line_str:
                continue

            try:
                parsed = json.loads(line_str)
            except json.JSONDecodeError as exc:
                sys.stderr.write(f"[Titans MCP Bridge] Invalid JSON on stdin: {exc}\n")
                err_resp = {
                    "jsonrpc": "2.0",
                    "error": {"code": -32700, "message": f"Parse error: {exc}"},
                    "id": None,
                }
                sys.stdout.write(json.dumps(err_resp) + "\n")
                sys.stdout.flush()
                continue

            msg_id = parsed.get("id")
            is_notification = msg_id is None

            status, resp_bytes, session_id = forward_request(
                url, api_key, line_str.encode("utf-8"), session_id=session_id
            )

            if is_notification and (not resp_bytes or status == 204):
                continue

            if resp_bytes:
                resp_text = resp_bytes.decode("utf-8").strip()
                if resp_text:
                    for line_out in resp_text.splitlines():
                        line_out = line_out.strip()
                        if line_out.startswith("data: "):
                            line_out = line_out[6:].strip()
                        if line_out.startswith("{"):
                            sys.stdout.write(line_out + "\n")
                            sys.stdout.flush()
                        elif line_out:
                            sys.stdout.write(line_out + "\n")
                            sys.stdout.flush()
            else:
                if not is_notification:
                    fallback_err = {
                        "jsonrpc": "2.0",
                        "error": {
                            "code": -32603,
                            "message": f"Gateway returned status {status} with empty body",
                        },
                        "id": msg_id,
                    }
                    sys.stdout.write(json.dumps(fallback_err) + "\n")
                    sys.stdout.flush()

        except KeyboardInterrupt:
            break
        except Exception as exc:
            sys.stderr.write(
                f"[Titans MCP Bridge] Error in bridge loop: {_sanitize_for_log(str(exc), api_key)}\n"
            )

    sys.stderr.write("[Titans MCP Bridge] Stdio bridge terminated cleanly.\n")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Ruiru Titans MCP stdio bridge for Claude Desktop.")
    parser.add_argument("--url", default="", help="Ruiru Titans MCP Gateway URL.")
    parser.add_argument("--api-key", default="", help="Staff MCP API Key.")
    parser.add_argument("--config", default=DEFAULT_CONFIG_PATH, help="Path to credentials JSON file.")
    args = parser.parse_args()

    url = args.url
    api_key = args.api_key
    if not url or not api_key:
        env_url, env_key = load_credentials(args.config)
        url = url or env_url
        api_key = api_key or env_key

    if not api_key:
        sys.stderr.write(
            "[Titans MCP Bridge] ERROR: No MCP API key found.\n"
            "Generate one with: python manage.py issue_mcp_api_key <username>\n"
            "Provide via --api-key, TITANS_MCP_API_KEY environment variable, or config file.\n"
        )
        return 1

    return run_stdio_bridge(url, api_key)


if __name__ == "__main__":
    sys.exit(main())
