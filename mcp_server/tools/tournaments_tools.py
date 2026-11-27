"""Domain read-only tools for Ruiru Titans Football Platform."""

from __future__ import annotations

import logging
from typing import Any
from django.db.models import Count, Q

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
    ListCategoriesOutput,
    CategorySummary,
    GetStandingsInput,
    GetStandingsOutput,
    StandingItem,
    GetFixturesInput,
    GetFixturesOutput,
    FixtureItem,
    GetTopScorersInput,
    GetTopScorersOutput,
    ScorerItem,
    GetPlayerDetailsInput,
    GetPlayerDetailsOutput,
    PlayerDetailItem,
    GetTeamRosterInput,
    GetTeamRosterOutput,
    TeamRosterPlayer,
    GetActiveTransfersInput,
    GetActiveTransfersOutput,
    TransferItem,
    GetActiveBansInput,
    GetActiveBansOutput,
    BanItem,
    GetWeeklyMvpInput,
    GetWeeklyMvpOutput,
    WeeklyMvpItem,
    GetDutyRosterInput,
    GetDutyRosterOutput,
    DutyAssignment,
    GetH2HComparisonInput,
    GetH2HComparisonOutput,
    H2HMatchItem,
    GetVotingAndTotwInput,
    GetVotingAndTotwOutput,
    PositionVoteLeader,
    GetCupBracketsInput,
    GetCupBracketsOutput,
    CupMatchTie,
    ListHighlightsInput,
    ListHighlightsOutput,
    HighlightItem,
    ListRefereesInput,
    ListRefereesOutput,
    RefereeItem,
    GetPlatformAuditLogsInput,
    GetPlatformAuditLogsOutput,
    AuditLogEntry,
    GetCleanSheetsAndCardsInput,
    GetCleanSheetsAndCardsOutput,
    TeamCleanSheetItem,
    GoalkeeperCleanSheetItem,
    PlayerCardItem,
    TeamCardItem,
    sanitize_untrusted_text,
)

logger = logging.getLogger("mcp_server.tools")


def list_categories_handler(actor: VerifiedActor, params: ListCategoriesInput) -> ListCategoriesOutput:
    """List all available football tournament categories."""
    qs = Category.objects.filter(is_deleted=False)
    if not params.include_ended:
        qs = qs.filter(is_ended=False)

    summaries: list[CategorySummary] = []
    for cat in qs.order_by("key"):
        summaries.append(
            CategorySummary(
                key=cat.key,
                label=cat.label,
                mode=cat.mode,
                format=cat.format,
                is_ended=bool(cat.is_ended),
                teams_count=cat.teams.count(),
            )
        )
    return ListCategoriesOutput(categories=summaries, total_count=len(summaries))


