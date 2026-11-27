"""Pydantic schemas and sanitization helpers for Ruiru Titans MCP tools."""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Literal
from pydantic import BaseModel, Field

_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")


def sanitize_untrusted_text(value: Any, *, max_length: int = 500) -> str:
    """Normalize unicode, strip control characters, and bound length for untrusted text."""
    if value is None:
        return ""
    text = str(value)
    text = unicodedata.normalize("NFKC", text)
    text = _CONTROL_CHAR_RE.sub(" ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) > max_length:
        return text[:max_length]
    return text


class ListCategoriesInput(BaseModel):
    include_ended: bool = Field(default=False, description="Whether to include concluded tournaments.")


class CategorySummary(BaseModel):
    key: str
    label: str
    mode: str
    format: str
    is_ended: bool
    teams_count: int


class ListCategoriesOutput(BaseModel):
    categories: list[CategorySummary]
    total_count: int


class GetStandingsInput(BaseModel):
    category_key: str = Field(..., description="Unique slug key for the tournament category (e.g. 'main', 'championship').")


class StandingItem(BaseModel):
    rank: int
    team_name: str
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int
    goals_against: int
    goal_difference: int
    points: int
    form: list[str] = Field(default_factory=list)


class GetStandingsOutput(BaseModel):
    category_key: str
    category_label: str
    standings: list[StandingItem]


class GetFixturesInput(BaseModel):
    category_key: str = Field(..., description="Tournament category key.")
    status: Literal["all", "scheduled", "completed", "postponed"] = Field(
        default="all", description="Filter by fixture status."
    )
    team_name: str | None = Field(default=None, description="Optional team name filter.")
    limit: int = Field(default=20, ge=1, le=100, description="Maximum number of fixtures to return.")


class FixtureItem(BaseModel):
    id: str
    matchday: int | None = None
    home_team: str
    away_team: str
    date: str | None = None
    time: str | None = None
    venue: str = ""
    status: str
    home_score: int | None = None
    away_score: int | None = None
    walkover: str | None = None


class GetFixturesOutput(BaseModel):
    category_key: str
    total_found: int
    fixtures: list[FixtureItem]


class GetTopScorersInput(BaseModel):
    category_key: str = Field(..., description="Tournament category key.")
    limit: int = Field(default=10, ge=1, le=50, description="Top N scorers to return.")


class ScorerItem(BaseModel):
    rank: int
    player_name: str
    team_name: str
    goals: int
    penalties: int = 0
    assists: int = 0


class GetTopScorersOutput(BaseModel):
    category_key: str
    top_scorers: list[ScorerItem]


class GetPlayerDetailsInput(BaseModel):
    player_name: str = Field(..., description="Name or partial name of the player.")
    category_key: str | None = Field(default=None, description="Optional category key filter.")


class PlayerDetailItem(BaseModel):
    player_id: str
    name: str
    team_name: str
    position: str
    jersey_number: int | None = None
    goals: int = 0
    assists: int = 0
    yellow_cards: int = 0
    red_cards: int = 0
    is_active: bool = True
    is_banned: bool = False
    ban_details: str = ""


class GetPlayerDetailsOutput(BaseModel):
    matches_found: int
    players: list[PlayerDetailItem]


class GetTeamRosterInput(BaseModel):
    team_name: str = Field(..., description="Name or partial name of the team.")
    category_key: str | None = Field(default=None, description="Optional category key.")


class TeamRosterPlayer(BaseModel):
    player_id: str
    name: str
    position: str
    jersey_number: int | None = None
    is_active: bool = True


class GetTeamRosterOutput(BaseModel):
    team_name: str
    category_key: str
    squad_size: int
    players: list[TeamRosterPlayer]


class GetActiveTransfersInput(BaseModel):
    category_key: str | None = Field(default=None, description="Optional category key filter.")
    limit: int = Field(default=20, ge=1, le=100)


class TransferItem(BaseModel):
    id: int
    player_name: str
    from_team: str
    to_team: str
    status: str
    request_date: str
    reviewed_at: str | None = None


class GetActiveTransfersOutput(BaseModel):
    total_count: int
    transfers: list[TransferItem]


class GetActiveBansInput(BaseModel):
    category_key: str | None = Field(default=None, description="Optional category key filter.")


class BanItem(BaseModel):
    id: int
    player_name: str
    team_name: str
    category_key: str
    ban_type: str
    matches_left: int
    reason: str
    issued_date: str


class GetActiveBansOutput(BaseModel):
    active_bans_count: int
    bans: list[BanItem]


class GetWeeklyMvpInput(BaseModel):
    category_key: str = Field(..., description="Tournament category key.")
    week_number: int | None = Field(default=None, description="Specific week number, or omit for latest.")


class WeeklyMvpItem(BaseModel):
    week_number: int
    player_name: str
    team_name: str
    points: float
    headline: str
    created_at: str


class GetWeeklyMvpOutput(BaseModel):
    category_key: str
    mvps: list[WeeklyMvpItem]


class GetDutyRosterInput(BaseModel):
    category_key: str = Field(..., description="Tournament category key.")
    week_number: int | None = Field(default=None, description="Week/matchday number.")


class DutyAssignment(BaseModel):
    match_id: str
    duty_team: str
    assigned_roles: list[str] = Field(default_factory=list)


class GetDutyRosterOutput(BaseModel):
    category_key: str
    week_number: int | None = None
    assignments: list[DutyAssignment]


class GetH2HComparisonInput(BaseModel):
    team_a: str = Field(..., description="First team name.")
    team_b: str = Field(..., description="Second team name.")
    category_key: str | None = Field(default=None, description="Optional tournament category key.")


class H2HMatchItem(BaseModel):
    fixture_id: str
    date: str
    home_team: str
    away_team: str
    home_score: int
    away_score: int
    winner: str | None = None


class GetH2HComparisonOutput(BaseModel):
    team_a: str
    team_b: str
    total_played: int
    team_a_wins: int
    team_b_wins: int
    draws: int
    team_a_goals: int
    team_b_goals: int
    recent_matches: list[H2HMatchItem]


class GetVotingAndTotwInput(BaseModel):
    category_key: str = Field(..., description="Tournament category key.")
    week_number: int | None = Field(default=None, description="Specific voting round week number.")


class PositionVoteLeader(BaseModel):
    position: str
    player_name: str
    team_name: str
    votes: int


class GetVotingAndTotwOutput(BaseModel):
    category_key: str
    week_number: int | None = None
    is_open: bool = False
    formation: str = "4-3-3"
    custom_lineup: list[dict[str, Any]] = Field(default_factory=list)
    vote_leaders: list[PositionVoteLeader] = Field(default_factory=list)


class GetCupBracketsInput(BaseModel):
    category_key: str = Field(..., description="Cup category key.")


class CupMatchTie(BaseModel):
    tie_index: int | None = None
    round_index: int | None = None
    round_name: str
    home_team: str
    away_team: str
    home_score: int | None = None
    away_score: int | None = None
    winner: str | None = None
    played: bool = False


class GetCupBracketsOutput(BaseModel):
    category_key: str
    category_label: str
    rounds: list[str] = Field(default_factory=list)
    knockout_matches: list[CupMatchTie] = Field(default_factory=list)


class ListHighlightsInput(BaseModel):
    category_key: str | None = Field(default=None, description="Optional category key filter.")
    limit: int = Field(default=10, ge=1, le=50, description="Max highlights to return.")


class HighlightItem(BaseModel):
    id: int
    title: str
    description: str
    category_key: str
    match_name: str
    match_date: str | None = None
    video_url: str
    duration: str = ""


class ListHighlightsOutput(BaseModel):
    total_count: int
    highlights: list[HighlightItem]


class ListRefereesInput(BaseModel):
    category_key: str | None = Field(default=None, description="Optional category key filter.")


class RefereeItem(BaseModel):
    id: int
    name: str
    category_key: str
    matches_officiated: int = 0


class ListRefereesOutput(BaseModel):
    total_count: int
    referees: list[RefereeItem]


class GetPlatformAuditLogsInput(BaseModel):
    category_key: str | None = Field(default=None, description="Optional category key filter.")
    action: str | None = Field(default=None, description="Optional action filter (e.g. 'update', 'create', 'ban').")
    limit: int = Field(default=20, ge=1, le=100, description="Max audit entries to return.")


class AuditLogEntry(BaseModel):
    id: int
    actor_username: str
    actor_role: str
    event_type: str
    action: str
    target: str
    category_key: str
    details: dict[str, Any] = Field(default_factory=dict)
    city: str = ""
    country: str = ""
    created_at: str


class GetPlatformAuditLogsOutput(BaseModel):
    total_count: int
    entries: list[AuditLogEntry]

