"""Read-only MCP tool registration for Ruiru Titans Football Platform."""

from __future__ import annotations

from typing import Literal
from mcp.server.mcpserver import Context, MCPServer
from pydantic import Field

from mcp_server.auth import STAFF_MCP_ROLES
from mcp_server.context import (
    READONLY_TOOL_ANNOTATIONS,
    enforce_strict_tool_schema,
    run_scoped_sync_tool,
)
from mcp_server.schemas import (
    ListCategoriesInput,
    ListCategoriesOutput,
    GetStandingsInput,
    GetStandingsOutput,
    GetFixturesInput,
    GetFixturesOutput,
    GetTopScorersInput,
    GetTopScorersOutput,
    GetPlayerDetailsInput,
    GetPlayerDetailsOutput,
    GetTeamRosterInput,
    GetTeamRosterOutput,
    GetActiveTransfersInput,
    GetActiveTransfersOutput,
    GetActiveBansInput,
    GetActiveBansOutput,
    GetWeeklyMvpInput,
    GetWeeklyMvpOutput,
    GetDutyRosterInput,
    GetDutyRosterOutput,
    GetH2HComparisonInput,
    GetH2HComparisonOutput,
    GetVotingAndTotwInput,
    GetVotingAndTotwOutput,
    GetCupBracketsInput,
    GetCupBracketsOutput,
    ListHighlightsInput,
    ListHighlightsOutput,
    ListRefereesInput,
    ListRefereesOutput,
    GetPlatformAuditLogsInput,
    GetPlatformAuditLogsOutput,
    GetCleanSheetsAndCardsInput,
    GetCleanSheetsAndCardsOutput,
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
    get_clean_sheets_and_cards_handler,
)