def get_standings_handler(actor: VerifiedActor, params: GetStandingsInput) -> GetStandingsOutput:
    """Calculate and return league standings table for a tournament category."""
    cat = Category.objects.filter(key=params.category_key, is_deleted=False).first()
    if not cat:
        return GetStandingsOutput(category_key=params.category_key, category_label="Not Found", standings=[])

    teams = list(cat.teams.all())
    fixtures = cat.fixtures.all()

    table: dict[str, dict[str, Any]] = {
        t.team_id: {
            "name": t.name,
            "P": 0,
            "W": 0,
            "D": 0,
            "L": 0,
            "GF": 0,
            "GA": 0,
            "GD": 0,
            "Pts": 0,
            "form": [],
        }
        for t in teams
    }

    completed_fixtures = [
        f for f in fixtures
        if f.played or f.events.exists() or f.walkover_winner_id
    ]

    for f in completed_fixtures:
        hs, as_score = f.score
        h_id = f.home_team.team_id if f.home_team else None
        a_id = f.away_team.team_id if f.away_team else None

        if h_id and h_id in table and a_id and a_id in table:
            table[h_id]["P"] += 1
            table[a_id]["P"] += 1
            table[h_id]["GF"] += hs
            table[h_id]["GA"] += as_score
            table[a_id]["GF"] += as_score
            table[a_id]["GA"] += hs

            if hs > as_score:
                table[h_id]["W"] += 1
                table[h_id]["Pts"] += 3
                table[a_id]["L"] += 1
                table[h_id]["form"].append("W")
                table[a_id]["form"].append("L")
            elif hs < as_score:
                table[a_id]["W"] += 1
                table[a_id]["Pts"] += 3
                table[h_id]["L"] += 1
                table[a_id]["form"].append("W")
                table[h_id]["form"].append("L")
            else:
                table[h_id]["D"] += 1
                table[a_id]["D"] += 1
                table[h_id]["Pts"] += 1
                table[a_id]["Pts"] += 1
                table[h_id]["form"].append("D")
                table[a_id]["form"].append("D")

    rows = []
    for tid, row in table.items():
        row["GD"] = row["GF"] - row["GA"]
        row["form"] = row["form"][-5:]  # last 5 games form
        rows.append(row)

    rows.sort(key=lambda x: (x["Pts"], x["GD"], x["GF"]), reverse=True)

    items: list[StandingItem] = []
    for rank, r in enumerate(rows, 1):
        items.append(
            StandingItem(
                rank=rank,
                team_name=r["name"],
                played=r["P"],
                won=r["W"],
                drawn=r["D"],
                lost=r["L"],
                goals_for=r["GF"],
                goals_against=r["GA"],
                goal_difference=r["GD"],
                points=r["Pts"],
                form=r["form"],
            )
        )
    return GetStandingsOutput(
        category_key=cat.key,
        category_label=cat.label,
        standings=items,
    )


def get_fixtures_handler(actor: VerifiedActor, params: GetFixturesInput) -> GetFixturesOutput:
    """Retrieve fixtures and scores matching status and team criteria."""
    cat = Category.objects.filter(key=params.category_key, is_deleted=False).first()
    if not cat:
        return GetFixturesOutput(category_key=params.category_key, total_found=0, fixtures=[])

    qs = cat.fixtures.select_related("home_team", "away_team", "walkover_winner").all()

    if params.team_name:
        team_search = params.team_name.strip()
        qs = qs.filter(
            Q(home_team__name__icontains=team_search) | Q(away_team__name__icontains=team_search)
        )

    if params.status == "completed":
        qs = qs.filter(Q(played=True) | Q(walkover_winner__isnull=False))
    elif params.status == "scheduled":
        qs = qs.filter(played=False, walkover_winner__isnull=True, is_postponed=False)
    elif params.status == "postponed":
        qs = qs.filter(is_postponed=True)

    total = qs.count()
    items: list[FixtureItem] = []
    schedule_venue = cat.schedule.get("venue", "Thoome Pri.")
    schedule_time = cat.schedule.get("time", "18:00")

    for f in qs.order_by("date", "id")[:params.limit]:
        is_postponed = bool(getattr(f, "is_postponed", False))
        status_label = "completed" if (f.played or f.walkover_winner_id) else ("postponed" if is_postponed else "scheduled")
        hs, as_score = f.score if (f.played or f.walkover_winner_id or f.events.exists()) else (None, None)
        walkover_name = f.walkover_winner.name if f.walkover_winner else None

        items.append(
            FixtureItem(
                id=str(f.fixture_id or f.id),
                matchday=f.round_index if f.round_index is not None else None,
                home_team=f.home_team.name if f.home_team else "TBD",
                away_team=f.away_team.name if f.away_team else "TBD",
                date=str(f.date) if f.date else None,
                time=schedule_time,
                venue=schedule_venue,
                status=status_label,
                home_score=hs,
                away_score=as_score,
                walkover=walkover_name,
            )
        )

    return GetFixturesOutput(category_key=cat.key, total_found=total, fixtures=items)


