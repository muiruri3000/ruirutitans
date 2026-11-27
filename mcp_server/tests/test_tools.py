"""Unit tests for Ruiru Titans MCP tools."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from tournaments.models import (
    Category,
    Team,
    Player,
    Fixture,
    MatchEvent,
    TransferRequest,
    PlayerBan,
    WeeklyMVP,
    Referee,
    VotingRound,
    PositionVote,
    HighlightVideo,
    AuditLog,
)
from mcp_server.auth import VerifiedActor
from mcp_server.schemas import (
    ListCategoriesInput,
    GetStandingsInput,
    GetFixturesInput,
    GetTopScorersInput,
    GetPlayerDetailsInput,
    GetTeamRosterInput,
    GetActiveTransfersInput,
    GetActiveBansInput,
    GetWeeklyMvpInput,
    GetDutyRosterInput,
    GetH2HComparisonInput,
    GetVotingAndTotwInput,
    GetCupBracketsInput,
    ListHighlightsInput,
    ListRefereesInput,
    GetPlatformAuditLogsInput,
)
from mcp_server.tools.tournaments_tools import (
    list_categories_handler,
    get_standings_handler,
    get_fixtures_handler,
    get_top_scorers_handler,
    get_player_details_handler,
    get_team_roster_handler,
    get_active_transfers_handler,
    get_active_bans_handler,
    get_weekly_mvp_handler,
    get_duty_roster_handler,
    get_h2h_comparison_handler,
    get_voting_and_totw_handler,
    get_cup_brackets_handler,
    list_highlights_handler,
    list_referees_handler,
    get_platform_audit_logs_handler,
)

User = get_user_model()


class McpToolsTestCase(TestCase):
    def setUp(self):
        self.staff_user = User.objects.create_user(
            username="admin_staff",
            is_staff=True,
            is_active=True,
        )
        self.actor = VerifiedActor(
            user=self.staff_user,
            role="staff",
            jti="test-jti",
            token_claims={},
        )
        self.category = Category.objects.create(
            key="test_league",
            label="Test Super League",
            mode="league",
            format="double",
        )
        self.team_a = Team.objects.create(
            category=self.category,
            team_id="team_a",
            name="Titans Red",
            color="#FF0000",
        )
        self.team_b = Team.objects.create(
            category=self.category,
            team_id="team_b",
            name="Titans Blue",
            color="#0000FF",
        )
        self.player_a = Player.objects.create(
            category=self.category,
            team=self.team_a,
            player_id="p_1",
            name="Victor Wanyama",
            position="Midfielder",
            jersey_number=6,
        )
        self.fixture = Fixture.objects.create(
            category=self.category,
            fixture_id="fix_1",
            home_team=self.team_a,
            away_team=self.team_b,
            date="2026-11-20",
            played=True,
        )
        MatchEvent.objects.create(
            fixture=self.fixture,
            team=self.team_a,
            player=self.player_a,
            event_type="goal",
        )

    def test_list_categories(self):
        out = list_categories_handler(self.actor, ListCategoriesInput(include_ended=True))
        self.assertGreaterEqual(out.total_count, 1)
        keys = [c.key for c in out.categories]
        self.assertIn("test_league", keys)

    def test_get_standings(self):
        out = get_standings_handler(self.actor, GetStandingsInput(category_key="test_league"))
        self.assertEqual(len(out.standings), 2)
        top = out.standings[0]
        self.assertEqual(top.team_name, "Titans Red")
        self.assertEqual(top.points, 3)
        self.assertEqual(top.won, 1)

    def test_get_fixtures(self):
        out = get_fixtures_handler(
            self.actor,
            GetFixturesInput(category_key="test_league", status="all"),
        )
        self.assertEqual(out.total_found, 1)
        f = out.fixtures[0]
        self.assertEqual(f.home_team, "Titans Red")
        self.assertEqual(f.away_team, "Titans Blue")
        self.assertEqual(f.home_score, 1)
        self.assertEqual(f.away_score, 0)

    def test_get_top_scorers(self):
        out = get_top_scorers_handler(
            self.actor,
            GetTopScorersInput(category_key="test_league", limit=5),
        )
        self.assertEqual(len(out.top_scorers), 1)
        self.assertEqual(out.top_scorers[0].player_name, "Victor Wanyama")
        self.assertEqual(out.top_scorers[0].goals, 1)

    def test_get_player_details(self):
        out = get_player_details_handler(
            self.actor,
            GetPlayerDetailsInput(player_name="Wanyama"),
        )
        self.assertEqual(out.matches_found, 1)
        p = out.players[0]
        self.assertEqual(p.name, "Victor Wanyama")
        self.assertEqual(p.team_name, "Titans Red")
        self.assertEqual(p.goals, 1)

    def test_get_team_roster(self):
        out = get_team_roster_handler(
            self.actor,
            GetTeamRosterInput(team_name="Titans Red", category_key="test_league"),
        )
        self.assertEqual(out.squad_size, 1)
        self.assertEqual(out.players[0].name, "Victor Wanyama")

    def test_get_h2h_comparison(self):
        out = get_h2h_comparison_handler(
            self.actor,
            GetH2HComparisonInput(team_a="Titans Red", team_b="Titans Blue"),
        )
        self.assertEqual(out.total_played, 1)
        self.assertEqual(out.team_a_wins, 1)
        self.assertEqual(out.team_b_wins, 0)
        self.assertEqual(out.team_a_goals, 1)
        self.assertEqual(out.team_b_goals, 0)
        self.assertEqual(out.recent_matches[0].winner, "Titans Red")

    def test_get_voting_and_totw(self):
        vr = VotingRound.objects.create(
            category=self.category,
            week_number=1,
            title="Gameweek 1",
            is_open=True,
            formation="4-3-3",
        )
        PositionVote.objects.create(
            voting_round=vr,
            player=self.player_a,
            position="CM",
            voter_id="user_123",
        )
        out = get_voting_and_totw_handler(
            self.actor,
            GetVotingAndTotwInput(category_key="test_league", week_number=1),
        )
        self.assertEqual(out.category_key, "test_league")
        self.assertEqual(out.week_number, 1)
        self.assertTrue(out.is_open)
        self.assertGreaterEqual(len(out.vote_leaders), 1)
        self.assertEqual(out.vote_leaders[0].player_name, "Victor Wanyama")

    def test_get_cup_brackets(self):
        cup_cat = Category.objects.create(
            key="test_cup",
            label="Titans Cup",
            mode="cup",
            format="knockout",
        )
        Fixture.objects.create(
            category=cup_cat,
            fixture_id="cup_final",
            home_team=self.team_a,
            away_team=self.team_b,
            phase="knockout",
            round_index=0,
            tie_index=1,
            played=True,
        )
        out = get_cup_brackets_handler(
            self.actor,
            GetCupBracketsInput(category_key="test_cup"),
        )
        self.assertEqual(out.category_key, "test_cup")
        self.assertEqual(len(out.knockout_matches), 1)
        self.assertEqual(out.knockout_matches[0].round_name, "Final")

    def test_list_highlights(self):
        HighlightVideo.objects.create(
            title="Goal of the season contender",
            description="Spectacular volley from outside the box",
            category_key="test_league",
            match_name="Titans Red vs Titans Blue",
            video_url="https://youtube.com/watch?v=12345",
            duration="02:15",
        )
        out = list_highlights_handler(
            self.actor,
            ListHighlightsInput(category_key="test_league", limit=5),
        )
        self.assertEqual(out.total_count, 1)
        self.assertEqual(len(out.highlights), 1)
        self.assertIn("Goal of the season", out.highlights[0].title)

    def test_list_referees(self):
        Referee.objects.create(
            category=self.category,
            name="Peter Waweru",
        )
        out = list_referees_handler(
            self.actor,
            ListRefereesInput(category_key="test_league"),
        )
        self.assertEqual(out.total_count, 1)
        self.assertEqual(out.referees[0].name, "Peter Waweru")

    def test_get_platform_audit_logs(self):
        AuditLog.objects.create(
            actor_type="cms",
            actor_username="admin_staff",
            actor_role="staff",
            event_type="activity",
            action="Updated category rules",
            target="test_league",
            category_key="test_league",
        )
        out = get_platform_audit_logs_handler(
            self.actor,
            GetPlatformAuditLogsInput(category_key="test_league", limit=10),
        )
        self.assertEqual(out.total_count, 1)
        self.assertEqual(out.entries[0].actor_username, "admin_staff")
        self.assertEqual(out.entries[0].action, "Updated category rules")
