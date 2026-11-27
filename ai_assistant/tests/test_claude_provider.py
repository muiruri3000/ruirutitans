"""Unit tests for ClaudeProvider cross AI model integration."""

import unittest
from unittest.mock import AsyncMock, patch
import httpx2
from django.test import SimpleTestCase

from ai_assistant.exceptions import AIProviderConfigurationError, AIProviderRateLimitError
from ai_assistant.providers.base import LLMMessage, LLMToolCall, LLMToolDefinition, LLMToolResult
from ai_assistant.providers.claude import ClaudeProvider


class ClaudeProviderTestCase(SimpleTestCase):
    def setUp(self):
        self.provider = ClaudeProvider(
            api_key="sk-ant-test-key-12345",
            model_name="claude-3-5-sonnet-20241022",
        )

    def test_missing_api_key_raises_configuration_error(self):
        p = ClaudeProvider(api_key="")
        with self.assertRaises(AIProviderConfigurationError):
            import asyncio
            asyncio.run(
                p.generate(
                    system_prompt="Test",
                    messages=[LLMMessage(role="user", content="Hi")],
                    tools=[],
                    max_output_tokens=100,
                )
            )

    def test_convert_tools(self):
        tools = [
            LLMToolDefinition(
                name="get_standings",
                description="Get league standings",
                parameters_schema={"type": "object", "properties": {"category_key": {"type": "string"}}},
            )
        ]
        converted = self.provider._convert_tools(tools)
        self.assertEqual(len(converted), 1)
        self.assertEqual(converted[0]["name"], "get_standings")
        self.assertEqual(converted[0]["description"], "Get league standings")
        self.assertIn("input_schema", converted[0])

    def test_convert_messages_with_tool_use_and_results(self):
        messages = [
            LLMMessage(role="user", content="Show standings"),
            LLMMessage(
                role="assistant",
                content="Checking standings now",
                tool_calls=[
                    LLMToolCall(
                        call_id="toolu_123",
                        name="get_standings",
                        arguments={"category_key": "main"},
                    )
                ],
            ),
            LLMMessage(
                role="tool_results",
                tool_results=[
                    LLMToolResult(
                        call_id="toolu_123",
                        name="get_standings",
                        payload={"standings": [{"team": "Titans Red", "points": 12}]},
                    )
                ],
            ),
        ]
        converted = self.provider._convert_messages(messages)
        self.assertEqual(len(converted), 3)
        self.assertEqual(converted[0]["role"], "user")
        self.assertEqual(converted[1]["role"], "assistant")
        self.assertEqual(converted[1]["content"][1]["type"], "tool_use")
        self.assertEqual(converted[1]["content"][1]["id"], "toolu_123")
        self.assertEqual(converted[2]["role"], "user")
        self.assertEqual(converted[2]["content"][0]["type"], "tool_result")
        self.assertEqual(converted[2]["content"][0]["tool_use_id"], "toolu_123")

    @patch("httpx2.AsyncClient.post")
    def test_generate_parses_claude_response(self, mock_post):
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "content": [
                {"type": "text", "text": "Here are the top scorers for this week:"},
                {
                    "type": "tool_use",
                    "id": "toolu_456",
                    "name": "get_top_scorers",
                    "input": {"category_key": "championship", "limit": 5},
                },
            ],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 150, "output_tokens": 45},
        }
        mock_post.return_value = mock_resp

        import asyncio
        resp = asyncio.run(
            self.provider.generate(
                system_prompt="You are a football bot.",
                messages=[LLMMessage(role="user", content="Top scorers?")],
                tools=[
                    LLMToolDefinition(
                        name="get_top_scorers",
                        description="Fetch scorers",
                        parameters_schema={},
                    )
                ],
                max_output_tokens=500,
            )
        )
        self.assertEqual(resp.text, "Here are the top scorers for this week:")
        self.assertEqual(len(resp.tool_calls), 1)
        self.assertEqual(resp.tool_calls[0].name, "get_top_scorers")
        self.assertEqual(resp.tool_calls[0].call_id, "toolu_456")
        self.assertEqual(resp.usage.prompt_tokens, 150)
        self.assertEqual(resp.usage.completion_tokens, 45)
        self.assertEqual(resp.usage.total_tokens, 195)
        self.assertEqual(resp.provider_name, "claude")

    @patch("httpx2.AsyncClient.post")
    def test_generate_handles_rate_limit(self, mock_post):
        mock_resp = AsyncMock()
        mock_resp.status_code = 429
        mock_resp.text = "Rate limit exceeded"
        mock_post.return_value = mock_resp

        import asyncio
        with self.assertRaises(AIProviderRateLimitError):
            asyncio.run(
                self.provider.generate(
                    system_prompt="Test",
                    messages=[LLMMessage(role="user", content="Hi")],
                    tools=[],
                    max_output_tokens=100,
                )
            )

    @patch("httpx2.AsyncClient.post")
    def test_claude_orchestration_round_trip(self, mock_post):
        """Test Claude tool-use message generation followed by final answer."""
        import asyncio
        from ai_assistant.providers.base import LLMToolResult

        # First turn: Claude returns tool_use
        resp1 = AsyncMock()
        resp1.status_code = 200
        resp1.json.return_value = {
            "content": [
                {"type": "text", "text": "Let me look up the head to head record."},
                {
                    "type": "tool_use",
                    "id": "toolu_h2h_1",
                    "name": "get_h2h_comparison",
                    "input": {"team_a": "Titans Red", "team_b": "Titans Blue"},
                },
            ],
            "stop_reason": "tool_use",
            "usage": {"input_tokens": 120, "output_tokens": 30},
        }

        # Second turn: Claude receives tool result and provides final answer
        resp2 = AsyncMock()
        resp2.status_code = 200
        resp2.json.return_value = {
            "content": [
                {
                    "type": "text",
                    "text": "Titans Red has won 1 match against Titans Blue with 1 goal scored.",
                }
            ],
            "stop_reason": "end_turn",
            "usage": {"input_tokens": 200, "output_tokens": 25},
        }

        mock_post.side_effect = [resp1, resp2]

        # First call
        res_first = asyncio.run(
            self.provider.generate(
                system_prompt="System Prompt",
                messages=[LLMMessage(role="user", content="Compare Titans Red and Blue")],
                tools=[
                    LLMToolDefinition(
                        name="get_h2h_comparison",
                        description="H2H analysis",
                        parameters_schema={"type": "object"},
                    )
                ],
                max_output_tokens=500,
            )
        )
        self.assertEqual(len(res_first.tool_calls), 1)
        self.assertEqual(res_first.tool_calls[0].name, "get_h2h_comparison")
        self.assertEqual(res_first.tool_calls[0].call_id, "toolu_h2h_1")

        # Second call with tool result
        res_second = asyncio.run(
            self.provider.generate(
                system_prompt="System Prompt",
                messages=[
                    LLMMessage(role="user", content="Compare Titans Red and Blue"),
                    LLMMessage(
                        role="assistant",
                        content="Let me look up the head to head record.",
                        tool_calls=res_first.tool_calls,
                    ),
                    LLMMessage(
                        role="tool_results",
                        tool_results=[
                            LLMToolResult(
                                call_id="toolu_h2h_1",
                                name="get_h2h_comparison",
                                payload={
                                    "team_a": "Titans Red",
                                    "team_b": "Titans Blue",
                                    "team_a_wins": 1,
                                    "team_b_wins": 0,
                                    "team_a_goals": 1,
                                    "team_b_goals": 0,
                                },
                            )
                        ],
                    ),
                ],
                tools=[],
                max_output_tokens=500,
            )
        )
        self.assertIn("Titans Red has won 1 match", res_second.text)
        self.assertEqual(len(res_second.tool_calls), 0)
        self.assertEqual(res_second.provider_name, "claude")