def get_top_scorers_handler(actor: VerifiedActor, params: GetTopScorersInput) -> GetTopScorersOutput:
    """Retrieve top goalscorers and assist leaders for a category."""
    cat = Category.objects.filter(key=params.category_key, is_deleted=False).first()
    if not cat:
        return GetTopScorersOutput(category_key=params.category_key, top_scorers=[])

    events = MatchEvent.objects.filter(
        fixture__category=cat,
        event_type="goal",
        is_interference=False,
    ).select_related("player", "team")

    stats: dict[str, dict[str, Any]] = {}
    for ev in events:
        if not ev.player:
            continue
        pid = ev.player.player_id
        if pid not in stats:
            stats[pid] = {
                "name": ev.player.name,
                "team": ev.team.name if ev.team else (ev.player.team.name if ev.player.team else "Free Agent"),
                "goals": 0,
                "penalties": 0,
                "assists": 0,
            }
        stats[pid]["goals"] += 1
        if ev.is_penalty:
            stats[pid]["penalties"] += 1

    assist_events = MatchEvent.objects.filter(
        fixture__category=cat,
        assist_player__isnull=False,
    ).select_related("assist_player")

    for ev in assist_events:
        pid = ev.assist_player.player_id
        if pid in stats:
            stats[pid]["assists"] += 1

    sorted_scorers = sorted(stats.values(), key=lambda x: (x["goals"], x["assists"]), reverse=True)
    items: list[ScorerItem] = []
    for rank, s in enumerate(sorted_scorers[:params.limit], 1):
        items.append(
            ScorerItem(
                rank=rank,
                player_name=s["name"],
                team_name=s["team"],
                goals=s["goals"],
                penalties=s["penalties"],
                assists=s["assists"],
            )
        )
    return GetTopScorersOutput(category_key=cat.key, top_scorers=items)


def get_player_details_handler(actor: VerifiedActor, params: GetPlayerDetailsInput) -> GetPlayerDetailsOutput:
    """Retrieve player biography, performance stats, and disciplinary ban status."""
    qs = Player.objects.filter(name__icontains=params.player_name.strip(), is_unknown=False)
    if params.category_key:
        qs = qs.filter(category__key=params.category_key)

    items: list[PlayerDetailItem] = []
    for p in qs[:20]:
        goals_count = MatchEvent.objects.filter(player=p, event_type="goal").count()
        assists_count = MatchEvent.objects.filter(assist_player=p).count()
        yellow_count = MatchEvent.objects.filter(player=p, event_type="yellow").count()
        red_count = MatchEvent.objects.filter(player=p, event_type="red").count()

        active_ban = PlayerBan.objects.filter(player=p, is_active=True).first()
        is_banned = active_ban is not None
        ban_details = (
            f"Banned: {active_ban.games_banned} games left ({active_ban.reason})"
            if active_ban else ""
        )

        items.append(
            PlayerDetailItem(
                player_id=p.player_id,
                name=p.name,
                team_name=p.team.name if p.team else "Free Agent",
                position=p.position or "Unknown",
                jersey_number=p.jersey_number,
                goals=goals_count,
                assists=assists_count,
                yellow_cards=yellow_count,
                red_cards=red_count,
                is_active=bool(p.is_active),
                is_banned=is_banned,
                ban_details=ban_details,
            )
        )
    return GetPlayerDetailsOutput(matches_found=len(items), players=items)


def get_team_roster_handler(actor: VerifiedActor, params: GetTeamRosterInput) -> GetTeamRosterOutput:
    """Retrieve official squad list and positions for a team."""
    team_qs = Team.objects.filter(name__icontains=params.team_name.strip())
    if params.category_key:
        team_qs = team_qs.filter(category__key=params.category_key)
    team = team_qs.first()

    if not team:
        return GetTeamRosterOutput(
            team_name=params.team_name,
            category_key=params.category_key or "",
            squad_size=0,
            players=[],
        )

    players = team.players.filter(is_unknown=False).order_by("jersey_number", "name")
    items = [
        TeamRosterPlayer(
            player_id=p.player_id,
            name=p.name,
            position=p.position or "Midfielder",
            jersey_number=p.jersey_number,
            is_active=bool(p.is_active),
        )
        for p in players
    ]
    return GetTeamRosterOutput(
        team_name=team.name,
        category_key=team.category.key if team.category else "",
        squad_size=len(items),
        players=items,
    )