def register_readonly_tools(server: MCPServer) -> None:
    """Register all verified read-only Ruiru Titans MCP tools onto ``server``."""

    @server.tool(
        name="list_categories",
        title="List Tournament Categories",
        description="List all available football tournament categories, modes, and team counts.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def list_categories_tool(
        ctx: Context,
        include_ended: bool = Field(default=False, description="Whether to include concluded tournaments."),
    ) -> ListCategoriesOutput:
        return await run_scoped_sync_tool(
            "list_categories",
            ListCategoriesInput,
            {"include_ended": include_ended},
            list_categories_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_standings",
        title="Get League Standings",
        description="Retrieve official league table standings with points, goal differences, and recent form.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_standings_tool(
        ctx: Context,
        category_key: str = Field(..., description="Unique slug key for tournament (e.g. 'main', 'championship')."),
    ) -> GetStandingsOutput:
        return await run_scoped_sync_tool(
            "get_standings",
            GetStandingsInput,
            {"category_key": category_key},
            get_standings_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_fixtures",
        title="Get Fixtures & Match Results",
        description="Retrieve match schedule and score results filtered by status or team name.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_fixtures_tool(
        ctx: Context,
        category_key: str = Field(..., description="Tournament category key."),
        status: Literal["all", "scheduled", "completed", "postponed"] = Field(
            default="all", description="Filter by fixture status."
        ),
        team_name: str | None = Field(default=None, description="Optional team name filter."),
        limit: int = Field(default=20, ge=1, le=100, description="Max fixtures to return."),
    ) -> GetFixturesOutput:
        return await run_scoped_sync_tool(
            "get_fixtures",
            GetFixturesInput,
            {"category_key": category_key, "status": status, "team_name": team_name, "limit": limit},
            get_fixtures_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_top_scorers",
        title="Get Top Scorers Leaderboard",
        description="Retrieve leading goalscorers, penalty conversions, and assists.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_top_scorers_tool(
        ctx: Context,
        category_key: str = Field(..., description="Tournament category key."),
        limit: int = Field(default=10, ge=1, le=50, description="Top N scorers."),
    ) -> GetTopScorersOutput:
        return await run_scoped_sync_tool(
            "get_top_scorers",
            GetTopScorersInput,
            {"category_key": category_key, "limit": limit},
            get_top_scorers_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_player_details",
        title="Get Player Details & Disciplinary Status",
        description="Search for a player by name to view goals, assists, cards, squad, and ban status.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_player_details_tool(
        ctx: Context,
        player_name: str = Field(..., description="Name or partial name of player."),
        category_key: str | None = Field(default=None, description="Optional category key filter."),
    ) -> GetPlayerDetailsOutput:
        return await run_scoped_sync_tool(
            "get_player_details",
            GetPlayerDetailsInput,
            {"player_name": player_name, "category_key": category_key},
            get_player_details_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_team_roster",
        title="Get Team Roster",
        description="Retrieve full squad lineup, positions, and active players for a football team.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_team_roster_tool(
        ctx: Context,
        team_name: str = Field(..., description="Team name."),
        category_key: str | None = Field(default=None, description="Optional category key filter."),
    ) -> GetTeamRosterOutput:
        return await run_scoped_sync_tool(
            "get_team_roster",
            GetTeamRosterInput,
            {"team_name": team_name, "category_key": category_key},
            get_team_roster_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_active_transfers",
        title="Get Active Transfers",
        description="List player transfers, pending loan/permanent requests, and free agent moves.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_active_transfers_tool(
        ctx: Context,
        category_key: str | None = Field(default=None, description="Optional category key filter."),
        limit: int = Field(default=20, ge=1, le=100),
    ) -> GetActiveTransfersOutput:
        return await run_scoped_sync_tool(
            "get_active_transfers",
            GetActiveTransfersInput,
            {"category_key": category_key, "limit": limit},
            get_active_transfers_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_active_bans",
        title="Get Disciplinary Bans",
        description="List active player suspensions, match bans remaining, and disciplinary reasons.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_active_bans_tool(
        ctx: Context,
        category_key: str | None = Field(default=None, description="Optional category key filter."),
    ) -> GetActiveBansOutput:
        return await run_scoped_sync_tool(
            "get_active_bans",
            GetActiveBansInput,
            {"category_key": category_key},
            get_active_bans_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_weekly_mvp",
        title="Get Weekly MVP Spotlight",
        description="Retrieve Weekly MVP honours, point scores, and spotlight player performances.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_weekly_mvp_tool(
        ctx: Context,
        category_key: str = Field(..., description="Tournament category key."),
        week_number: int | None = Field(default=None, description="Specific week number, or latest."),
    ) -> GetWeeklyMvpOutput:
        return await run_scoped_sync_tool(
            "get_weekly_mvp",
            GetWeeklyMvpInput,
            {"category_key": category_key, "week_number": week_number},
            get_weekly_mvp_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_duty_roster",
        title="Get Officiating Duty Roster",
        description="Retrieve officiating assignments and duty teams for scheduled matchdays.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_duty_roster_tool(
        ctx: Context,
        category_key: str = Field(..., description="Tournament category key."),
        week_number: int | None = Field(default=None, description="Week / matchday number."),
    ) -> GetDutyRosterOutput:
        return await run_scoped_sync_tool(
            "get_duty_roster",
            GetDutyRosterInput,
            {"category_key": category_key, "week_number": week_number},
            get_duty_roster_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_h2h_comparison",
        title="Get Head-to-Head Comparison",
        description="Analyze head-to-head records, past encounters, and goal differentials between two clubs.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_h2h_comparison_tool(
        ctx: Context,
        team_a: str = Field(..., description="First team name or ID."),
        team_b: str = Field(..., description="Second team name or ID."),
        category_key: str | None = Field(default=None, description="Optional tournament category key."),
    ) -> GetH2HComparisonOutput:
        return await run_scoped_sync_tool(
            "get_h2h_comparison",
            GetH2HComparisonInput,
            {"team_a": team_a, "team_b": team_b, "category_key": category_key},
            get_h2h_comparison_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_voting_and_totw",
        title="Get TOTW & Voting Round",
        description="Retrieve community Team of the Week (TOTW) lineup and position vote leaderboards.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_voting_and_totw_tool(
        ctx: Context,
        category_key: str = Field(..., description="Tournament category key."),
        week_number: int | None = Field(default=None, description="Optional voting round week number."),
    ) -> GetVotingAndTotwOutput:
        return await run_scoped_sync_tool(
            "get_voting_and_totw",
            GetVotingAndTotwInput,
            {"category_key": category_key, "week_number": week_number},
            get_voting_and_totw_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_cup_brackets",
        title="Get Cup Knockout Brackets",
        description="Retrieve knockout cup tournament bracket ties, progression rounds, and matchup scores.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_cup_brackets_tool(
        ctx: Context,
        category_key: str = Field(..., description="Cup tournament category key."),
    ) -> GetCupBracketsOutput:
        return await run_scoped_sync_tool(
            "get_cup_brackets",
            GetCupBracketsInput,
            {"category_key": category_key},
            get_cup_brackets_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="list_highlights",
        title="List Match Highlights",
        description="Retrieve match video highlights, clips, and goals with media links.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def list_highlights_tool(
        ctx: Context,
        category_key: str | None = Field(default=None, description="Optional category key filter."),
        limit: int = Field(default=10, ge=1, le=50, description="Max highlights to return."),
    ) -> ListHighlightsOutput:
        return await run_scoped_sync_tool(
            "list_highlights",
            ListHighlightsInput,
            {"category_key": category_key, "limit": limit},
            list_highlights_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="list_referees",
        title="List Match Referees",
        description="List registered match officials, appointed tournaments, and count of matches officiated.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def list_referees_tool(
        ctx: Context,
        category_key: str | None = Field(default=None, description="Optional category key filter."),
    ) -> ListRefereesOutput:
        return await run_scoped_sync_tool(
            "list_referees",
            ListRefereesInput,
            {"category_key": category_key},
            list_referees_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_platform_audit_logs",
        title="Get Platform Audit Logs",
        description="Retrieve platform administrative, security, and tournament audit log entries.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_platform_audit_logs_tool(
        ctx: Context,
        category_key: str | None = Field(default=None, description="Optional category key filter."),
        action: str | None = Field(default=None, description="Optional action filter."),
        limit: int = Field(default=20, ge=1, le=100, description="Max entries to return."),
    ) -> GetPlatformAuditLogsOutput:
        return await run_scoped_sync_tool(
            "get_platform_audit_logs",
            GetPlatformAuditLogsInput,
            {"category_key": category_key, "action": action, "limit": limit},
            get_platform_audit_logs_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    @server.tool(
        name="get_clean_sheets_and_cards",
        title="Get Clean Sheets & Disciplinary Card Totals",
        description="Retrieve clean-sheet leaderboards, team and player yellow/red card totals, and active bans status.",
        annotations=READONLY_TOOL_ANNOTATIONS,
    )
    async def get_clean_sheets_and_cards_tool(
        ctx: Context,
        category_key: str = Field(..., description="Tournament category key."),
        limit: int = Field(default=10, ge=1, le=50, description="Max leaderboard rows to return."),
    ) -> GetCleanSheetsAndCardsOutput:
        return await run_scoped_sync_tool(
            "get_clean_sheets_and_cards",
            GetCleanSheetsAndCardsInput,
            {"category_key": category_key, "limit": limit},
            get_clean_sheets_and_cards_handler,
            allowed_roles=STAFF_MCP_ROLES,
        )

    if hasattr(server, "_tool_manager") and hasattr(server._tool_manager, "_tools"):
        for tool in server._tool_manager._tools.values():
            enforce_strict_tool_schema(tool)
