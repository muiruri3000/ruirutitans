import re
from django.db import transaction
from .models import Category, Team, Player, Referee, Fixture, MatchEvent, GlobalSettings

REAL_OPEN_TEAM_SEED = [
    {
        "id": "OXF",
        "name": "Oxford",
        "color": "#2E5A8F",
        "players": ["Pato", "Rafo", "Dero", "Wanjohi", "Mugane", "Peter", "Brandon", "Obonyo", "Jose", "Jobu"],
    },
    {
        "id": "SS",
        "name": "Super Strikers",
        "color": "#B23A2E",
        "players": ["Sam", "Farasi", "Ian", "Kuria", "Muturi", "Kevo", "OG", "Alvo"],
    },
    {
        "id": "RAN",
        "name": "Rangers",
        "color": "#3F7A4E",
        "players": ["Wayne", "Mugwe", "Tyson", "Marvel", "Chris", "Imma"],
    },
    {
        "id": "MAS",
        "name": "Masters",
        "color": "#D97B29",
        "players": ["Isaac", "Toma", "Kaama", "Caleb", "Aizo"],
    },
    {
        "id": "MAN",
        "name": "Mancheli",
        "color": "#C9A227",
        "players": ["Ramsey", "Jimmy", "Eddie", "Brayo", "Aizo", "Wafula", "Manu", "Kibe"],
    },
]

def rsUnk(team_id):
    return f"{team_id}-UNK"

def rsG(team_id, name=None):
    return {"teamId": team_id, "name": name, "type": "goal"}

def rsA(team_id, name=None):
    return {"teamId": team_id, "name": name, "type": "assist"}

def rsY(team_id, name=None):
    return {"teamId": team_id, "name": name, "type": "yellow"}

def rsR(team_id, name=None):
    return {"teamId": team_id, "name": name, "type": "red"}