def get_active_transfers_handler(actor: VerifiedActor, params: GetActiveTransfersInput) -> GetActiveTransfersOutput:
    """List recent transfer requests and approved moves."""
    qs = TransferRequest.objects.select_related("player", "from_team", "to_team", "category").all()
    if params.category_key:
        qs = qs.filter(category__key=params.category_key)

    total = qs.count()
    items: list[TransferItem] = []
    for tr in qs.order_by("-created_at")[:params.limit]:
        items.append(
            TransferItem(
                id=tr.id,
                player_name=tr.player.name if tr.player else "Unknown",
                from_team=tr.from_team.name if tr.from_team else "Free Agent",
                to_team=tr.to_team.name if tr.to_team else "Unknown",
                status=tr.status,
                request_date=tr.created_at.strftime("%Y-%m-%d"),
                reviewed_at=tr.reviewed_at.strftime("%Y-%m-%d") if getattr(tr, "reviewed_at", None) else None,
            )
        )
    return GetActiveTransfersOutput(total_count=total, transfers=items)


def get_active_bans_handler(actor: VerifiedActor, params: GetActiveBansInput) -> GetActiveBansOutput:
    """List active player disciplinary bans."""
    qs = PlayerBan.objects.filter(is_active=True).select_related("player", "team", "category")
    if params.category_key:
        qs = qs.filter(category__key=params.category_key)

    items: list[BanItem] = []
    for b in qs.order_by("-created_at"):
        items.append(
            BanItem(
                id=b.id,
                player_name=b.player.name if b.player else "Unknown",
                team_name=b.team.name if b.team else "Free Agent",
                category_key=b.category.key if b.category else "",
                ban_type=b.ban_type,
                matches_left=b.games_banned,
                reason=sanitize_untrusted_text(b.reason, max_length=200),
                issued_date=b.created_at.strftime("%Y-%m-%d"),
                period_description=b.period_description or "",
                start_date=b.start_date.isoformat() if b.start_date else None,
                return_date=b.return_date.isoformat() if b.return_date else None,
                expected_fixture_return=b.expected_fixture_return or "",
                imposed_by=b.imposed_by or "",
            )
        )
    return GetActiveBansOutput(active_bans_count=len(items), bans=items)


def get_weekly_mvp_handler(actor: VerifiedActor, params: GetWeeklyMvpInput) -> GetWeeklyMvpOutput:
    """Retrieve Weekly MVP spotlight awards for a category."""
    qs = WeeklyMVP.objects.filter(category__key=params.category_key).select_related("player", "team")
    if params.week_number is not None:
        qs = qs.filter(week_number=params.week_number)

    items: list[WeeklyMvpItem] = []
    for mvp in qs.order_by("-week_number")[:10]:
        c_date = getattr(mvp, "computed_at", None) or getattr(mvp, "week_ending_date", None)
        created_str = c_date.strftime("%Y-%m-%d") if c_date else ""
        headline_text = getattr(mvp, "rationale", "") or getattr(mvp, "week_title", "") or "Matchweek MVP"
        items.append(
            WeeklyMvpItem(
                week_number=mvp.week_number,
                player_name=mvp.player.name if mvp.player else "Unknown",
                team_name=mvp.team.name if mvp.team else "Free Agent",
                points=float(getattr(mvp, "points", 0.0) or 0.0),
                headline=sanitize_untrusted_text(headline_text, max_length=150),
                created_at=created_str,
            )
        )
    return GetWeeklyMvpOutput(category_key=params.category_key, mvps=items)


