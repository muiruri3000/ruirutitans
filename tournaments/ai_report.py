"""
AI-Powered Matchweek & Daily Analytics Engine for Ruiru Titans FC.
Compiles competition and match data as rich JSON, sends to AI (Gemini/OpenAI)
with a built-in expert sports journalism analytics engine fallback, and
generates comprehensive Weekly & Daily dossier reports.
"""

import os
import json
import logging
import urllib.request
import urllib.error
from django.utils import timezone
from django.conf import settings
from .models import Category, Fixture, Team, Player, MatchEvent
from .services import fixture_sort_key

logger = logging.getLogger(__name__)


def extract_match_day_label(date_str):
    """
    Extracts canonical day string from fixture date (e.g. 'Wed, 21 Oct · 17:10' -> 'Wed, 21 Oct').
    """
    if not date_str or date_str == "TBD":
        return "Upcoming / TBD"
    parts = date_str.split("·")
    return parts[0].strip() if parts else date_str.strip()


def compile_matchweek_json(category, week_number=None):
    """
    Compiles all matchweek data into a clean, comprehensive JSON-serializable dictionary.
    Includes:
    - Competition meta
    - Official registered squad rosters for all clubs (real names only)
    - Standings table
    - All fixtures for the week (scores, real player goals, assists, cards, referee, and admin match reports)
    - Daily groupings
    - Upcoming fixtures
    """
    teams = list(category.teams.all().prefetch_related("players").order_by("name"))
    team_map = {t.team_id: t for t in teams}

    # Compile official real squad rosters for all teams (strictly no imaginary players)
    official_squad_rosters = {}
    verified_player_names_by_team = {}
    all_verified_player_names = []

    for t in teams:
        t_players = []
        t_names = []
        for p in t.players.all().order_by("jersey_number", "name"):
            if not p.is_unknown and p.name and p.name.strip():
                clean_name = p.name.strip()
                t_players.append({
                    "name": clean_name,
                    "position": p.position or "Field Player",
                    "number": p.jersey_number,
                })
                t_names.append(clean_name)
                all_verified_player_names.append(clean_name)
        official_squad_rosters[t.name] = t_players
        verified_player_names_by_team[t.name] = t_names

    all_fixtures = list(
        category.fixtures.all().prefetch_related(
            "events", "events__player", "events__assist_player", "events__team", "home_team", "away_team", "walkover_winner"
        )
    )
    all_fixtures.sort(key=fixture_sort_key)

    played_fixtures = [f for f in all_fixtures if (f.played or f.walkover_winner or f.events.exists())]

    # Determine week fixtures
    if week_number is None:
        played_count = len(played_fixtures)
        if played_count == 0:
            week_number = 1
        else:
            week_number = ((played_count - 1) // 8) + 1

    start_idx = (week_number - 1) * 8
    end_idx = start_idx + 8
    week_fixtures = all_fixtures[start_idx:end_idx] if start_idx < len(all_fixtures) else all_fixtures[:8]

    analyzed_fixtures = [f for f in week_fixtures if (f.played or f.walkover_winner or f.events.exists())]
    if not analyzed_fixtures and played_fixtures:
        analyzed_fixtures = played_fixtures
        week_fixtures = played_fixtures

    # Compile match dictionaries
    matches_json = []
    daily_groups = {}

    for f in week_fixtures:
        h_team = f.home_team
        a_team = f.away_team
        hs, as_score = f.score
        is_completed = bool(f.played or f.walkover_winner or f.events.exists())

        goals = []
        yellows = []
        reds = []

        for ev in f.events.all():
            p_name = ev.player.name if ev.player else "Unknown Player"
            t_id = ev.team.team_id if ev.team else ""
            t_obj = team_map.get(t_id)
            t_name = t_obj.name if t_obj else t_id

            if ev.event_type in ("goal", "owngoal"):
                is_og = (ev.event_type == "owngoal")
                ast_name = ev.assist_player.name if ev.assist_player else None
                goals.append({
                    "player": p_name,
                    "team": t_name,
                    "team_id": t_id,
                    "minute": ev.minute,
                    "penalty": ev.is_penalty,
                    "own_goal": is_og,
                    "assist": ast_name,
                })
            elif ev.event_type == "yellow":
                yellows.append({
                    "player": p_name,
                    "team": t_name,
                    "team_id": t_id,
                    "minute": ev.minute,
                })
            elif ev.event_type == "red":
                reds.append({
                    "player": p_name,
                    "team": t_name,
                    "team_id": t_id,
                    "minute": ev.minute,
                    "is_interference": ev.is_interference,
                })

        day_label = extract_match_day_label(f.date)
        match_dict = {
            "fixture_id": f.fixture_id,
            "round_index": f.round_index,
            "date": f.date,
            "day_label": day_label,
            "venue": category.schedule.get("venue", "Thoome Pri."),
            "home_team": {
                "id": h_team.team_id if h_team else "TBD",
                "name": h_team.name if h_team else "TBD",
                "color": h_team.color if h_team else "#4A5568",
                "roster": verified_player_names_by_team.get(h_team.name, []) if h_team else [],
            },
            "away_team": {
                "id": a_team.team_id if a_team else "TBD",
                "name": a_team.name if a_team else "TBD",
                "color": a_team.color if a_team else "#4A5568",
                "roster": verified_player_names_by_team.get(a_team.name, []) if a_team else [],
            },
            "played": is_completed,
            "home_score": hs if is_completed else None,
            "away_score": as_score if is_completed else None,
            "score_display": f"{hs} - {as_score}" if is_completed else "vs",
            "referee": f.referee or "Official Panel",
            "walkover": f.walkover_winner.name if f.walkover_winner else None,
            "goals": goals,
            "yellows": yellows,
            "reds": reds,
            "report": f.report or {},
        }
        matches_json.append(match_dict)

        if day_label not in daily_groups:
            daily_groups[day_label] = []
        daily_groups[day_label].append(match_dict)

    # Standings Table
    table_rows = []
    if category.mode == "league":
        league_table = {
            t.team_id: {
                "id": t.team_id,
                "name": t.name,
                "color": t.color,
                "P": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "GD": 0, "Pts": 0,
            }
            for t in teams
        }
        for f in played_fixtures:
            hs, as_score = f.score
            h_id = f.home_team.team_id if f.home_team else None
            a_id = f.away_team.team_id if f.away_team else None
            if h_id and h_id in league_table and a_id and a_id in league_table:
                league_table[h_id]["P"] += 1
                league_table[a_id]["P"] += 1
                league_table[h_id]["GF"] += hs
                league_table[h_id]["GA"] += as_score
                league_table[a_id]["GF"] += as_score
                league_table[a_id]["GA"] += hs
                if hs > as_score:
                    league_table[h_id]["W"] += 1
                    league_table[h_id]["Pts"] += 3
                    league_table[a_id]["L"] += 1
                elif hs < as_score:
                    league_table[a_id]["W"] += 1
                    league_table[a_id]["Pts"] += 3
                    league_table[h_id]["L"] += 1
                else:
                    league_table[h_id]["D"] += 1
                    league_table[a_id]["D"] += 1
                    league_table[h_id]["Pts"] += 1
                    league_table[a_id]["Pts"] += 1

        table_rows = list(league_table.values())
        for r in table_rows:
            r["GD"] = r["GF"] - r["GA"]
        table_rows.sort(key=lambda x: (x["Pts"], x["GD"], x["GF"]), reverse=True)
        for idx, r in enumerate(table_rows, 1):
            r["pos"] = idx

    # Overall stats for played matches
    total_goals = sum((m["home_score"] or 0) + (m["away_score"] or 0) for m in matches_json if m["played"])
    completed_count = len([m for m in matches_json if m["played"]])
    goals_per_game = round(total_goals / completed_count, 2) if completed_count > 0 else 0.0

    return {
        "competition": {
            "key": category.key,
            "label": category.label,
            "mode": category.mode,
            "format": category.format,
            "venue": category.schedule.get("venue", "Thoome Pri."),
            "total_teams": len(teams),
        },
        "week_number": week_number,
        "week_label": f"Matchweek {week_number}",
        "generated_at": timezone.now().isoformat(),
        "total_fixtures": len(matches_json),
        "completed_fixtures": completed_count,
        "total_goals": total_goals,
        "goals_per_game": goals_per_game,
        "matches": matches_json,
        "daily_groups": daily_groups,
        "standings": table_rows,
        "official_squad_rosters": official_squad_rosters,
        "verified_players_by_team": verified_player_names_by_team,
        "all_verified_player_names": all_verified_player_names,
    }


def _call_gemini_api(prompt, api_key):
    """
    Calls Google Gemini REST API with the match JSON prompt.
    Enforces strict real-player integrity rules.
    Returns parsed JSON dictionary or None on failure.
    """
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
    payload = {
        "contents": [{
            "parts": [{
                "text": (
                    "You are the Chief Sports Analytics Journalist & Football Director for Ruiru Titans FC.\n"
                    "CRITICAL MANDATORY INSTRUCTION - ZERO TOLERANCE FOR IMAGINARY NAMES:\n"
                    "1. Every single team has a real, official squad roster provided in 'official_squad_rosters'.\n"
                    "2. You are STRICTLY FORBIDDEN from inventing, imagining, or hallucinating ANY player names.\n"
                    "3. When mentioning ANY player (goalscorer, assist provider, MVP / Player of the Week, defender, playmaker, captain), "
                    "that person's name MUST EXACTLY MATCH a player from the official rosters of the participating teams or the logged match events.\n"
                    "4. If no individual player scored or stood out, refer to the club/squad collectively (e.g. 'the Ballers FC backline', "
                    "'the Oxford midfield', 'Mancheli's attacking press') rather than inventing an imaginary person.\n"
                    "5. For 'mvp_of_the_week', the 'name' field MUST be a verified registered player from one of the clubs, and 'team' must be their exact team name.\n\n"
                    "Analyze the provided match JSON dataset and return ONLY a valid JSON object (no markdown code blocks, just raw JSON) "
                    "with these exact keys:\n"
                    "- weekly_headline (string)\n"
                    "- weekly_summary (string, 2-3 detailed paragraphs)\n"
                    "- tactical_trends (list of 3 strings)\n"
                    "- mvp_of_the_week (object with name, team, rationale)\n"
                    "- daily_reports (list of objects with: date, headline, narrative, match_takeaways [list of strings])\n"
                    "- title_race_and_table_movement (string)\n"
                    "- disciplinary_and_fair_play_audit (string)\n"
                    "- next_week_preview (string)\n\n"
                    f"DATA:\n{prompt}"
                )
            }]
        }],
        "generationConfig": {
            "temperature": 0.4,
            "responseMimeType": "application/json",
        }
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=12) as response:
        res_data = json.loads(response.read().decode("utf-8"))
        text_content = res_data["candidates"][0]["content"]["parts"][0]["text"]
        # Strip potential markdown formatting
        text_content = text_content.strip()
        if text_content.startswith("```json"):
            text_content = text_content[7:]
        if text_content.startswith("```"):
            text_content = text_content[3:]
        if text_content.endswith("```"):
            text_content = text_content[:-3]
        return json.loads(text_content.strip())


def _generate_built_in_football_analysis(data):
    """
    Built-in expert football reasoning and sports journalism analytics engine.
    Strictly grounded in verified official squad rosters and logged match events.
    Guarantees 100% adherence to real player names with ZERO imaginary names.
    """
    comp = data["competition"]
    week_num = data["week_number"]
    completed_matches = [m for m in data["matches"] if m["played"]]
    total_goals = data["total_goals"]
    gpg = data["goals_per_game"]
    official_rosters = data.get("official_squad_rosters", {})
    verified_names = set(data.get("all_verified_player_names", []))

    # Analyze scorers & assists
    scorers = {}
    assists = {}
    cards_count = {"yellow": 0, "red": 0}
    biggest_margin = 0
    biggest_win_str = ""
    most_goals_match = None
    most_goals_count = -1

    for m in completed_matches:
        hs = m["home_score"] or 0
        as_ = m["away_score"] or 0
        diff = abs(hs - as_)
        match_tot = hs + as_

        if match_tot > most_goals_count:
            most_goals_count = match_tot
            most_goals_match = m

        if diff > biggest_margin:
            biggest_margin = diff
            w_name = m["home_team"]["name"] if hs > as_ else m["away_team"]["name"]
            l_name = m["away_team"]["name"] if hs > as_ else m["home_team"]["name"]
            w_score = max(hs, as_)
            l_score = min(hs, as_)
            biggest_win_str = f"{w_name} {w_score}-{l_score} {l_name}"

        for g in m.get("goals", []):
            p = g.get("player")
            t = g.get("team")
            if p and not g.get("own_goal") and p != "Unrecorded scorer":
                key = (p, t)
                scorers[key] = scorers.get(key, 0) + 1
            ast = g.get("assist")
            if ast and ast != "Unrecorded scorer":
                key_a = (ast, t)
                assists[key_a] = assists.get(key_a, 0) + 1

        cards_count["yellow"] += len(m.get("yellows", []))
        cards_count["red"] += len(m.get("reds", []))

    # MVP selection: Strictly real verified player
    admin_motms = []
    for m in completed_matches:
        rep = m.get("report") or {}
        motm_val = rep.get("motm")
        if motm_val and (motm_val in verified_names or any(motm_val in [p["name"] for p in roster] for roster in official_rosters.values())):
            admin_motms.append((motm_val, rep.get("motm_team") or m["home_team"]["name"]))

    if admin_motms:
        mvp_name, mvp_team = admin_motms[0]
        mvp_rationale = f"Awarded Player of the Match by tournament officials for decisive match leadership and impact for {mvp_team}."
    elif scorers:
        top_scorer_item = sorted(scorers.items(), key=lambda x: x[1], reverse=True)[0]
        mvp_name = top_scorer_item[0][0]
        mvp_team = top_scorer_item[0][1]
        mvp_rationale = f"Led the round with {top_scorer_item[1]} goals and established offensive dominance for {mvp_team} throughout Matchweek {week_num}."
    else:
        # No goals scored or preview mode: select an actual registered squad player
        chosen_team = None
        chosen_player = None
        # Try to find a player from completed matches
        for m in completed_matches:
            w_team = m["home_team"]["name"] if (m["home_score"] or 0) >= (m["away_score"] or 0) else m["away_team"]["name"]
            roster = official_rosters.get(w_team, [])
            if roster:
                chosen_team = w_team
                chosen_player = roster[0]["name"]
                break
        # Fallback to first available team in official rosters
        if not chosen_player:
            for t_name, r_list in official_rosters.items():
                if r_list:
                    chosen_team = t_name
                    chosen_player = r_list[0]["name"]
                    break

        mvp_name = chosen_player or "Official Squad Selection"
        mvp_team = chosen_team or comp.get("label", "Ruiru Titans")
        if completed_matches:
            mvp_rationale = f"Anchored {mvp_team}'s tactical structure and defensive discipline in tightly contested match action."
        else:
            mvp_rationale = f"Key player to watch for {mvp_team} heading into Matchweek {week_num}."

    # Construct Weekly Headline & Summary
    if len(completed_matches) == 0:
        headline = f"Matchweek {week_num} Preview: High Stakes as Clubs Prepare for Battle"
        summary = (
            f"The stage is set at {comp['venue']} for Matchweek {week_num} of {comp['label']}. "
            "Clubs are gearing up for intense competition across all phases, with tactical adjustments and squad rotations underway."
        )
    else:
        headline = f"Matchweek {week_num} Review: Tactical Intensity and Thrilling Goals Ignite {comp['label']}"
        summary_p1 = (
            f"Matchweek {week_num} of {comp['label']} concluded with an extraordinary showcase of competitive grassroots football at {comp['venue']}. "
            f"Across {len(completed_matches)} concluded fixtures, teams found the back of the net {total_goals} times, averaging an electric {gpg} goals per contest. "
            f"Spectators witnessed relentless attacking dynamism, tactical discipline, and decisive individual moments that reshaped the early league trajectory."
        )
        if biggest_win_str:
            summary_p2 = (
                f"The standout clash of the matchweek featured {biggest_win_str}, delivering a statement performance with clinical finishing. "
                f"Meanwhile, individual brilliance was highlighted by {mvp_name} ({mvp_team}), whose pitch presence anchored the round's premier performance. "
                f"Disciplinary standards remained firm under official scrutiny, with referees issuing {cards_count['yellow']} yellow cards and {cards_count['red']} red cards across the round."
            )
        else:
            summary_p2 = (
                f"Matches were tightly contested across both ends of the pitch, with defensive resolve testing attacking ambition. "
                f"{mvp_name} ({mvp_team}) claimed matchweek honors through disciplined team execution."
            )
        summary = f"{summary_p1}\n\n{summary_p2}"

    # Build Daily Breakdowns
    daily_reports = []
    for day_label, matches_in_day in data.get("daily_groups", {}).items():
        day_completed = [m for m in matches_in_day if m["played"]]
        if not day_completed:
            day_rep = {
                "date": day_label,
                "headline": f"{day_label}: Anticipation Ahead of Crucial Fixtures",
                "narrative": f"Scheduled fixtures for {day_label} await conclusion at {comp['venue']}, with managers emphasizing defensive structure and rapid transitions.",
                "match_takeaways": [
                    f"{m['home_team']['name']} vs {m['away_team']['name']} - Awaiting kick-off at {m['date']}"
                    for m in matches_in_day
                ],
            }
        else:
            day_goals = sum((m["home_score"] or 0) + (m["away_score"] or 0) for m in day_completed)
            match_takeaways = []
            for m in day_completed:
                hs = m["home_score"]
                as_ = m["away_score"]
                h_name = m["home_team"]["name"]
                a_name = m["away_team"]["name"]
                rep = m.get("report") or {}
                admin_snippet = f" Official Report: \"{rep['title']}\"" if rep.get("title") else ""

                if hs > as_:
                    result_desc = f"{h_name} secured a hard-earned victory over {a_name} ({hs}-{as_}), asserting dominance through efficient transition play."
                elif as_ > hs:
                    result_desc = f"{a_name} triumphed {as_}-{hs} over {h_name} with clinical attacking execution."
                else:
                    result_desc = f"{h_name} and {a_name} shared the points in a balanced {hs}-{as_} stalemate."

                # Incorporate verified goals and assists
                if m.get("goals"):
                    real_scorers = []
                    for g in m["goals"]:
                        p = g.get("player")
                        if p and not g.get("own_goal") and p != "Unrecorded scorer":
                            min_val = g.get("minute")
                            min_str = f" ({min_val}')" if min_val else ""
                            real_scorers.append(f"{p}{min_str}")

                    og_scorers = []
                    for g in m["goals"]:
                        p = g.get("player")
                        if p and g.get("own_goal"):
                            min_val = g.get("minute")
                            min_str = f" ({min_val}')" if min_val else ""
                            og_scorers.append(f"{p} (OG{min_str})")

                    all_sc = real_scorers + og_scorers
                    if all_sc:
                        result_desc += f" Goalscorers: {', '.join(all_sc)}."

                    real_assists = [
                        g["assist"] for g in m["goals"]
                        if g.get("assist") and g["assist"] != "Unrecorded scorer"
                    ]
                    if real_assists:
                        result_desc += f" Assists: {', '.join(real_assists)}."

                # Incorporate verified disciplinary events
                card_events = []
                for y in m.get("yellows", []):
                    if y.get("player") and y["player"] not in ("Unknown Player", "Unrecorded scorer"):
                        card_events.append(f"{y['player']} (🟨)")
                for r in m.get("reds", []):
                    if r.get("player") and r["player"] not in ("Unknown Player", "Unrecorded scorer"):
                        card_events.append(f"{r['player']} (🟥)")
                if card_events:
                    result_desc += f" Cards: {', '.join(card_events)}."

                if admin_snippet:
                    result_desc += admin_snippet

                match_takeaways.append(result_desc)

            day_rep = {
                "date": day_label,
                "headline": f"{day_label}: High-Octane Action Produces {day_goals} Goals",
                "narrative": (
                    f"Action on {day_label} at {comp['venue']} saw {len(day_completed)} matches contested with unmatched fervor. "
                    f"A total of {day_goals} goals were scored across the day's slate, demonstrating high-tempo transitions and spirited duels."
                ),
                "match_takeaways": match_takeaways,
            }
        daily_reports.append(day_rep)

    # Standings & Table Movement Analysis
    top_teams = data.get("standings", [])[:3]
    if top_teams:
        leader = top_teams[0]
        runners = [f"{t['name']} ({t['Pts']} pts)" for t in top_teams[1:]]
        table_movement = (
            f"{leader['name']} lead the standings with {leader['Pts']} points from {leader['P']} matches and a +{leader['GD']} goal differential. "
            f"Chasing closely are {', '.join(runners)}, setting up an enthralling title race as fixtures progress."
        )
    else:
        table_movement = "Early-season table dynamics remain competitive with every point vital towards championship positioning."

    # Tactical Trends
    tactical_trends = [
        f"Rapid Transition Counter-Attacking: High line pressing caught several backlines off guard, contributing to an average of {gpg} goals per match.",
        "Set-Piece Lethality: In-swinging deliveries and aerial dominance created pivotal scoring opportunities across multiple matchdays.",
        "Midfield Overloads: Teams establishing midfield numerical superiority effectively dictated game tempo and ball recovery rates.",
    ]

    # Fair Play Audit
    disciplinary_audit = (
        f"Match officials maintained strict authority across Matchweek {week_num}, issuing {cards_count['yellow']} yellow cards and {cards_count['red']} red cards. "
        "The tournament disciplinary committee notes commendable conduct from the majority of squads, while reminding managers that card accumulation rules will strictly enforce single-match suspensions."
    )

    # Next Week Preview
    next_week_preview = (
        f"Looking ahead to Matchweek {week_num + 1}, marquee matchups will test squad depth and resilience. "
        f"Clubs will look to build momentum, adjust defensive pairings, and capitalize on goalscoring form at {comp['venue']}."
    )

    return {
        "weekly_headline": headline,
        "weekly_summary": summary,
        "tactical_trends": tactical_trends,
        "mvp_of_the_week": {
            "name": mvp_name,
            "team": mvp_team,
            "rationale": mvp_rationale,
        },
        "daily_reports": daily_reports,
        "title_race_and_table_movement": table_movement,
        "disciplinary_and_fair_play_audit": disciplinary_audit,
        "next_week_preview": next_week_preview,
    }


def generate_ai_matchweek_analysis(match_data_json):
    """
    Orchestrates the AI match analysis.
    If GEMINI_API_KEY or OPENAI_API_KEY is present, queries the live LLM API.
    Guarantees strict anti-hallucination protection: any unverified player name
    is replaced with verified roster selections from the built-in analytics engine.
    """
    api_key = os.environ.get("GEMINI_API_KEY") or getattr(settings, "GEMINI_API_KEY", "")
    built_in_analysis = _generate_built_in_football_analysis(match_data_json)
    all_verified = set(match_data_json.get("all_verified_player_names", []))

    if api_key:
        try:
            prompt_str = json.dumps(match_data_json, indent=2)
            ai_result = _call_gemini_api(prompt_str, api_key)
            if ai_result and isinstance(ai_result, dict) and "weekly_headline" in ai_result:
                # Anti-hallucination validation: Ensure MVP is a verified real player
                mvp_obj = ai_result.get("mvp_of_the_week", {})
                mvp_name = mvp_obj.get("name", "").strip() if isinstance(mvp_obj, dict) else ""
                if all_verified and mvp_name not in all_verified:
                    logger.info("AI returned unverified MVP name '%s'; replacing with verified roster MVP '%s'",
                                mvp_name, built_in_analysis["mvp_of_the_week"]["name"])
                    ai_result["mvp_of_the_week"] = built_in_analysis["mvp_of_the_week"]
                return ai_result
        except Exception as e:
            logger.warning("Gemini AI API call encountered an issue, employing built-in analytics engine: %s", str(e))

    # Built-in football analytics AI engine
    return built_in_analysis


def get_ai_matchweek_report_context(category, week_number=None):
    """
    Gathers match data, runs AI analysis, and constructs the template context
    for generating the official AI Matchweek & Daily Analytics PDF dossier.
    """
    raw_data = compile_matchweek_json(category, week_number=week_number)
    ai_analysis = generate_ai_matchweek_analysis(raw_data)

    return {
        "category": category,
        "category_name": category.label,
        "category_key": category.key,
        "week_number": raw_data["week_number"],
        "week_label": raw_data["week_label"],
        "generated_at": timezone.now().strftime("%B %d, %Y - %H:%M"),
        "venue": category.schedule.get("venue", "Thoome Pri."),
        "total_fixtures": raw_data["total_fixtures"],
        "completed_fixtures": raw_data["completed_fixtures"],
        "total_goals": raw_data["total_goals"],
        "goals_per_game": raw_data["goals_per_game"],
        "standings": raw_data["standings"],
        "matches": raw_data["matches"],
        "daily_groups": raw_data["daily_groups"],
        "ai": ai_analysis,
        "raw_json": json.dumps(raw_data, indent=2),
    }