REAL_OPEN_FIXTURES_SEED = [
    {"date": "Aug 1", "home": "SS", "away": "MAN", "events": [rsG("MAN"), rsG("MAN"), rsG("MAN")]},
    {"date": "Aug 1", "home": "RAN", "away": "MAS", "events": [rsG("RAN"), rsG("MAS")]},
    {
        "date": "Aug 3",
        "home": "OXF",
        "away": "SS",
        "events": [rsG("OXF", "Jose"), rsA("OXF", "Obonyo"), rsG("SS"), rsG("SS"), rsG("SS"), rsG("SS")],
    },
    {"date": "Aug 3", "home": "MAS", "away": "MAN", "events": [rsG("MAS"), rsG("MAS"), rsG("MAN"), rsG("MAN"), rsG("MAN")]},
    {"date": "Aug 4", "home": "OXF", "away": "RAN", "events": [rsG("OXF"), rsG("RAN"), rsG("RAN"), rsG("RAN"), rsG("RAN"), rsG("RAN")]},
    {"date": "Aug 4", "home": "MAS", "away": "SS", "events": [rsG("MAS"), rsG("MAS"), rsG("MAS"), rsG("SS"), rsG("SS"), rsG("SS"), rsG("SS"), rsG("SS"), rsG("SS")]},
    {
        "date": "Aug 5",
        "home": "OXF",
        "away": "MAS",
        "events": [
            rsG("OXF", "Pato"),
            rsA("OXF", "Dero"),
            rsG("OXF", "Dero"),
            rsA("OXF", "Mugane"),
            rsG("OXF", "Wanjohi"),
            rsA("OXF", "Peter"),
            rsY("OXF", "Pato"),
            rsG("MAS", "Aizo"),
            rsG("MAS", "Caleb"),
            rsG("MAS", "Caleb"),
        ],
    },
    {"date": "TBD", "home": "RAN", "away": "MAN", "events": [rsG("MAN"), rsG("MAN")]},
    {
        "date": "Aug 6",
        "home": "OXF",
        "away": "MAN",
        "events": [
            rsG("OXF", "Peter"),
            rsA("OXF", "Brandon"),
            rsG("OXF", "Brandon"),
            rsA("OXF", "Peter"),
            rsG("OXF", "Obonyo"),
            rsA("OXF", "Peter"),
            rsG("MAN", "Jimmy"),
            rsA("MAN", "Aizo"),
            rsG("MAN", "Jimmy"),
            rsA("MAN", "Eddie"),
            rsG("MAN", "Jimmy"),
            rsG("MAN", "Brayo"),
            rsA("MAN", "Jimmy"),
            rsG("MAN", "Ramsey"),
            rsA("MAN", "Eddie"),
            rsG("MAN", "Ramsey"),
            rsG("MAN", "Eddie"),
            rsA("MAN", "Ramsey"),
        ],
    },
    {
        "date": "Aug 6",
        "home": "SS",
        "away": "RAN",
        "events": [
            rsG("SS", "Ian"),
            rsG("SS", "Kuria"),
            rsG("RAN", "Wayne"),
            rsG("RAN", "Mugwe"),
            rsG("RAN", "Mugwe"),
            rsG("RAN", "Mugwe"),
            rsY("RAN", "Wayne"),
            rsY("RAN", "Mugwe"),
        ],
    },
    {
        "date": "Aug 7",
        "home": "SS",
        "away": "OXF",
        "events": [
            rsG("SS", "Farasi"),
            rsA("SS", "Ian"),
            rsG("SS", "Muturi"),
            rsA("SS", "Ian"),
            rsG("SS", "Sam"),
            rsG("SS", "Kuria"),
            rsA("SS", "Kevo"),
            rsG("SS", "Kuria"),
            rsG("SS", "Kuria"),
            rsY("SS", "Farasi"),
            rsG("OXF", "Obonyo"),
            rsG("OXF", "Dero"),
            rsA("OXF", "Mugane"),
            rsG("OXF", "Dero"),
            rsA("OXF", "Mugane"),
            rsY("OXF", "Obonyo"),
        ],
    },
    {
        "date": "Aug 7",
        "home": "MAN",
        "away": "MAS",
        "events": [
            rsG("MAN", "Jimmy"),
            rsA("MAN", "Ramsey"),
            rsG("MAN", "Jimmy"),
            rsA("MAN", "Wafula"),
            rsG("MAN", "Ramsey"),
            rsA("MAN", "Jimmy"),
            rsG("MAS", "Caleb"),
            rsA("MAS", "Aizo"),
            rsG("MAS", "Aizo"),
            rsA("MAS", "Toma"),
        ],
    },
    {
        "date": "Aug 8",
        "home": "MAS",
        "away": "OXF",
        "events": [
            rsG("MAS", "Toma"),
            rsG("MAS", "Kaama"),
            rsA("MAS", "Caleb"),
            rsG("MAS", "Caleb"),
            rsA("MAS", "Kaama"),
            rsG("MAS", "Aizo"),
            rsA("MAS", "Toma"),
            rsY("MAS", "Toma"),
        ],
    },
    {
        "date": "Aug 8",
        "home": "RAN",
        "away": "MAN",
        "events": [
            rsG("RAN", "Tyson"),
            rsG("MAN", "Manu"),
            rsA("MAN", "Ramsey"),
            rsG("MAN", "Jimmy"),
            rsA("MAN", "Ramsey"),
        ],
    },
    {
        "date": "Aug 10",
        "home": "OXF",
        "away": "RAN",
        "events": [
            rsG("OXF", "Rafo"),
            rsA("OXF", "Pato"),
            rsG("OXF", "Rafo"),
            rsA("OXF", "Jobu"),
            rsG("OXF", "Mugane"),
            rsY("OXF", "Pato"),
            rsR("OXF", "Pato"),
            rsG("RAN", "Wayne"),
            rsA("RAN", "Chris"),
            rsY("RAN", "OG"),
            rsY("RAN", "Tyson"),
            rsR("RAN", "Marvel"),
        ],
    },
    {
        "date": "Aug 10",
        "home": "SS",
        "away": "MAS",
        "events": [
            rsG("SS", "Farasi"),
            rsA("SS", "Sam"),
            rsG("SS", "Sam"),
            rsA("SS", "OG"),
            rsY("SS", "Farasi"),
            rsY("SS", "Farasi"),
            rsR("SS", "Farasi"),
            rsG("MAS", "Caleb"),
            rsY("MAS", "Toma"),
        ],
    },
    {
        "date": "Aug 11",
        "home": "RAN",
        "away": "SS",
        "events": [
            rsG("SS", "Alvo"),
            rsA("SS", "Kuria"),
            rsY("SS", "Kuria"),
            rsY("RAN", "Tyson"),
            rsY("RAN", "Tyson"),
            rsR("RAN", "Tyson"),
        ],
    },
    {
        "date": "Aug 11",
        "home": "MAN",
        "away": "OXF",
        "events": [
            rsG("MAN", "Jimmy"),
            rsA("MAN", "Eddie"),
            rsG("OXF", "Rafo"),
            rsA("OXF", "Mugane"),
        ],
    },
    {
        "date": "Aug 12",
        "home": "MAN",
        "away": "SS",
        "events": [
            rsG("MAN", "Kibe"),
            rsA("MAN", "Ramsey"),
            rsG("MAN", "Jimmy"),
            rsA("MAN", "Kibe"),
            rsY("MAN", "Ramsey"),
            rsG("SS", "Farasi"),
            rsY("SS", "Farasi"),
        ],
    },
    {"date": "Aug 12", "home": "MAS", "away": "RAN", "events": [rsG("MAS", "Caleb"), rsG("MAS", "Kaama")]},
]