def get_duty_roster_handler(actor: VerifiedActor, params: GetDutyRosterInput) -> GetDutyRosterOutput:
    """Retrieve duty roster assignments for a matchday."""
    cat = Category.objects.filter(key=params.category_key, is_deleted=False).first()
    if not cat:
        return GetDutyRosterOutput(category_key=params.category_key, assignments=[])

    duty_roster_data = (cat.schedule_days or {}).get("duty_roster", {})
    assignments: list[DutyAssignment] = []

    if isinstance(duty_roster_data, dict):
        week_key = str(params.week_number) if params.week_number is not None else None
        if week_key and week_key in duty_roster_data:
            week_assignments = duty_roster_data[week_key]
            if isinstance(week_assignments, list):
                for a in week_assignments:
                    if isinstance(a, dict):
                        assignments.append(
                            DutyAssignment(
                                match_id=str(a.get("match_id", "")),
                                duty_team=str(a.get("duty_team", "Assigned Staff")),
                                assigned_roles=list(a.get("roles", [])),
                            )
                        )
        else:
            for w, w_list in duty_roster_data.items():
                if isinstance(w_list, list):
                    for a in w_list:
                        if isinstance(a, dict):
                            assignments.append(
                                DutyAssignment(
                                    match_id=str(a.get("match_id", "")),
                                    duty_team=str(a.get("duty_team", "Assigned Staff")),
                                    assigned_roles=list(a.get("roles", [])),
                                )
                            )

    return GetDutyRosterOutput(
        category_key=cat.key,
        week_number=params.week_number,
        assignments=assignments,
    )


def get_h2h_comparison_handler(actor: VerifiedActor, params: GetH2HComparisonInput) -> GetH2HComparisonOutput:
    """Analyze head-to-head match records between two football clubs."""
    team_a_clean = params.team_a.strip()
    team_b_clean = params.team_b.strip()

    qs = Fixture.objects.filter(
        (
            (Q(home_team__name__iexact=team_a_clean) | Q(home_team__team_id__iexact=team_a_clean))
            & (Q(away_team__name__iexact=team_b_clean) | Q(away_team__team_id__iexact=team_b_clean))
        )
        | (
            (Q(home_team__name__iexact=team_b_clean) | Q(home_team__team_id__iexact=team_b_clean))
            & (Q(away_team__name__iexact=team_a_clean) | Q(away_team__team_id__iexact=team_a_clean))
        )
    ).filter(played=True).select_related("home_team", "away_team", "walkover_winner")

    if params.category_key:
        qs = qs.filter(category__key=params.category_key)

    team_a_wins = 0
    team_b_wins = 0
    draws = 0
    team_a_goals = 0
    team_b_goals = 0
    recent_matches: list[H2HMatchItem] = []

    for f in qs.order_by("-id"):
        h_score, a_score = f.score
        is_a_home = (
            (f.home_team and f.home_team.name.lower() == team_a_clean.lower())
            or (f.home_team and f.home_team.team_id.lower() == team_a_clean.lower())
        )

        curr_a_goals = h_score if is_a_home else a_score
        curr_b_goals = a_score if is_a_home else h_score

        team_a_goals += curr_a_goals
        team_b_goals += curr_b_goals

        winner: str | None = None
        if curr_a_goals > curr_b_goals:
            team_a_wins += 1
            winner = f.home_team.name if is_a_home else f.away_team.name
        elif curr_b_goals > curr_a_goals:
            team_b_wins += 1
            winner = f.away_team.name if is_a_home else f.home_team.name
        else:
            draws += 1

        recent_matches.append(
            H2HMatchItem(
                fixture_id=f.fixture_id,
                date=f.date,
                home_team=f.home_team.name if f.home_team else "TBD",
                away_team=f.away_team.name if f.away_team else "TBD",
                home_score=h_score,
                away_score=a_score,
                winner=winner,
            )
        )

    return GetH2HComparisonOutput(
        team_a=team_a_clean,
        team_b=team_b_clean,
        total_played=len(recent_matches),
        team_a_wins=team_a_wins,
        team_b_wins=team_b_wins,
        draws=draws,
        team_a_goals=team_a_goals,
        team_b_goals=team_b_goals,
        recent_matches=recent_matches,
    )


