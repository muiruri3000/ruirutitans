"""Integration tests for orchestrator multi-round tool calling."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from tournaments.models import Category, Team, Player, Fixture, MatchEvent
from ai_assistant.models import AIConversation, AIMessage, AIToolExecution
from ai_assistant.orchestrator import execute_turn
from ai_assistant.providers.base import (
    BaseLLMProvider,
    LLMResponse,
    LLMToolCall,
    LLMUsage,
)

User = get_user_model()


class MockTwoRoundProvider(BaseLLMProvider):
    provider_name = "mock_two_round"
    model_name = "mock-model"

    def __init__(self):
        self.call_count = 0

    async def generate(self, *, messages, tools, **kwargs):
        self.call_count += 1
        if self.call_count == 1:
            # Emit tool call
            return LLMResponse(
                text="Checking category standings...",
                tool_calls=[
                    LLMToolCall(
                        call_id="call_round_1",
                        name="get_standings",
                        arguments={"category_key": "senior_champ"},
                    )
                ],
                usage=LLMUsage(prompt_tokens=50, completion_tokens=15, total_tokens=65),
                finish_reason="tool_calls",
                model_name=self.model_name,
                provider_name=self.provider_name,
            )
        else:
            # Final grounded answer based on tool results
            return LLMResponse(
                text="Titans Gold lead the standings with 3 points after winning 2-0.",
                tool_calls=[],
                usage=LLMUsage(prompt_tokens=120, completion_tokens=30, total_tokens=150),
                finish_reason="stop",
                model_name=self.model_name,
                provider_name=self.provider_name,
            )


class OrchestratorIntegrationTestCase(TestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username="head_coach",
            is_staff=True,
            is_active=True,
        )
        self.category = Category.objects.create(
            key="senior_champ",
            label="Senior Championship",
            mode="league",
        )
        self.team_gold = Team.objects.create(
            category=self.category,
            team_id="gold",
            name="Titans Gold",
        )
        self.team_silver = Team.objects.create(
            category=self.category,
            team_id="silver",
            name="Titans Silver",
        )
        self.fixture = Fixture.objects.create(
            category=self.category,
            fixture_id="fix_champ_1",
            home_team=self.team_gold,
            away_team=self.team_silver,
            date="2026-11-25",
            played=True,
        )
        MatchEvent.objects.create(
            fixture=self.fixture,
            team=self.team_gold,
            event_type="goal",
        )
        MatchEvent.objects.create(
            fixture=self.fixture,
            team=self.team_gold,
            event_type="goal",
        )

    def test_multi_round_tool_execution_flow(self):
        conv = AIConversation.objects.create(
            user=self.staff_user,
            title="Senior Champ Analysis",
            provider_name="mock_two_round",
        )

        mock_prov = MockTwoRoundProvider()

        from unittest.mock import patch
        with patch("ai_assistant.orchestrator.get_llm_provider", return_value=mock_prov):
            turn_res = execute_turn(
                user=self.staff_user,
                conversation=conv,
                raw_user_message="Who is leading the Senior Championship?",
            )

        self.assertEqual(mock_prov.call_count, 2)
        self.assertEqual(turn_res.user_message.content, "Who is leading the Senior Championship?")
        self.assertIn("Titans Gold", turn_res.assistant_message.content)
        self.assertEqual(turn_res.assistant_message.tool_rounds_used, 2)
        self.assertEqual(turn_res.assistant_message.grounding_status, "grounded")

        # Verify tool execution audit was saved
        tool_execs = AIToolExecution.objects.filter(conversation=conv)
        self.assertEqual(tool_execs.count(), 1)
        exec_record = tool_execs.first()
        self.assertEqual(exec_record.tool_name, "get_standings")
        self.assertEqual(exec_record.status, "success")
        self.assertEqual(exec_record.arguments, {"category_key": "senior_champ"})
        self.assertIn("standings", exec_record.result_payload)

        # Verify conversation token accounting
        conv.refresh_from_db()
        self.assertEqual(conv.total_prompt_tokens, 170)
        self.assertEqual(conv.total_completion_tokens, 45)
        self.assertEqual(conv.total_tokens, 215)