def build_real_open_season_dict():
    """Constructs the seed dictionary for the Open League season."""
    teams = []
    for t in REAL_OPEN_TEAM_SEED:
        players = [{"id": f"{t['id']}-P{i+1}", "name": n, "position": ""} for i, n in enumerate(t["players"])]
        players.append({"id": rsUnk(t["id"]), "name": "Unrecorded scorer", "unknown": True})
        teams.append({
            "id": t["id"],
            "name": t["name"],
            "color": t["color"],
            "players": players,
        })

    teams_by_id = {t["id"]: t for t in teams}

    def find_player_id(team_id, name):
        if not name:
            return rsUnk(team_id)
        team = teams_by_id.get(team_id)
        if team:
            for p in team["players"]:
                if p["name"] == name:
                    return p["id"]
        return rsUnk(team_id)

    def convert_events(raw_events):
        out = []
        i = 0
        while i < len(raw_events):
            e = raw_events[i]
            if e["type"] == "assist":
                i += 1
                continue
            if e["type"] == "goal":
                next_ev = raw_events[i + 1] if i + 1 < len(raw_events) else None
                assist_id = (
                    find_player_id(next_ev["teamId"], next_ev["name"])
                    if (next_ev and next_ev["type"] == "assist")
                    else None
                )
                out.append({
                    "playerId": find_player_id(e["teamId"], e["name"]),
                    "teamId": e["teamId"],
                    "type": "goal",
                    "assistPlayerId": assist_id,
                    "penalty": False,
                })
            else:
                out.append({
                    "playerId": find_player_id(e["teamId"], e["name"]),
                    "teamId": e["teamId"],
                    "type": e["type"],
                })
            i += 1
        return out

    fixtures = []
    for i, f in enumerate(REAL_OPEN_FIXTURES_SEED):
        fixtures.append({
            "id": f"REAL-F{i+1}",
            "date": f["date"],
            "home": f["home"],
            "away": f["away"],
            "played": True,
            "events": convert_events(f["events"]),
        })

    return {
        "label": "Open",
        "mode": "league",
        "format": "double",
        "teams": teams,
        "fixtures": fixtures,
        "schedule": {"time": "18:00", "days": {3: 1, 4: 1, 5: 1, 6: 1}},
        "referees": ["Main Ref", "Assistant Ref"],
        "note": "A handful of early results (Aug 1–4) only had final scores on record, not individual scorers — logged as “Unrecorded scorer.”",
    }