def get_voting_and_totw_handler(actor: VerifiedActor, params: GetVotingAndTotwInput) -> GetVotingAndTotwOutput:
    """Retrieve community Team of the Week (TOTW) and active voting round."""
    qs = VotingRound.objects.filter(category__key=params.category_key)
    if params.week_number is not None:
        round_obj = qs.filter(week_number=params.week_number).first()
    else:
        round_obj = qs.order_by("-week_number").first()

    if not round_obj:
        return GetVotingAndTotwOutput(
            category_key=params.category_key,
            week_number=params.week_number,
            is_open=False,
            formation="4-3-3",
            custom_lineup=[],
            vote_leaders=[],
        )

    try:
        lineup_data = round_obj.get_totw()
        if not isinstance(lineup_data, list):
            lineup_data = round_obj.custom_lineup or []
    except Exception:
        lineup_data = round_obj.custom_lineup or []

    # Get vote leaders
    tallies = (
        PositionVote.objects.filter(voting_round=round_obj)
        .values("player__name", "player__team__name", "position")
        .annotate(vote_count=Count("id"))
        .order_by("-vote_count")[:15]
    )

    leaders: list[PositionVoteLeader] = []
    for t in tallies:
        leaders.append(
            PositionVoteLeader(
                position=t.get("position", ""),
                player_name=t.get("player__name") or "Unknown",
                team_name=t.get("player__team__name") or "Free Agent",
                votes=t.get("vote_count", 0),
            )
        )

    return GetVotingAndTotwOutput(
        category_key=params.category_key,
        week_number=round_obj.week_number,
        is_open=bool(round_obj.is_open),
        formation=round_obj.formation or "4-3-3",
        custom_lineup=lineup_data,
        vote_leaders=leaders,
    )


def get_cup_brackets_handler(actor: VerifiedActor, params: GetCupBracketsInput) -> GetCupBracketsOutput:
    """Retrieve knockout cup tournament bracket structure and ties."""
    cat = Category.objects.filter(key=params.category_key, is_deleted=False).first()
    if not cat:
        return GetCupBracketsOutput(
            category_key=params.category_key,
            category_label="Not Found",
            rounds=[],
            knockout_matches=[],
        )

    fixtures = cat.fixtures.filter(phase="knockout").select_related("home_team", "away_team", "walkover_winner")
    if not fixtures.exists():
        # Fallback to all fixtures if none explicitly tagged knockout
        fixtures = cat.fixtures.all().select_related("home_team", "away_team", "walkover_winner")

    round_labels = {
        0: "Final",
        1: "Semi-Finals",
        2: "Quarter-Finals",
        3: "Round of 16",
    }

    ties: list[CupMatchTie] = []
    rounds_seen: list[str] = []

    for f in fixtures.order_by("round_index", "tie_index", "id"):
        r_name = round_labels.get(f.round_index, f"Round {f.round_index}" if f.round_index is not None else "Cup Tie")
        if r_name not in rounds_seen:
            rounds_seen.append(r_name)

        winner: str | None = None
        if f.played:
            if f.walkover_winner:
                winner = f.walkover_winner.name
            else:
                h_score, a_score = f.score
                if h_score > a_score:
                    winner = f.home_team.name if f.home_team else "Home"
                elif a_score > h_score:
                    winner = f.away_team.name if f.away_team else "Away"
                else:
                    if f.home_pens is not None and f.away_pens is not None:
                        winner = (f.home_team.name if f.home_team else "Home") if f.home_pens > f.away_pens else (f.away_team.name if f.away_team else "Away")

        h_score, a_score = f.score if f.played else (None, None)
        ties.append(
            CupMatchTie(
                tie_index=f.tie_index,
                round_index=f.round_index,
                round_name=r_name,
                home_team=f.home_team.name if f.home_team else "TBD",
                away_team=f.away_team.name if f.away_team else "TBD",
                home_score=h_score,
                away_score=a_score,
                winner=winner,
                played=bool(f.played),
            )
        )

    return GetCupBracketsOutput(
        category_key=cat.key,
        category_label=cat.label,
        rounds=rounds_seen,
        knockout_matches=ties,
    )


def list_highlights_handler(actor: VerifiedActor, params: ListHighlightsInput) -> ListHighlightsOutput:
    """Retrieve official match video highlights and clips."""
    qs = HighlightVideo.objects.all()
    if params.category_key:
        qs = qs.filter(category_key=params.category_key)

    total_count = qs.count()
    items: list[HighlightItem] = []
    for h in qs.order_by("-created_at")[:params.limit]:
        v_url = h.video_url
        if not v_url and h.video_file:
            v_url = h.video_file.url

        items.append(
            HighlightItem(
                id=h.id,
                title=sanitize_untrusted_text(h.title, max_length=200),
                description=sanitize_untrusted_text(h.description, max_length=400),
                category_key=h.category_key,
                match_name=sanitize_untrusted_text(h.match_name, max_length=150),
                match_date=h.match_date or None,
                video_url=v_url,
                duration=h.duration or "",
            )
        )

    return ListHighlightsOutput(total_count=total_count, highlights=items)


def list_referees_handler(actor: VerifiedActor, params: ListRefereesInput) -> ListRefereesOutput:
    """List match officials, appointed categories, and games officiated."""
    qs = Referee.objects.select_related("category")
    if params.category_key:
        qs = qs.filter(category__key=params.category_key)

    total_count = qs.count()
    items: list[RefereeItem] = []
    for r in qs.order_by("name"):
        matches_count = Fixture.objects.filter(referee=r.name).count()
        items.append(
            RefereeItem(
                id=r.id,
                name=r.name,
                category_key=r.category.key if r.category else "",
                matches_officiated=matches_count,
            )
        )

    return ListRefereesOutput(total_count=total_count, referees=items)


def get_platform_audit_logs_handler(actor: VerifiedActor, params: GetPlatformAuditLogsInput) -> GetPlatformAuditLogsOutput:
    """Retrieve administrative, tournament, and security audit log telemetry."""
    qs = AuditLog.objects.all()
    if params.category_key:
        qs = qs.filter(category_key=params.category_key)
    if params.action:
        qs = qs.filter(action__icontains=params.action)

    total_count = qs.count()
    entries: list[AuditLogEntry] = []
    for log in qs.order_by("-created_at")[:params.limit]:
        actor_name = log.actor_username or log.actor_name or log.actor_type
        entries.append(
            AuditLogEntry(
                id=log.id,
                actor_username=actor_name,
                actor_role=log.actor_role or "",
                event_type=log.event_type or "activity",
                action=sanitize_untrusted_text(log.action, max_length=200),
                target=sanitize_untrusted_text(log.target, max_length=200),
                category_key=log.category_key or "",
                details=log.details if isinstance(log.details, dict) else {},
                city=log.city or "",
                country=log.country or "",
                created_at=log.created_at.strftime("%Y-%m-%d %H:%M:%S") if log.created_at else "",
            )
        )

    return GetPlatformAuditLogsOutput(total_count=total_count, entries=entries)