@transaction.atomic
def import_state_to_db(state_dict):
    """
    Imports a full state dict (categories, activeCategory, etc.) into Django models.
    """
    if not state_dict or "categories" not in state_dict:
        return

    active_cat_key = state_dict.get("activeCategory", "open")
    settings, _ = GlobalSettings.objects.get_or_create(id=1)
    settings.active_category_key = active_cat_key
    settings.save()

    categories_data = state_dict.get("categories", {})

    for cat_key, cat_data in categories_data.items():
        mode = cat_data.get("mode", "league")
        format_choice = cat_data.get("format", "double")
        label = cat_data.get("label", cat_key.capitalize())
        note = cat_data.get("note", "")

        schedule_dict = cat_data.get("schedule", {})
        schedule_time = schedule_dict.get("time", "18:00")
        schedule_days = schedule_dict.get("days", {3: 1, 4: 1, 5: 1, 6: 1})

        category, _ = Category.objects.update_or_create(
            key=cat_key,
            defaults={
                "label": label,
                "mode": mode,
                "format": format_choice,
                "note": note,
                "schedule_time": schedule_time,
                "schedule_days": schedule_days,
                "group_letters": cat_data.get("groupLetters", []),
                "group_of": cat_data.get("groupOf", {}),
                "rounds_data": cat_data.get("rounds", None),
            },
        )

        # Referees
        category.referees.all().delete()
        for ref_name in cat_data.get("referees", []):
            Referee.objects.create(category=category, name=ref_name)

        # Teams & Players
        teams_map = {}  # team_id -> Team instance
        players_map = {}  # (team_id, player_id) -> Player instance

        existing_team_ids = set()
        for t_info in cat_data.get("teams", []):
            team_id = t_info["id"]
            existing_team_ids.add(team_id)
            team_obj, _ = Team.objects.update_or_create(
                category=category,
                team_id=team_id,
                defaults={
                    "name": t_info.get("name", team_id),
                    "color": t_info.get("color", "#2E5A8F"),
                },
            )
            teams_map[team_id] = team_obj

            existing_player_ids = set()
            for p_info in t_info.get("players", []):
                p_id = p_info["id"]
                existing_player_ids.add(p_id)
                player_obj, _ = Player.objects.update_or_create(
                    team=team_obj,
                    player_id=p_id,
                    defaults={
                        "name": p_info.get("name", p_id),
                        "position": p_info.get("position", ""),
                        "is_unknown": bool(p_info.get("unknown", False)),
                    },
                )
                players_map[(team_id, p_id)] = player_obj

            team_obj.players.exclude(player_id__in=existing_player_ids).delete()

        category.teams.exclude(team_id__in=existing_team_ids).delete()

        # Fixtures & Events
        raw_fixtures = []
        if mode == "league":
            for f in cat_data.get("fixtures", []):
                raw_fixtures.append((f, "league", "", None, None))
        else:
            # Group fixtures
            group_fixtures = cat_data.get("groupFixtures", {})
            for letter, flist in group_fixtures.items():
                for f in flist:
                    raw_fixtures.append((f, "group", letter, None, None))

        seen_fixture_ids = set()
        for f_data, phase, g_letter, r_idx, t_idx in raw_fixtures:
            f_id = f_data["id"]
            seen_fixture_ids.add(f_id)

            home_team = teams_map.get(f_data.get("home"))
            away_team = teams_map.get(f_data.get("away"))
            walkover_team = teams_map.get(f_data.get("walkover")) if f_data.get("walkover") else None

            pens = f_data.get("pens")
            home_pens = pens[0] if (pens and len(pens) > 0) else None
            away_pens = pens[1] if (pens and len(pens) > 1) else None

            fixture_obj, _ = Fixture.objects.update_or_create(
                category=category,
                fixture_id=f_id,
                defaults={
                    "phase": phase,
                    "group_letter": g_letter,
                    "round_index": r_idx,
                    "tie_index": t_idx,
                    "date": f_data.get("date", "TBD"),
                    "home_team": home_team,
                    "away_team": away_team,
                    "played": bool(f_data.get("played", False)),
                    "walkover_winner": walkover_team,
                    "home_pens": home_pens,
                    "away_pens": away_pens,
                    "referee": f_data.get("referee", ""),
                },
            )

            # Recreate events
            fixture_obj.events.all().delete()
            events = f_data.get("events", [])
            for order, ev in enumerate(events):
                ev_team = teams_map.get(ev.get("teamId"))
                if not ev_team:
                    continue
                ev_player = players_map.get((ev.get("teamId"), ev.get("playerId")))
                assist_player = (
                    players_map.get((ev.get("teamId"), ev.get("assistPlayerId")))
                    if ev.get("assistPlayerId")
                    else None
                )

                MatchEvent.objects.create(
                    fixture=fixture_obj,
                    team=ev_team,
                    player=ev_player,
                    event_type=ev.get("type", "goal"),
                    assist_player=assist_player,
                    is_penalty=bool(ev.get("penalty", False)),
                    order=order,
                )

        category.fixtures.exclude(fixture_id__in=seen_fixture_ids).delete()


def export_state_from_db():
    """
    Exports full database state to a JSON-ready dict.
    """
    settings = GlobalSettings.objects.first()
    active_cat_key = settings.active_category_key if settings else "open"

    categories = {}
    for cat in Category.objects.all().order_by("key"):
        categories[cat.key] = cat.to_state_dict()

    if not categories:
        # If DB is empty, seed with real Open season
        open_data = build_real_open_season_dict()
        import_state_to_db({"categories": {"open": open_data}, "activeCategory": "open"})
        return export_state_from_db()

    if active_cat_key not in categories:
        active_cat_key = next(iter(categories.keys()))

    return {
        "categories": categories,
        "activeCategory": active_cat_key,
    }