def get_clean_sheets_and_cards_handler(
    actor: VerifiedActor, params: GetCleanSheetsAndCardsInput
) -> GetCleanSheetsAndCardsOutput:
    """Retrieve clean sheet leaderboards, team and player disciplinary card totals, and ban flags."""
    cat = Category.objects.filter(key=params.category_key, is_deleted=False).first()
    if not cat:
        return GetCleanSheetsAndCardsOutput(
            category_key=params.category_key,
            category_label="Not Found",
            team_clean_sheets=[],
            goalkeeper_clean_sheets=[],
            player_cards=[],
            team_cards=[],
            active_bans_summary=0,
        )

    # Active bans set for cross-referencing
    active_banned_player_ids = set(
        PlayerBan.objects.filter(category=cat, is_active=True).values_list("player_id", flat=True)
    )

    # Initialize team statistics
    teams = list(cat.teams.all())
    team_stats: dict[int, dict[str, Any]] = {
        t.id: {
            "name": t.name,
            "clean_sheets": 0,
            "matches_played": 0,
            "goals_conceded": 0,
            "yellow_cards": 0,
            "red_cards": 0,
        }
        for t in teams
    }

    # Process played fixtures for clean sheets & goals conceded
    fixtures = cat.fixtures.filter(played=True).select_related("home_team", "away_team", "walkover_winner")
    for f in fixtures:
        h_score, a_score = f.score
        if f.home_team_id and f.home_team_id in team_stats:
            team_stats[f.home_team_id]["matches_played"] += 1
            team_stats[f.home_team_id]["goals_conceded"] += a_score
            if a_score == 0 and not f.walkover_winner_id:
                team_stats[f.home_team_id]["clean_sheets"] += 1

        if f.away_team_id and f.away_team_id in team_stats:
            team_stats[f.away_team_id]["matches_played"] += 1
            team_stats[f.away_team_id]["goals_conceded"] += h_score
            if h_score == 0 and not f.walkover_winner_id:
                team_stats[f.away_team_id]["clean_sheets"] += 1

    # Process disciplinary events (cards)
    card_events = (
        MatchEvent.objects.filter(fixture__category=cat, event_type__in=["yellow", "red"])
        .select_related("player", "team", "player__team")
    )

    player_card_stats: dict[int, dict[str, Any]] = {}
    for ev in card_events:
        # Team card tally
        if ev.team_id and ev.team_id in team_stats:
            if ev.event_type == "yellow":
                team_stats[ev.team_id]["yellow_cards"] += 1
            elif ev.event_type == "red":
                team_stats[ev.team_id]["red_cards"] += 1

        # Player card tally
        if ev.player:
            pid = ev.player.id
            if pid not in player_card_stats:
                t_name = ev.team.name if ev.team else (ev.player.team.name if ev.player.team else "Free Agent")
                player_card_stats[pid] = {
                    "player_name": ev.player.name,
                    "team_name": t_name,
                    "yellow_cards": 0,
                    "red_cards": 0,
                    "is_banned": pid in active_banned_player_ids,
                }
            if ev.event_type == "yellow":
                player_card_stats[pid]["yellow_cards"] += 1
            elif ev.event_type == "red":
                player_card_stats[pid]["red_cards"] += 1

    # Goalkeepers clean sheets
    gk_items: list[GoalkeeperCleanSheetItem] = []
    goalkeepers = (
        cat.players.filter(is_unknown=False)
        .filter(Q(position__iexact="GK") | Q(position__iexact="Goalkeeper"))
        .select_related("team")
    )
    for gk in goalkeepers:
        if gk.team_id and gk.team_id in team_stats:
            cs = team_stats[gk.team_id]["clean_sheets"]
            if cs > 0:
                gk_items.append(
                    GoalkeeperCleanSheetItem(
                        player_name=gk.name,
                        team_name=gk.team.name if gk.team else "Free Agent",
                        clean_sheets=cs,
                    )
                )
    gk_items.sort(key=lambda x: -x.clean_sheets)

    # Build Team Clean Sheets list
    team_cs_items: list[TeamCleanSheetItem] = []
    team_card_items: list[TeamCardItem] = []
    for t_id, data in team_stats.items():
        team_cs_items.append(
            TeamCleanSheetItem(
                team_name=data["name"],
                clean_sheets=data["clean_sheets"],
                matches_played=data["matches_played"],
                goals_conceded=data["goals_conceded"],
            )
        )
        team_card_items.append(
            TeamCardItem(
                team_name=data["name"],
                yellow_cards=data["yellow_cards"],
                red_cards=data["red_cards"],
                total_cards=data["yellow_cards"] + data["red_cards"],
            )
        )

    team_cs_items.sort(key=lambda x: (-x.clean_sheets, x.goals_conceded, -x.matches_played))
    team_card_items.sort(key=lambda x: (-x.red_cards, -x.yellow_cards, -x.total_cards))

    # Build Player Cards list
    player_card_items: list[PlayerCardItem] = []
    for pid, data in player_card_stats.items():
        player_card_items.append(
            PlayerCardItem(
                player_name=data["player_name"],
                team_name=data["team_name"],
                yellow_cards=data["yellow_cards"],
                red_cards=data["red_cards"],
                total_cards=data["yellow_cards"] + data["red_cards"],
                is_banned=data["is_banned"],
            )
        )
    player_card_items.sort(key=lambda x: (-x.red_cards, -x.yellow_cards, -x.total_cards))

    return GetCleanSheetsAndCardsOutput(
        category_key=cat.key,
        category_label=cat.label,
        team_clean_sheets=team_cs_items[:params.limit],
        goalkeeper_clean_sheets=gk_items[:params.limit],
        player_cards=player_card_items[:params.limit],
        team_cards=team_card_items[:params.limit],
        active_bans_summary=len(active_banned_player_ids),
    )
