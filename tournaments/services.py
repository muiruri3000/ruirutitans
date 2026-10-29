import re
import random
from django.db import transaction
from django.utils import timezone
from django.utils.text import slugify
from django.db.models import Count, Max, Avg, Q
from .models import Category, Team, Player, Referee, Fixture, MatchEvent, GlobalSettings, VotingRound, PositionVote, WeeklyMVP, fixture_sort_key, parse_fixture_date_key

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
    {
        "date": "Aug 12",
        "home": "MAS",
        "away": "RAN",
        "events": [
            rsG("MAS", "Caleb"),
            rsG("MAS", "Kaama"),
        ],
    },
]


def build_real_open_season_dict():
    teams = []
    for t in REAL_OPEN_TEAM_SEED:
        players = [
            {
                "id": f"{t['id']}-P{i+1}",
                "name": n,
                "position": DEFAULT_PLAYER_POSITIONS.get(t["id"], {}).get(n, ""),
            }
            for i, n in enumerate(t["players"])
        ]
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
            "date": f["date"] if f["date"] != "TBD" else "Aug 5",
            "home": f["home"],
            "away": f["away"],
            "played": True,
            "referee": "Main Ref" if i % 2 == 0 else "Assistant Ref",
            "events": convert_events(f["events"]),
        })

    return {
        "label": "Open",
        "mode": "league",
        "format": "double",
        "teams": teams,
        "fixtures": fixtures,
        "schedule": {"time": "18:00", "days": {3: 1, 4: 1, 5: 1, 6: 1}},
        "referees": ["Main Ref", "Assistant Ref", "Coach Ref"],
        "votingConfig": {
            "team_size": 6,
            "max_picks_per_position": 2,
            "include_gk": False,
        },
        "isEnded": True,
        "championTeam": "Mancheli",
        "runnerUpTeam": "Super Strikers",
        "note": "Official Ruiru Titans Open League (August 2026 Season) — 6-a-side tournament with no goalkeepers. Mancheli confirmed as League Champions.",
    }


CUP_EXTRA_TEAMS_SEED = [
    {
        "id": "TYT",
        "name": "Titans Youth",
        "color": "#1F6E5C",
        "players": ["Kevin", "Dennis", "Brian", "Eliud", "Samson", "Victor"],
    },
    {
        "id": "ROY",
        "name": "Ruiru Royals",
        "color": "#7A3F8F",
        "players": ["Brian", "Collins", "Kelvin", "Patrick", "Martin", "Kennedy"],
    },
    {
        "id": "KIM",
        "name": "Kimbo United",
        "color": "#2E7A7A",
        "players": ["Kamau", "Njoroge", "Mwangi", "Kariuki", "Otieno", "Juma"],
    },
]


def build_real_cup_season_dict():
    """
    Constructs a rich Cup tournament ('Ruiru Titans Cup') featuring:
    - 8 Club Squads across Group A & Group B
    - Group Stage Fixtures (played results + upcoming group deciders)
    - 3 Knockout Progression Levels: Quarter-Finals -> Semi-Finals -> Grand Final
    """
    all_seed_teams = REAL_OPEN_TEAM_SEED + CUP_EXTRA_TEAMS_SEED
    teams = []
    for t in all_seed_teams:
        players = [
            {
                "id": f"{t['id']}-P{i+1}",
                "name": n.capitalize() if n.islower() else n,
                "position": DEFAULT_PLAYER_POSITIONS.get(t["id"], {}).get(
                    n.capitalize() if n.islower() else n,
                    "",
                ),
            }
            for i, n in enumerate(t["players"])
        ]
        players.append({"id": rsUnk(t["id"]), "name": "Unrecorded scorer", "unknown": True})
        teams.append({
            "id": t["id"],
            "name": t["name"],
            "color": t["color"],
            "players": players,
        })

    group_letters = ["A", "B"]
    group_of = {
        "SS": "A",
        "OXF": "A",
        "RAN": "A",
        "TYT": "A",
        "MAN": "B",
        "MAS": "B",
        "ROY": "B",
        "KIM": "B",
    }

    group_fixtures = {
        "A": [
            {
                "id": "CUP-GA-1",
                "date": "Sep 12 · 16:00",
                "home": "SS",
                "away": "OXF",
                "played": True,
                "referee": "Main Ref",
                "events": [
                    {"teamId": "SS", "playerId": "SS-P1", "type": "goal", "assistPlayerId": "SS-P2", "penalty": False},
                    {"teamId": "SS", "playerId": "SS-P4", "type": "goal", "assistPlayerId": "SS-P3", "penalty": False},
                    {"teamId": "OXF", "playerId": "OXF-P1", "type": "goal", "assistPlayerId": "OXF-P6", "penalty": False},
                ],
            },
            {
                "id": "CUP-GA-2",
                "date": "Sep 12 · 17:30",
                "home": "RAN",
                "away": "TYT",
                "played": True,
                "referee": "Assistant Ref",
                "events": [
                    {"teamId": "RAN", "playerId": "RAN-P1", "type": "goal", "assistPlayerId": "RAN-P5", "penalty": False},
                    {"teamId": "RAN", "playerId": "RAN-P2", "type": "goal", "assistPlayerId": None, "penalty": False},
                    {"teamId": "TYT", "playerId": "TYT-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                ],
            },
            {
                "id": "CUP-GA-3",
                "date": "Sep 19 · 16:00",
                "home": "SS",
                "away": "RAN",
                "played": True,
                "referee": "Main Ref",
                "events": [
                    {"teamId": "SS", "playerId": "SS-P2", "type": "goal", "assistPlayerId": "SS-P1", "penalty": False},
                    {"teamId": "SS", "playerId": "SS-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                    {"teamId": "RAN", "playerId": "RAN-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                    {"teamId": "RAN", "playerId": "RAN-P2", "type": "goal", "assistPlayerId": None, "penalty": False},
                ],
            },
            {
                "id": "CUP-GA-4",
                "date": "Sep 19 · 17:30",
                "home": "OXF",
                "away": "TYT",
                "played": True,
                "referee": "Assistant Ref",
                "events": [
                    {"teamId": "OXF", "playerId": "OXF-P1", "type": "goal", "assistPlayerId": "OXF-P2", "penalty": False},
                    {"teamId": "OXF", "playerId": "OXF-P3", "type": "goal", "assistPlayerId": "OXF-P5", "penalty": False},
                    {"teamId": "OXF", "playerId": "OXF-P2", "type": "goal", "assistPlayerId": None, "penalty": False},
                ],
            },
            {
                "id": "CUP-GA-5",
                "date": "Sep 26 · 16:00",
                "home": "SS",
                "away": "TYT",
                "played": True,
                "referee": "Main Ref",
                "events": [
                    {"teamId": "SS", "playerId": "SS-P4", "type": "goal", "assistPlayerId": "SS-P1", "penalty": False},
                    {"teamId": "SS", "playerId": "SS-P8", "type": "goal", "assistPlayerId": None, "penalty": False},
                ],
            },
            {
                "id": "CUP-GA-6",
                "date": "Sun, Oct 18 · 16:00",
                "home": "OXF",
                "away": "RAN",
                "played": False,
                "referee": "Main Ref",
                "events": [],
            },
        ],
        "B": [
            {
                "id": "CUP-GB-1",
                "date": "Sep 13 · 16:00",
                "home": "MAN",
                "away": "MAS",
                "played": True,
                "referee": "Main Ref",
                "events": [
                    {"teamId": "MAN", "playerId": "MAN-P2", "type": "goal", "assistPlayerId": "MAN-P1", "penalty": False},
                    {"teamId": "MAN", "playerId": "MAN-P1", "type": "goal", "assistPlayerId": "MAN-P3", "penalty": False},
                    {"teamId": "MAS", "playerId": "MAS-P4", "type": "goal", "assistPlayerId": "MAS-P5", "penalty": False},
                ],
            },
            {
                "id": "CUP-GB-2",
                "date": "Sep 13 · 17:30",
                "home": "ROY",
                "away": "KIM",
                "played": True,
                "referee": "Assistant Ref",
                "events": [
                    {"teamId": "ROY", "playerId": "ROY-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                    {"teamId": "ROY", "playerId": "ROY-P3", "type": "goal", "assistPlayerId": "ROY-P1", "penalty": False},
                    {"teamId": "KIM", "playerId": "KIM-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                ],
            },
            {
                "id": "CUP-GB-3",
                "date": "Sep 20 · 16:00",
                "home": "MAN",
                "away": "ROY",
                "played": True,
                "referee": "Main Ref",
                "events": [
                    {"teamId": "MAN", "playerId": "MAN-P2", "type": "goal", "assistPlayerId": "MAN-P1", "penalty": False},
                    {"teamId": "MAN", "playerId": "MAN-P3", "type": "goal", "assistPlayerId": None, "penalty": False},
                    {"teamId": "MAN", "playerId": "MAN-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                    {"teamId": "ROY", "playerId": "ROY-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                ],
            },
            {
                "id": "CUP-GB-4",
                "date": "Sep 20 · 17:30",
                "home": "MAS",
                "away": "KIM",
                "played": True,
                "referee": "Assistant Ref",
                "events": [
                    {"teamId": "MAS", "playerId": "MAS-P4", "type": "goal", "assistPlayerId": "MAS-P2", "penalty": False},
                    {"teamId": "MAS", "playerId": "MAS-P5", "type": "goal", "assistPlayerId": "MAS-P4", "penalty": False},
                ],
            },
            {
                "id": "CUP-GB-5",
                "date": "Sep 27 · 16:00",
                "home": "MAN",
                "away": "KIM",
                "played": True,
                "referee": "Main Ref",
                "events": [
                    {"teamId": "MAN", "playerId": "MAN-P2", "type": "goal", "assistPlayerId": None, "penalty": False},
                    {"teamId": "MAN", "playerId": "MAN-P8", "type": "goal", "assistPlayerId": "MAN-P1", "penalty": False},
                ],
            },
            {
                "id": "CUP-GB-6",
                "date": "Sun, Oct 18 · 17:30",
                "home": "MAS",
                "away": "ROY",
                "played": False,
                "referee": "Assistant Ref",
                "events": [],
            },
        ],
    }

    # Knockout Progression Levels:
    # Level 0: Quarter-Finals (4 ties)
    # Level 1: Semi-Finals (2 ties)
    # Level 2: Grand Final (1 tie)
    rounds = [
        [
            {
                "id": "CUP-QF1",
                "stage": "Quarter-Final 1",
                "date": "Oct 3 · 16:00",
                "home": "SS",
                "away": "KIM",
                "referee": "Main Ref",
                "match": {
                    "played": True,
                    "events": [
                        {"teamId": "SS", "playerId": "SS-P1", "type": "goal", "assistPlayerId": "SS-P2", "penalty": False},
                        {"teamId": "SS", "playerId": "SS-P2", "type": "goal", "assistPlayerId": "SS-P4", "penalty": False},
                        {"teamId": "SS", "playerId": "SS-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                        {"teamId": "KIM", "playerId": "KIM-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                    ],
                },
                "pen": {"h": "", "a": ""},
            },
            {
                "id": "CUP-QF2",
                "stage": "Quarter-Final 2",
                "date": "Oct 3 · 18:00",
                "home": "MAS",
                "away": "RAN",
                "referee": "Assistant Ref",
                "match": {
                    "played": True,
                    "events": [
                        {"teamId": "MAS", "playerId": "MAS-P4", "type": "goal", "assistPlayerId": "MAS-P5", "penalty": False},
                        {"teamId": "MAS", "playerId": "MAS-P3", "type": "goal", "assistPlayerId": None, "penalty": False},
                        {"teamId": "RAN", "playerId": "RAN-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                        {"teamId": "RAN", "playerId": "RAN-P2", "type": "goal", "assistPlayerId": "RAN-P1", "penalty": False},
                    ],
                },
                "pen": {"h": 4, "a": 3},
            },
            {
                "id": "CUP-QF3",
                "stage": "Quarter-Final 3",
                "date": "Oct 4 · 16:00",
                "home": "MAN",
                "away": "TYT",
                "referee": "Main Ref",
                "match": {
                    "played": True,
                    "events": [
                        {"teamId": "MAN", "playerId": "MAN-P2", "type": "goal", "assistPlayerId": "MAN-P1", "penalty": False},
                        {"teamId": "MAN", "playerId": "MAN-P2", "type": "goal", "assistPlayerId": "MAN-P3", "penalty": False},
                        {"teamId": "MAN", "playerId": "MAN-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                        {"teamId": "TYT", "playerId": "TYT-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                    ],
                },
                "pen": {"h": "", "a": ""},
            },
            {
                "id": "CUP-QF4",
                "stage": "Quarter-Final 4",
                "date": "Oct 4 · 18:00",
                "home": "OXF",
                "away": "ROY",
                "referee": "Main Ref",
                "match": {
                    "played": True,
                    "events": [
                        {"teamId": "OXF", "playerId": "OXF-P1", "type": "goal", "assistPlayerId": "OXF-P6", "penalty": False},
                        {"teamId": "OXF", "playerId": "OXF-P2", "type": "goal", "assistPlayerId": "OXF-P3", "penalty": False},
                        {"teamId": "ROY", "playerId": "ROY-P1", "type": "goal", "assistPlayerId": None, "penalty": False},
                    ],
                },
                "pen": {"h": "", "a": ""},
            },
        ],
        [
            {
                "id": "CUP-SF1",
                "stage": "Semi-Final 1",
                "date": "Oct 10 · 18:00",
                "home": "SS",
                "away": "MAS",
                "referee": "Main Ref",
                "match": {
                    "played": True,
                    "events": [
                        {"teamId": "SS", "playerId": "SS-P4", "type": "goal", "assistPlayerId": "SS-P1", "penalty": False},
                        {"teamId": "SS", "playerId": "SS-P1", "type": "goal", "assistPlayerId": "SS-P2", "penalty": False},
                        {"teamId": "SS", "playerId": "SS-P2", "type": "goal", "assistPlayerId": None, "penalty": False},
                        {"teamId": "MAS", "playerId": "MAS-P4", "type": "goal", "assistPlayerId": "MAS-P5", "penalty": False},
                        {"teamId": "MAS", "playerId": "MAS-P5", "type": "goal", "assistPlayerId": None, "penalty": False},
                    ],
                },
                "pen": {"h": "", "a": ""},
            },
            {
                "id": "CUP-SF2",
                "stage": "Semi-Final 2",
                "date": "Thu, Oct 22 · 18:30",
                "home": "MAN",
                "away": "OXF",
                "referee": "Main Ref",
                "match": {
                    "played": False,
                    "events": [],
                },
                "pen": {"h": "", "a": ""},
            },
        ],
        [
            {
                "id": "CUP-FINAL",
                "stage": "Grand Final",
                "date": "Sun, Oct 25 · 19:00",
                "home": "SS",
                "away": None,
                "referee": "Main Ref",
                "match": {
                    "played": False,
                    "events": [],
                },
                "pen": {"h": "", "a": ""},
            },
        ],
    ]

    return {
        "label": "Ruiru Titans Cup",
        "mode": "cup",
        "format": "single",
        "teams": teams,
        "groupLetters": group_letters,
        "groupOf": group_of,
        "groupFixtures": group_fixtures,
        "rounds": rounds,
        "schedule": {"time": "18:00", "days": {3: 1, 4: 1, 5: 1, 6: 1}},
        "referees": ["Main Ref", "Assistant Ref", "Coach Ref"],
        "note": "Ruiru Titans Knockout Cup — Top 4 from each Group advance to Quarter-Finals, Semi-Finals, and the Grand Final.",
    }


def _make_svg_banner_uri(bg1, bg2, accent, badge_text, title, subtitle):
    import base64
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 520" width="1200" height="520">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="{bg1}"/>
          <stop offset="60%" stop-color="{bg2}"/>
          <stop offset="100%" stop-color="#041510"/>
        </linearGradient>
        <radialGradient id="glow" cx="80%" cy="30%" r="55%">
          <stop offset="0%" stop-color="{accent}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="{accent}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="520" fill="url(#bg)"/>
      <rect width="1200" height="520" fill="url(#glow)"/>
      <g stroke="rgba(255,255,255,0.06)" stroke-width="2" fill="none">
        <rect x="60" y="40" width="1080" height="440" rx="16"/>
        <line x1="600" y1="40" x2="600" y2="480"/>
        <circle cx="600" cy="260" r="95"/>
        <circle cx="600" cy="260" r="6" fill="{accent}"/>
      </g>
      <circle cx="960" cy="255" r="145" fill="rgba(201,162,39,0.08)" stroke="{accent}" stroke-width="3" stroke-dasharray="10 6"/>
      <text x="960" y="245" text-anchor="middle" font-family="Impact, sans-serif" font-size="74" fill="{accent}" opacity="0.9">TITANS</text>
      <text x="960" y="295" text-anchor="middle" font-family="Arial, sans-serif" font-weight="bold" font-size="22" fill="#F4F2EA" letter-spacing="6">RUIRU FC</text>
      <rect x="95" y="110" width="240" height="34" rx="17" fill="{accent}"/>
      <text x="215" y="133" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="14" fill="#10221B" letter-spacing="2">{badge_text}</text>
      <text x="95" y="215" font-family="Arial, sans-serif" font-weight="900" font-size="52" fill="#F4F2EA">{title}</text>
      <text x="95" y="268" font-family="Arial, sans-serif" font-size="22" fill="#A9C4B6">{subtitle}</text>
    </svg>"""
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode("ascii")


def _make_jersey_svg_uri(primary_color, secondary_color, trim_color, age_group, kit_type, number="10"):
    import base64
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 460" width="420" height="460">
      <defs>
        <linearGradient id="cardBg" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#0E3327"/>
          <stop offset="100%" stop-color="#071C15"/>
        </linearGradient>
        <linearGradient id="shirtGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="{primary_color}"/>
          <stop offset="100%" stop-color="{secondary_color}"/>
        </linearGradient>
      </defs>
      <rect width="420" height="460" rx="18" fill="url(#cardBg)"/>
      <circle cx="210" cy="215" r="135" fill="rgba(201,162,39,0.07)" stroke="rgba(201,162,39,0.2)" stroke-width="1.5"/>
      <!-- Jersey Silhouette -->
      <path d="M135 95 L172 80 C185 98 235 98 248 80 L285 95 L335 145 L302 192 L272 168 L272 340 L148 340 L148 168 L118 192 L85 145 Z"
            fill="url(#shirtGrad)" stroke="{trim_color}" stroke-width="4" stroke-linejoin="round"/>
      <!-- Collar & Sleeve Cuffs -->
      <path d="M172 80 C185 102 235 102 248 80" fill="none" stroke="{trim_color}" stroke-width="6"/>
      <line x1="89" y1="149" x2="120" y2="188" stroke="{trim_color}" stroke-width="7"/>
      <line x1="331" y1="149" x2="300" y2="188" stroke="{trim_color}" stroke-width="7"/>
      <!-- Chest Stripes -->
      <rect x="148" y="205" width="124" height="16" fill="{trim_color}" opacity="0.85"/>
      <!-- Crest Badge -->
      <circle cx="242" cy="145" r="14" fill="#0B2E23" stroke="{trim_color}" stroke-width="2.5"/>
      <text x="242" y="150" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="10" fill="{trim_color}">RT</text>
      <!-- Squad Number -->
      <text x="210" y="292" text-anchor="middle" font-family="Impact, Arial, sans-serif" font-weight="900" font-size="68" fill="{trim_color}" stroke="#082018" stroke-width="2">{number}</text>
      <!-- Footer Label -->
      <rect x="30" y="375" width="360" height="56" rx="10" fill="rgba(8,32,24,0.85)" stroke="rgba(201,162,39,0.35)" stroke-width="1.5"/>
      <text x="210" y="400" text-anchor="middle" font-family="Arial, sans-serif" font-weight="900" font-size="16" fill="#F4F2EA" letter-spacing="1.5">{age_group} • {kit_type}</text>
      <text x="210" y="420" text-anchor="middle" font-family="Arial, sans-serif" font-size="11.5" fill="#C9A227" letter-spacing="1">OFFICIAL RUIRU TITANS CLUB KIT</text>
    </svg>"""
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode("utf-8")).decode("ascii")


def build_default_homepage_data():
    """
    Builds default Ruiru Titans Homepage data:
    - Admin-managed Carousel slides
    - 4 Jersey Photo rows: u13, u15, u17, wazae
    - Quick-view upcoming club fixtures with categories: internal, friendly, tournament, league, cup
    """
    return {
        "carousel": [
            {
                "id": "slide-1",
                "title": "RUIRU TITANS FC 2026 MATCHDAY ARENA",
                "subtitle": "Uniting Youth Academy (U13, U15, U17), Senior First Team & Wazae Legends Under One Crest.",
                "tag": "CLUB SHOWCASE",
                "image": _make_svg_banner_uri(
                    "#0F3D2E", "#08241B", "#C9A227", "OFFICIAL CLUB GALLERY", "RUIRU TITANS FC", "Pride of Ruiru • Youth to Wazae Legends"
                ),
            },
            {
                "id": "slide-2",
                "title": "YOUTH DEVELOPMENT PATHWAY: U13, U15 & U17",
                "subtitle": "Building the next generation of Ruiru Titans stars with structured technical coaching & official kits.",
                "tag": "ACADEMY EXCELLENCE",
                "image": _make_svg_banner_uri(
                    "#14385C", "#092138", "#F4C542", "YOUTH ACADEMY", "U13 • U15 • U17 SQUADS", "Official 2026 Season Kits & Training Camp"
                ),
            },
            {
                "id": "slide-3",
                "title": "WAZAE LEGENDS & VETERANS DERBY NIGHTS",
                "subtitle": "Honouring our club veterans alongside high-intensity Championship League & Tournament action.",
                "tag": "WAZAE & SENIORS",
                "image": _make_svg_banner_uri(
                    "#4A1C1C", "#1F0D0D", "#C9A227", "WAZAE VETERANS", "HERITAGE & BROTHERHOOD", "Weekend Derbies, Friendlies & Tournaments"
                ),
            },
            {
                "id": "slide-4",
                "title": "FIRST TEAM SENIOR SQUAD AT THOOME PRI.",
                "subtitle": "Home fortress matchdays, spirited community support & championship title hunt.",
                "tag": "FIRST TEAM FORTRESS",
                "image": _make_svg_banner_uri(
                    "#1B4D3E", "#0D2E24", "#C9A227", "MATCHDAY HOME", "THOOME PRI. GROUND", "The Fortress of Ruiru Titans Football Club"
                ),
            },
            {
                "id": "slide-5",
                "title": "COMMUNITY OUTREACH & JUNIOR CLINICS",
                "subtitle": "Empowering youth talent across Ruiru sub-county with elite coaching drills and grassroots clinics.",
                "tag": "COMMUNITY ROOTS",
                "image": _make_svg_banner_uri(
                    "#203A43", "#0F2027", "#5CD685", "GRASSROOTS INITIATIVE", "RUIRU COMMUNITY CLINICS", "Free Youth Training, Football Gear & Mentorship"
                ),
            },
            {
                "id": "slide-6",
                "title": "TITANS TROPHY CABINET & HONOURS ROLL",
                "subtitle": "Celebrating our tournament triumphs, championship podiums, and historic victories.",
                "tag": "CLUB HONOURS",
                "image": _make_svg_banner_uri(
                    "#3A2800", "#1C1400", "#FFD700", "CHAMPIONS VAULT", "TROPHIES & SILVERWARE", "Honouring Our Legacy of Championship Glory"
                ),
            },
        ],
        "jerseys": {
            "u13": [
                {
                    "id": "u13-home",
                    "title": "U13 Home Jersey 2026",
                    "subtitle": "Emerald Green & Titans Gold • Youth Fit",
                    "badge": "HOME KIT",
                    "image": _make_jersey_svg_uri("#145A3E", "#0B3B28", "#C9A227", "U13 SQUAD", "HOME KIT", "7"),
                },
                {
                    "id": "u13-away",
                    "title": "U13 Away Jersey 2026",
                    "subtitle": "Ivory White & Forest Trim • Matchday Away",
                    "badge": "AWAY KIT",
                    "image": _make_jersey_svg_uri("#EAE6D8", "#C9C3B0", "#0F3D2E", "U13 SQUAD", "AWAY KIT", "10"),
                },
                {
                    "id": "u13-third",
                    "title": "U13 Third Kit 2026",
                    "subtitle": "Royal Blue & Gold Crest • Technical Mesh",
                    "badge": "THIRD KIT",
                    "image": _make_jersey_svg_uri("#1E4E79", "#12314D", "#F4C542", "U13 SQUAD", "THIRD KIT", "14"),
                },
                {
                    "id": "u13-gk",
                    "title": "U13 Goalkeeper Pro Kit",
                    "subtitle": "Solar Yellow & Dark Pine • Shot-Stopper",
                    "badge": "GK KIT",
                    "image": _make_jersey_svg_uri("#E6B800", "#8A6D00", "#08231B", "U13 SQUAD", "GK KIT", "1"),
                },
            ],
            "u15": [
                {
                    "id": "u15-home",
                    "title": "U15 Home Jersey 2026",
                    "subtitle": "Titans Deep Green & Championship Gold",
                    "badge": "HOME KIT",
                    "image": _make_jersey_svg_uri("#0F4C35", "#082B1E", "#C9A227", "U15 SQUAD", "HOME KIT", "9"),
                },
                {
                    "id": "u15-away",
                    "title": "U15 Away Jersey 2026",
                    "subtitle": "Crimson Red & Gold Trim • Junior Titans",
                    "badge": "AWAY KIT",
                    "image": _make_jersey_svg_uri("#8F241E", "#591410", "#F4C542", "U15 SQUAD", "AWAY KIT", "11"),
                },
                {
                    "id": "u15-third",
                    "title": "U15 Third Kit 2026",
                    "subtitle": "Midnight Onyx & Gold Edition",
                    "badge": "THIRD KIT",
                    "image": _make_jersey_svg_uri("#1C2826", "#0E1514", "#C9A227", "U15 SQUAD", "THIRD KIT", "8"),
                },
                {
                    "id": "u15-gk",
                    "title": "U15 Goalkeeper Pro Kit",
                    "subtitle": "Electric Orange & Dark Pine • Junior GK",
                    "badge": "GK KIT",
                    "image": _make_jersey_svg_uri("#D35400", "#7E3200", "#F4F2EA", "U15 SQUAD", "GK KIT", "1"),
                },
            ],
            "u17": [
                {
                    "id": "u17-home",
                    "title": "U17 Home Jersey 2026",
                    "subtitle": "Pro-Cut Emerald & Gold • Elite Youth",
                    "badge": "HOME KIT",
                    "image": _make_jersey_svg_uri("#125E42", "#093524", "#C9A227", "U17 SQUAD", "HOME KIT", "10"),
                },
                {
                    "id": "u17-away",
                    "title": "U17 Away Jersey 2026",
                    "subtitle": "Gold Bullion & Dark Pine Trim",
                    "badge": "AWAY KIT",
                    "image": _make_jersey_svg_uri("#C9A227", "#9A7814", "#0B2E23", "U17 SQUAD", "AWAY KIT", "17"),
                },
                {
                    "id": "u17-third",
                    "title": "U17 Third Kit 2026",
                    "subtitle": "Obsidian Navy & Gold Trim • Elite Match",
                    "badge": "THIRD KIT",
                    "image": _make_jersey_svg_uri("#162B4D", "#0A172B", "#F4C542", "U17 SQUAD", "THIRD KIT", "14"),
                },
                {
                    "id": "u17-gk",
                    "title": "U17 Goalkeeper Pro Kit",
                    "subtitle": "Electric Teal & Gold • Shot-Stopper Edition",
                    "badge": "GK KIT",
                    "image": _make_jersey_svg_uri("#0E6BA8", "#074066", "#F4C542", "U17 SQUAD", "GK KIT", "1"),
                },
            ],
            "wazae": [
                {
                    "id": "wazae-home",
                    "title": "Wazae Classic Home Jersey",
                    "subtitle": "Heritage Green & Gold • Veterans Collector Edition",
                    "badge": "HOME KIT",
                    "image": _make_jersey_svg_uri("#0B3B2C", "#051F17", "#C9A227", "WAZAE LEGENDS", "HOME KIT", "6"),
                },
                {
                    "id": "wazae-away",
                    "title": "Wazae Legends Away Jersey",
                    "subtitle": "Burgundy Maroon & Gold Crest • Sunday Special",
                    "badge": "AWAY KIT",
                    "image": _make_jersey_svg_uri("#6E1E2A", "#421018", "#C9A227", "WAZAE LEGENDS", "AWAY KIT", "4"),
                },
                {
                    "id": "wazae-third",
                    "title": "Wazae Founders Gold Edition",
                    "subtitle": "Cream & Gold • Honouring Club Founders",
                    "badge": "THIRD KIT",
                    "image": _make_jersey_svg_uri("#F2EFE4", "#D6D0BE", "#8C6D14", "WAZAE LEGENDS", "THIRD KIT", "5"),
                },
                {
                    "id": "wazae-gk",
                    "title": "Wazae Veteran Goalkeeper Kit",
                    "subtitle": "Charcoal Black & Neon Lime • Veteran Wall",
                    "badge": "GK KIT",
                    "image": _make_jersey_svg_uri("#1C1E21", "#0D0E10", "#5CD685", "WAZAE LEGENDS", "GK KIT", "1"),
                },
            ],
        },
        "upcoming_fixtures": [],
    }


def save_data_url_image_to_media(image_str):
    """
    If `image_str` is a raster base64 data URL (e.g. data:image/jpeg;base64,...),
    saves the decoded bytes to MEDIA_ROOT/homepage/<sha256>.<ext> and returns
    the clean `/media/homepage/<sha256>.<ext>` URL.
    Also converts raw `data:image/svg+xml;utf8,<svg...` strings to base64 SVG data URLs
    so WAFs never block `<svg` tags in JSON POST bodies.
    Falls back to returning `image_str` unchanged if not a data URL or on write error.
    """
    import base64
    import hashlib
    import urllib.parse
    from django.conf import settings

    if not image_str or not isinstance(image_str, str):
        return image_str

    s = image_str.strip()
    if s.startswith("data:image/svg+xml;utf8,"):
        try:
            raw_svg = urllib.parse.unquote(s[len("data:image/svg+xml;utf8,"):])
            b64_svg = base64.b64encode(raw_svg.encode("utf-8")).decode("ascii")
            return f"data:image/svg+xml;base64,{b64_svg}"
        except Exception:
            return s

    m = re.match(r"^data:image/(jpeg|jpg|png|webp|gif);base64,(.+)$", s, re.IGNORECASE | re.DOTALL)
    if not m:
        return s

    ext = m.group(1).lower()
    if ext == "jpeg":
        ext = "jpg"
    b64_payload = m.group(2).strip()
    try:
        raw_bytes = base64.b64decode(b64_payload)
        if not raw_bytes:
            return s
        digest = hashlib.sha256(raw_bytes).hexdigest()[:24]
        filename = f"{digest}.{ext}"
        media_dir = settings.MEDIA_ROOT / "homepage"
        media_dir.mkdir(parents=True, exist_ok=True)
        target_path = media_dir / filename
        if not target_path.exists():
            target_path.write_bytes(raw_bytes)
        media_url = (getattr(settings, "MEDIA_URL", "/media/") or "/media/").rstrip("/")
        return f"{media_url}/homepage/{filename}"
    except Exception:
        return s


def persist_homepage_images_to_media(homepage_dict):
    """
    Normalizes a homepage dictionary (`carousel`, `jerseys`, `upcoming_fixtures`),
    persisting any embedded base64 raster images to `/media/homepage/` files.
    """
    if not isinstance(homepage_dict, dict):
        return homepage_dict

    cleaned = dict(homepage_dict)
    if isinstance(cleaned.get("carousel"), list):
        new_carousel = []
        for slide in cleaned["carousel"]:
            if isinstance(slide, dict):
                s_copy = dict(slide)
                if "image" in s_copy:
                    s_copy["image"] = save_data_url_image_to_media(s_copy["image"])
                new_carousel.append(s_copy)
        cleaned["carousel"] = new_carousel

    if isinstance(cleaned.get("jerseys"), dict):
        new_jerseys = {}
        for grp_key, items in cleaned["jerseys"].items():
            if isinstance(items, list):
                new_items = []
                for item in items:
                    if isinstance(item, dict):
                        i_copy = dict(item)
                        if "image" in i_copy:
                            i_copy["image"] = save_data_url_image_to_media(i_copy["image"])
                        new_items.append(i_copy)
                new_jerseys[grp_key] = new_items
            else:
                new_jerseys[grp_key] = items
        cleaned["jerseys"] = new_jerseys

    return cleaned


@transaction.atomic
def import_state_to_db(state_dict, soft_delete_missing=True):
    """
    Imports a full state dict (categories, activeCategory, homepage, etc.) into Django models.
    """
    if not state_dict or "categories" not in state_dict:
        return

    settings, _ = GlobalSettings.objects.get_or_create(id=1)
    if "activeCategory" in state_dict:
        settings.active_category_key = state_dict["activeCategory"]
    elif not settings.active_category_key:
        settings.active_category_key = "open"

    if "homepage" in state_dict and isinstance(state_dict["homepage"], dict):
        settings.homepage_data = persist_homepage_images_to_media(state_dict["homepage"])
    elif not settings.homepage_data:
        settings.homepage_data = build_default_homepage_data()
    settings.save()

    categories_data = state_dict.get("categories", {})
    deleted_categories_data = state_dict.get("deletedCategories", {})
    permanently_deleted_keys = set(state_dict.get("permanentlyDeletedKeys", []) or [])

    if permanently_deleted_keys:
        Category.objects.filter(key__in=permanently_deleted_keys).delete()

    combined_items = []
    for cat_key, cat_data in categories_data.items():
        if cat_key in permanently_deleted_keys:
            continue
        is_del = bool(cat_data.get("isDeleted", False))
        combined_items.append((cat_key, cat_data, is_del))

    for cat_key, cat_data in deleted_categories_data.items():
        if cat_key in permanently_deleted_keys or cat_key in categories_data:
            continue
        combined_items.append((cat_key, cat_data, True))

    active_keys_in_payload = {k for k, _, is_del in combined_items if not is_del}
    explicit_deleted_keys = {k for k, _, is_del in combined_items if is_del}

    # Any existing active DB category that was removed from categories_data (and not permanently deleted)
    # is soft-deleted automatically so tournament/league/cup data is never lost accidentally.
    if soft_delete_missing and active_keys_in_payload:
        Category.objects.filter(is_deleted=False, is_ended=False).exclude(
            key__in=active_keys_in_payload | permanently_deleted_keys
        ).update(is_deleted=True, deleted_at=timezone.now())

    for cat_key, cat_data, is_del in combined_items:
        mode = cat_data.get("mode", "league")
        format_choice = cat_data.get("format", "double")
        label = cat_data.get("label", cat_key.capitalize())
        note = cat_data.get("note", "")

        schedule_dict = cat_data.get("schedule", {})
        schedule_time = schedule_dict.get("time", "18:00")
        schedule_days = schedule_dict.get("days", {3: 1, 4: 1, 5: 1, 6: 1})
        mpd = schedule_dict.get("matches_per_day") or schedule_dict.get("fixtures_per_day")
        start_date = schedule_dict.get("startDate") or schedule_dict.get("start_date")
        venue = schedule_dict.get("venue") or "Thoome Pri."
        schedule_days_data = {"days": schedule_days, "venue": venue}
        if mpd is not None:
            schedule_days_data["matches_per_day"] = int(mpd)
        if start_date:
            schedule_days_data["startDate"] = str(start_date)
            schedule_days_data["start_date"] = str(start_date)

        existing_cat = Category.objects.filter(key=cat_key).first()
        duty_roster = cat_data.get("dutyRoster") or ((existing_cat.schedule_days or {}).get("duty_roster", {}) if existing_cat else {})
        if duty_roster:
            schedule_days_data["duty_roster"] = duty_roster
        schedule_days = schedule_days_data

        voting_cfg = cat_data.get("votingConfig") or {}
        voting_team_size = int(
            voting_cfg.get("team_size", existing_cat.voting_team_size if existing_cat else 6)
        )
        voting_max_picks = int(
            voting_cfg.get("max_picks_per_position", existing_cat.voting_max_picks if existing_cat else 2)
        )
        voting_include_gk = bool(
            voting_cfg.get("include_gk", existing_cat.voting_include_gk if existing_cat else True)
        )

        del_at = None
        if is_del:
            del_at = existing_cat.deleted_at if (existing_cat and existing_cat.deleted_at) else timezone.now()

        is_ended = bool(cat_data.get("isEnded", existing_cat.is_ended if existing_cat else False))
        ended_at = None
        if is_ended:
            ended_at = existing_cat.ended_at if (existing_cat and existing_cat.ended_at) else timezone.now()
        champion_team = cat_data.get("championTeam", existing_cat.champion_team if existing_cat else "")
        runner_up_team = cat_data.get("runnerUpTeam", existing_cat.runner_up_team if existing_cat else "")

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
                "voting_team_size": max(1, voting_team_size),
                "voting_max_picks": max(1, voting_max_picks),
                "voting_include_gk": voting_include_gk,
                "is_ended": is_ended,
                "ended_at": ended_at,
                "champion_team": champion_team,
                "runner_up_team": runner_up_team,
                "is_deleted": is_del,
                "deleted_at": del_at,
            },
        )

        # Referees
        category.referees.all().delete()
        seen_refs = set()
        for ref_name in cat_data.get("referees", []):
            clean_ref = str(ref_name or "").strip()
            if clean_ref and clean_ref not in seen_refs:
                seen_refs.add(clean_ref)
                Referee.objects.create(category=category, name=clean_ref)

        # Teams & Players
        teams_map = {}  # team_id -> Team instance
        players_map = {}  # (team_id, player_id) -> Player instance

        existing_team_ids = set()
        all_category_player_ids = set()
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
            db_existing_ids = set(
                Player.objects.filter(team=team_obj).values_list("player_id", flat=True)
            )
            for p_info in t_info.get("players", []):
                is_unk = bool(p_info.get("unknown", False))
                p_id = str(p_info.get("id") or p_info.get("permanentId") or "").strip()
                if not p_id:
                    prefix = team_id.upper()
                    if is_unk:
                        p_id = f"{prefix}-UNK"
                    else:
                        seq = 1
                        while f"{prefix}-P{seq}" in db_existing_ids or f"{prefix}-P{seq}" in existing_player_ids:
                            seq += 1
                        p_id = f"{prefix}-P{seq}"
                existing_player_ids.add(p_id)
                db_existing_ids.add(p_id)
                all_category_player_ids.add(p_id)

                existing_p = Player.objects.filter(team__category=category, player_id=p_id).first()
                p_name = p_info.get("name", p_id)
                default_uname = slugify(p_name).replace("-", "_") if not is_unk else ""
                p_username = (
                    p_info.get("username")
                    or (existing_p.username if existing_p and existing_p.username else default_uname)
                )
                if existing_p:
                    p_password = existing_p.password
                    p_must_change = existing_p.must_change_password
                    p_temp_code = existing_p.temp_code
                    p_temp_code_created_at = getattr(existing_p, "temp_code_created_at", None)
                else:
                    from django.contrib.auth.hashers import make_password
                    raw_pw = p_info.get("password")
                    if raw_pw and str(raw_pw).strip() and str(raw_pw).strip() != "titans2026":
                        p_password = (
                            raw_pw
                            if (
                                str(raw_pw).startswith("!")
                                or str(raw_pw).startswith("pbkdf2_")
                                or str(raw_pw).startswith("argon2")
                                or str(raw_pw).startswith("bcrypt")
                            )
                            else make_password(raw_pw)
                        )
                        p_must_change = bool(p_info.get("mustChangePassword") or p_info.get("must_change_password", False))
                    else:
                        p_password = make_password(None)
                        p_must_change = True
                    p_temp_code = str(p_info.get("tempCode") or p_info.get("temp_code", ""))
                    p_temp_code_created_at = None

                raw_j = p_info.get("jerseyNumber") if p_info.get("jerseyNumber") is not None else p_info.get("jersey_number")
                p_jersey = int(raw_j) if (raw_j is not None and str(raw_j).strip().isdigit()) else (existing_p.jersey_number if existing_p else None)
                p_is_active = bool(p_info.get("isActive", p_info.get("is_active", existing_p.is_active if existing_p else True)))

                defaults_dict = {
                    "name": p_name,
                    "username": p_username,
                    "password": p_password,
                    "position": p_info.get("position", ""),
                    "is_unknown": is_unk,
                    "jersey_number": p_jersey,
                    "must_change_password": p_must_change,
                    "temp_code": p_temp_code,
                    "temp_code_created_at": p_temp_code_created_at,
                    "is_active": p_is_active,
                }
                if existing_p:
                    for k_f, v_f in defaults_dict.items():
                        setattr(existing_p, k_f, v_f)
                    existing_p.team = team_obj
                    existing_p.save()
                    player_obj = existing_p
                else:
                    player_obj = Player.objects.create(
                        team=team_obj,
                        player_id=p_id,
                        **defaults_dict,
                    )
                players_map[(team_id, p_id)] = player_obj

        # Clean up players removed from this category
        Player.objects.filter(team__category=category).exclude(player_id__in=all_category_player_ids).delete()
        category.teams.exclude(team_id__in=existing_team_ids).delete()

        # Fixtures & Events
        raw_fixtures = []
        if mode == "league":
            for seq_i, f in enumerate(cat_data.get("fixtures", []), start=1):
                raw_fixtures.append((f, "league", "", seq_i, None))
        else:
            # Group fixtures
            group_fixtures = cat_data.get("groupFixtures", {})
            for letter, flist in group_fixtures.items():
                for f in flist:
                    raw_fixtures.append((f, "group", letter, None, None))
            # Knockout round ties -> also sync to Fixture rows for Match Sheet / CSV / H2H
            rounds_list = cat_data.get("rounds") or []
            for r_idx, round_ties in enumerate(rounds_list):
                for t_idx, tie in enumerate(round_ties or []):
                    if not tie:
                        continue
                    match_obj = tie.get("match") or {}
                    pen_obj = tie.get("pen") or {}
                    pens = None
                    if pen_obj.get("h", "") != "" and pen_obj.get("a", "") != "":
                        try:
                            pens = [int(pen_obj["h"]), int(pen_obj["a"])]
                        except (ValueError, TypeError):
                            pens = None
                    tie_referee = tie.get("referee") or match_obj.get("referee", "")
                    tie_fixture = {
                        "id": tie.get("id") or f"KO-R{r_idx+1}-T{t_idx+1}",
                        "date": tie.get("date", "TBD"),
                        "home": tie.get("home"),
                        "away": tie.get("away"),
                        "played": bool(match_obj.get("played", False)),
                        "walkover": match_obj.get("walkover"),
                        "events": match_obj.get("events", []),
                        "referee": tie_referee,
                        "pens": pens,
                    }
                    raw_fixtures.append((tie_fixture, "knockout", "", r_idx, t_idx))

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

            events = f_data.get("events", [])
            has_events = bool(events and len(events) > 0)
            is_fixture_played = bool(f_data.get("played", False)) or has_events or bool(walkover_team)

            existing_fix = Fixture.objects.filter(category=category, fixture_id=f_id).first()
            incoming_ref = f_data.get("referee", "")
            if existing_fix and (existing_fix.played or existing_fix.events.exists() or existing_fix.walkover_winner_id) and existing_fix.referee and not incoming_ref:
                incoming_ref = existing_fix.referee

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
                    "played": is_fixture_played,
                    "walkover_winner": walkover_team,
                    "home_pens": home_pens,
                    "away_pens": away_pens,
                    "referee": incoming_ref,
                    "report": f_data.get("report") or (existing_fix.report if (existing_fix and existing_fix.report) else {}),
                },
            )

            # Recreate events
            fixture_obj.events.all().delete()

            f_home_id = f_data.get("home")
            f_away_id = f_data.get("away")
            for order, ev in enumerate(events):
                ev_team_id = ev.get("teamId")
                ev_team = teams_map.get(ev_team_id)
                if not ev_team:
                    continue
                ev_player = players_map.get((ev_team_id, ev.get("playerId")))
                if not ev_player and ev.get("playerId"):
                    for (t_k, p_k), p_inst in players_map.items():
                        if p_k == ev.get("playerId"):
                            ev_player = p_inst
                            break

                assist_id = ev.get("assistPlayerId")
                assist_player = None
                if assist_id:
                    assist_player = players_map.get((ev_team_id, assist_id))
                    if not assist_player:
                        for (t_k, p_k), p_inst in players_map.items():
                            if p_k == assist_id:
                                assist_player = p_inst
                                break

                ev_type = ev.get("type", "goal")
                is_interf = bool(
                    ev.get("interference", False)
                    or (
                        ev_type in ("yellow", "red")
                        and f_home_id
                        and f_away_id
                        and ev_team_id not in (f_home_id, f_away_id)
                    )
                )

                MatchEvent.objects.create(
                    fixture=fixture_obj,
                    team=ev_team,
                    player=ev_player,
                    event_type=ev_type,
                    assist_player=assist_player,
                    is_penalty=bool(ev.get("penalty", False)),
                    is_interference=is_interf,
                    order=order,
                )

        category.fixtures.exclude(fixture_id__in=seen_fixture_ids).delete()
        if category.teams.exists():
            ensure_player_default_positions(category)
            get_or_create_active_voting_round(category)

def reorganize_category_unplayed_fixtures(category, newly_added_team_id=None):
    """
    Reorganizes all unplayed fixtures for a league category so that:
    1. Played fixtures remain 100% frozen and intact.
    2. Any team (especially a newly added team or trailing teams with fewer games)
       plays catch-up matches immediately in Round 1.
    3. Invariant: No team plays an additional match (N+1) before the new team
       (and every other team in the league) has played match N.
    4. Rounds are strictly partitioned so each team plays exactly once per round,
       avoiding back-to-back fatigue.
    5. Unplayed fixtures take chronological upcoming date slots and are sequentially renumbered.
    """
    if isinstance(category, str):
        category = Category.objects.get(key=category)
    if category.mode != "league":
        return 0

    fixtures = list(category.fixtures.filter(phase="league"))
    fixtures.sort(key=fixture_sort_key)
    played_fixtures = [f for f in fixtures if f.played or f.events.exists() or f.walkover_winner_id]
    for idx, pf in enumerate(played_fixtures, start=1):
        if pf.round_index != idx:
            pf.round_index = idx
            pf.save(update_fields=["round_index"])
    unplayed_fixtures = [f for f in fixtures if not (f.played or f.events.exists() or f.walkover_winner_id)]

    if not unplayed_fixtures:
        return 0

    teams = list(category.teams.all())
    team_ids = [t.id for t in teams]
    if len(team_ids) < 2:
        return 0

    # Count played games per team and track head-to-head encounters
    played_counts = {t_id: 0 for t_id in team_ids}
    h2h_counts = {}

    def get_h2h_key(u, v):
        return (u, v) if str(u) < str(v) else (v, u)

    for f in played_fixtures:
        if f.home_team_id in played_counts:
            played_counts[f.home_team_id] += 1
        if f.away_team_id in played_counts:
            played_counts[f.away_team_id] += 1
        if f.home_team_id and f.away_team_id:
            k = get_h2h_key(f.home_team_id, f.away_team_id)
            h2h_counts[k] = h2h_counts.get(k, 0) + 1

    def can_teams_meet(h_id, a_id):
        """
        Invariant: Two teams that have played against each other k times (k >= 1)
        should not meet again (k + 1) until both teams have played all other teams
        in the league at least k times.
        """
        if not h_id or not a_id or h_id == a_id:
            return True
        k = h2h_counts.get(get_h2h_key(h_id, a_id), 0)
        if k == 0:
            return True
        for other_id in team_ids:
            if other_id != h_id and h2h_counts.get(get_h2h_key(h_id, other_id), 0) < k:
                return False
            if other_id != a_id and h2h_counts.get(get_h2h_key(a_id, other_id), 0) < k:
                return False
        return True

    scheduled_counts = dict(played_counts)
    unplayed_pool = list(unplayed_fixtures)
    reordered_unplayed = []
    last_played_slot = {t_id: -999 for t_id in team_ids}

    # Populate recent slots for played fixtures to ensure proper rest spacing
    for idx, f in enumerate(played_fixtures):
        pseudo_slot = idx - len(played_fixtures)
        if f.home_team_id:
            last_played_slot[f.home_team_id] = pseudo_slot
        if f.away_team_id:
            last_played_slot[f.away_team_id] = pseudo_slot

    # Collect available unplayed date slots sorted chronologically by date
    from .models import parse_fixture_date_key
    unplayed_dates = sorted([f.date for f in unplayed_fixtures], key=parse_fixture_date_key)

    target_new_id = None
    if newly_added_team_id:
        target_new_id = getattr(newly_added_team_id, "id", newly_added_team_id)
        if isinstance(target_new_id, str):
            t_obj = category.teams.filter(Q(team_id=target_new_id) | Q(name=target_new_id)).first()
            if t_obj:
                target_new_id = t_obj.id

    round_teams_scheduled = set()
    slot = 0

    while unplayed_pool:
        min_games = min(scheduled_counts.values()) if scheduled_counts else 0
        max_games = max(scheduled_counts.values()) if scheduled_counts else 0

        best_idx = -1
        best_score = -float("inf")

        if min_games < max_games:
            # CATCH-UP PHASE:
            # Only trailing teams (scheduled_counts == min_games) are eligible to play!
            trailing_teams = {t_id for t_id, cnt in scheduled_counts.items() if cnt == min_games}

            for i, m in enumerate(unplayed_pool):
                h_id = m.home_team_id
                a_id = m.away_team_id
                h_trail = h_id in trailing_teams
                a_trail = a_id in trailing_teams

                # Invariant: NEVER schedule a match between two non-trailing teams while teams are behind!
                if not h_trail and not a_trail:
                    continue

                # Invariant: Two teams that have met k times cannot meet again until they have played all other teams
                if not can_teams_meet(h_id, a_id):
                    continue

                score = 0
                if h_trail and a_trail:
                    score += 50000  # Both trailing: ideal catch-up match!
                else:
                    # One trailing, one not trailing
                    score += 1000
                    if len(trailing_teams) >= 2:
                        score -= 30000

                if target_new_id and (h_id == target_new_id or a_id == target_new_id):
                    score += 15000  # Priority in earliest catch-up slot

                k = get_h2h_key(h_id, a_id)
                if h2h_counts.get(k, 0) > 0:
                    score -= 20000  # Prefer fresh matchups

                if last_played_slot.get(h_id) == slot - 1 or last_played_slot.get(a_id) == slot - 1:
                    score -= 2000

                if score > best_score:
                    best_score = score
                    best_idx = i

            if best_idx == -1:
                # Fallback within catch-up phase: any trailing match or match that satisfies can_teams_meet
                for i, m in enumerate(unplayed_pool):
                    h_id = m.home_team_id
                    a_id = m.away_team_id
                    if not can_teams_meet(h_id, a_id):
                        continue
                    sum_count = scheduled_counts.get(h_id, 0) + scheduled_counts.get(a_id, 0)
                    score = 1000 - sum_count * 50
                    if score > best_score:
                        best_score = score
                        best_idx = i

        else:
            # NORMAL ROUND PHASE:
            # Each team plays exactly once per round before ANY team plays in the next round!
            if len(round_teams_scheduled) >= len(team_ids) - (len(team_ids) % 2):
                round_teams_scheduled.clear()

            current_target = min_games + 1

            for i, m in enumerate(unplayed_pool):
                h_id = m.home_team_id
                a_id = m.away_team_id
                h_in = h_id in round_teams_scheduled
                a_in = a_id in round_teams_scheduled

                # In this round, neither team can have already been scheduled
                if h_in or a_in:
                    continue

                # Strict round cap: neither team can exceed the current round target
                if scheduled_counts.get(h_id, 0) >= current_target or scheduled_counts.get(a_id, 0) >= current_target:
                    continue

                # Invariant: Two teams that have met k times cannot meet again until they have played all other teams
                if not can_teams_meet(h_id, a_id):
                    continue

                score = 2000

                # Fresh matchup preference
                k = get_h2h_key(h_id, a_id)
                if h2h_counts.get(k, 0) == 0:
                    score += 5000
                else:
                    score -= 10000

                # Fatigue spacing: prefer teams that have rested longer
                gap_h = slot - last_played_slot.get(h_id, -999)
                gap_a = slot - last_played_slot.get(a_id, -999)
                score += min(gap_h, gap_a) * 100

                if gap_h <= 1 or gap_a <= 1:
                    score -= 5000
                if gap_h <= 2 or gap_a <= 2:
                    score -= 1000

                if score > best_score:
                    best_score = score
                    best_idx = i

            if best_idx == -1:
                # If no strictly disjoint match found under current target, reset round set and find match with minimum sum count satisfying can_teams_meet
                round_teams_scheduled.clear()
                for i, m in enumerate(unplayed_pool):
                    h_id = m.home_team_id
                    a_id = m.away_team_id
                    if not can_teams_meet(h_id, a_id):
                        continue
                    sum_count = scheduled_counts.get(h_id, 0) + scheduled_counts.get(a_id, 0)
                    score = 1000 - sum_count * 50
                    gap_h = slot - last_played_slot.get(h_id, -999)
                    gap_a = slot - last_played_slot.get(a_id, -999)
                    score += min(gap_h, gap_a) * 10
                    if score > best_score:
                        best_score = score
                        best_idx = i

        if best_idx == -1:
            for i, m in enumerate(unplayed_pool):
                if can_teams_meet(m.home_team_id, m.away_team_id):
                    best_idx = i
                    break

        if best_idx == -1:
            best_idx = 0

        chosen_match = unplayed_pool.pop(best_idx)
        slot_date = unplayed_dates[slot] if slot < len(unplayed_dates) else "Upcoming Weekend · 16:00"

        chosen_match.date = slot_date
        scheduled_counts[chosen_match.home_team_id] = scheduled_counts.get(chosen_match.home_team_id, 0) + 1
        scheduled_counts[chosen_match.away_team_id] = scheduled_counts.get(chosen_match.away_team_id, 0) + 1
        round_teams_scheduled.add(chosen_match.home_team_id)
        round_teams_scheduled.add(chosen_match.away_team_id)
        last_played_slot[chosen_match.home_team_id] = slot
        last_played_slot[chosen_match.away_team_id] = slot

        k = get_h2h_key(chosen_match.home_team_id, chosen_match.away_team_id)
        h2h_counts[k] = h2h_counts.get(k, 0) + 1

        reordered_unplayed.append(chosen_match)
        slot += 1

    # Renumber sequentially after played fixtures
    max_played_seq = 0
    prefix = "F"
    for f in played_fixtures:
        m_real = re.match(r"REAL-F(\d+)", str(f.fixture_id or ""), re.IGNORECASE)
        if m_real:
            prefix = "REAL-F"
            num = int(m_real.group(1))
            if num > max_played_seq:
                max_played_seq = num
        else:
            m_f = re.match(r"^F(\d+)$", str(f.fixture_id or ""), re.IGNORECASE)
            if m_f:
                num = int(m_f.group(1))
                if num > max_played_seq:
                    max_played_seq = num

    seq = max_played_seq
    with transaction.atomic():
        # Pass 1: Set temporary fixture IDs to prevent unique constraint collisions
        for idx, m in enumerate(reordered_unplayed):
            m.fixture_id = f"TMP-REORD-{m.id}-{idx}"
            m.save(update_fields=["fixture_id"])

        # Pass 2: Set final sequential fixture IDs and round_index
        for m in reordered_unplayed:
            seq += 1
            m.fixture_id = f"{prefix}{seq}"
            m.round_index = seq
            m.save(update_fields=["date", "fixture_id", "round_index"])

    return len(reordered_unplayed)


def ensure_archived_open_season():
    """
    Ensures that the authentic 2026 Ruiru Titans Open League Season is preserved
    in the database as an archived/ended competition (key='open_2026').
    Has all 20 played fixtures, real player events (goals, assists, cards),
    standings, and Mancheli confirmed as League Champions.
    """
    open_season = Category.objects.filter(key="open_2026").first()
    if not open_season or open_season.fixtures.count() < 20:
        data = build_real_open_season_dict()
        data["label"] = "Open League (August 2026 Season)"
        data["isEnded"] = True
        data["championTeam"] = "Mancheli"
        data["runnerUpTeam"] = "Super Strikers"
        import_state_to_db({"categories": {"open_2026": data}}, soft_delete_missing=False)
        cat = Category.objects.filter(key="open_2026").first()
        if cat:
            cat.label = "Open League (August 2026 Season)"
            cat.is_ended = True
            cat.champion_team = "Mancheli"
            cat.runner_up_team = "Super Strikers"
            if not cat.ended_at:
                cat.ended_at = timezone.now()
            cat.save(update_fields=["label", "is_ended", "champion_team", "runner_up_team", "ended_at"])


def ensure_default_open_category():
    """
    Ensures that an active 'open' category exists ONLY when no categories exist at all in the database.
    """
    if Category.objects.exists():
        return
    core_teams = [
        {"id": "MAN", "name": "Mancheli", "color": "#C9A227", "players": []},
        {"id": "SS", "name": "Super Strikers", "color": "#B23A2E", "players": []},
        {"id": "RAN", "name": "Rangers", "color": "#3F7A4E", "players": []},
        {"id": "MAS", "name": "Masters", "color": "#D97B29", "players": []},
        {"id": "OXF", "name": "Oxford", "color": "#2E5A8F", "players": []},
    ]
    import_state_to_db({
        "categories": {
            "open": {
                "label": "Open",
                "mode": "league",
                "format": "double",
                "teams": core_teams,
                "fixtures": [],
                "schedule": {"time": "18:00", "days": {3: 1, 4: 1, 5: 1, 6: 1}},
                "referees": ["Coach Ref", "Main Ref", "Assistant Ref"],
                "votingConfig": {"team_size": 6, "max_picks_per_position": 2, "include_gk": False},
            }
        },
        "activeCategory": "open",
    }, soft_delete_missing=False)


def export_state_from_db():
    """
    Exports full database state to a JSON-ready dict (including active categories and soft-deleted categories).
    """
    if not Category.objects.exists():
        ensure_archived_open_season()
        ensure_default_open_category()
    settings, _ = GlobalSettings.objects.get_or_create(id=1)
    active_cat_key = settings.active_category_key if settings else None

    if not settings.homepage_data:
        settings.homepage_data = build_default_homepage_data()
        settings.save(update_fields=["homepage_data"])
    else:
        normalized_hp = persist_homepage_images_to_media(settings.homepage_data)
        if normalized_hp != settings.homepage_data:
            settings.homepage_data = normalized_hp
            settings.save(update_fields=["homepage_data"])

    def _is_test_cat(c):
        k = (c.key or "").lower()
        lbl = (c.label or "").lower()
        return "test-league" in k or "test_league" in k or k == "test" or "test league" in lbl or "test 2026" in lbl

    categories = {}
    for cat in Category.objects.filter(is_deleted=False).order_by("key"):
        if _is_test_cat(cat):
            continue
        categories[cat.key] = cat.to_state_dict()

    deleted_categories = {}
    for cat in Category.objects.filter(is_deleted=True).order_by("-deleted_at", "key"):
        if _is_test_cat(cat):
            continue
        deleted_categories[cat.key] = cat.to_state_dict()

    if categories:
        if not active_cat_key or active_cat_key not in categories or categories.get(active_cat_key, {}).get("isEnded"):
            # Select first active non-ended category
            active_cat_key = next((k for k, c in categories.items() if not c.get("isEnded")), next(iter(categories.keys())))
    else:
        active_cat_key = "open"

    return {
        "categories": categories,
        "deletedCategories": deleted_categories,
        "activeCategory": active_cat_key,
        "homepage": settings.homepage_data,
    }


def compute_h2h_comparison(category, team1_id, team2_id):
    """
    Computes comprehensive Head-to-Head (H2H) records and form comparison
    between team1 and team2 in the specified category.
    """
    team1 = category.teams.filter(team_id=team1_id).first()
    team2 = category.teams.filter(team_id=team2_id).first()

    if not team1 or not team2:
        return None

    all_fixtures = list(category.fixtures.all())
    all_fixtures.sort(key=fixture_sort_key)

    # 1. Past H2H encounters
    h2h_matches = []
    t1_wins = 0
    t2_wins = 0
    draws = 0
    t1_goals = 0
    t2_goals = 0

    for f in all_fixtures:
        h_id = f.home_team.team_id if f.home_team else ""
        a_id = f.away_team.team_id if f.away_team else ""

        is_h2h = (h_id == team1_id and a_id == team2_id) or (h_id == team2_id and a_id == team1_id)
        if not is_h2h:
            continue

        hs, as_score = f.score
        is_played = bool(f.played or (f.walkover_winner is not None) or f.events.exists())

        match_info = {
            "fixture_id": f.fixture_id,
            "date": f.date,
            "phase": f.get_phase_display(),
            "home_id": h_id,
            "home_name": f.home_team.name if f.home_team else "TBD",
            "away_id": a_id,
            "away_name": f.away_team.name if f.away_team else "TBD",
            "home_score": hs,
            "away_score": as_score,
            "played": is_played,
            "walkover": f.walkover_winner.team_id if f.walkover_winner else None,
        }

        if is_played:
            if h_id == team1_id:
                t1_g, t2_g = hs, as_score
            else:
                t1_g, t2_g = as_score, hs

            t1_goals += t1_g
            t2_goals += t2_g

            if t1_g > t2_g:
                t1_wins += 1
                match_info["winner"] = team1_id
            elif t2_g > t1_g:
                t2_wins += 1
                match_info["winner"] = team2_id
            else:
                draws += 1
                match_info["winner"] = "draw"

        h2h_matches.append(match_info)

    # 2. Form (last 5 matches for each team across the tournament)
    def get_team_form(t_id):
        team_fixtures = [
            f for f in all_fixtures
            if (f.played or f.walkover_winner or f.events.exists()) and (
                (f.home_team and f.home_team.team_id == t_id) or
                (f.away_team and f.away_team.team_id == t_id)
            )
        ]
        # Sort by fixture id or sequence
        recent = team_fixtures[-5:] if len(team_fixtures) >= 5 else team_fixtures
        form_list = []
        for f in reversed(recent):
            hs, as_score = f.score
            is_home = (f.home_team and f.home_team.team_id == t_id)
            opp = f.away_team if is_home else f.home_team
            team_g = hs if is_home else as_score
            opp_g = as_score if is_home else hs

            if team_g > opp_g:
                result = "W"
            elif team_g < opp_g:
                result = "L"
            else:
                result = "D"

            form_list.append({
                "fixture_id": f.fixture_id,
                "date": f.date,
                "result": result,
                "score": f"{team_g}-{opp_g}",
                "is_home": is_home,
                "opponent_id": opp.team_id if opp else "TBD",
                "opponent_name": opp.name if opp else "TBD",
            })
        return form_list

    # 3. Full season stats comparison
    def get_team_season_stats(team_obj):
        t_id = team_obj.team_id
        matches = [
            f for f in all_fixtures
            if (f.played or f.walkover_winner or f.events.exists()) and (
                (f.home_team and f.home_team.team_id == t_id) or
                (f.away_team and f.away_team.team_id == t_id)
            )
        ]
        mp = len(matches)
        w, d, l, gf, ga, cs = 0, 0, 0, 0, 0, 0
        for f in matches:
            hs, as_score = f.score
            is_home = (f.home_team and f.home_team.team_id == t_id)
            tg = hs if is_home else as_score
            og = as_score if is_home else hs
            gf += tg
            ga += og
            if og == 0:
                cs += 1
            if tg > og:
                w += 1
            elif tg < og:
                l += 1
            else:
                d += 1

        yellows = MatchEvent.objects.filter(fixture__category=category, team=team_obj, event_type="yellow").count()
        reds = MatchEvent.objects.filter(fixture__category=category, team=team_obj, event_type="red").count()

        return {
            "id": t_id,
            "name": team_obj.name,
            "color": team_obj.color,
            "played": mp,
            "won": w,
            "drawn": d,
            "lost": l,
            "goals_for": gf,
            "goals_against": ga,
            "goal_diff": gf - ga,
            "points": (w * 3) + d,
            "clean_sheets": cs,
            "avg_goals": round(gf / mp, 1) if mp > 0 else 0.0,
            "yellow_cards": yellows,
            "red_cards": reds,
        }

    return {
        "team1": get_team_season_stats(team1),
        "team2": get_team_season_stats(team2),
        "h2h_summary": {
            "total_matches": len([m for m in h2h_matches if m["played"]]),
            "team1_wins": t1_wins,
            "team2_wins": t2_wins,
            "draws": draws,
            "team1_goals": t1_goals,
            "team2_goals": t2_goals,
        },
        "team1_form": get_team_form(team1_id),
        "team2_form": get_team_form(team2_id),
        "past_matches": h2h_matches,
    }


def generate_standings_csv_data(category):
    """Generates rows for Standings CSV export."""
    from .views import StandingsAPIView
    # Calculate standings using category fixtures
    fixtures = category.fixtures.filter(phase="league") if category.mode == "league" else category.fixtures.all()
    teams = category.teams.all()

    table = {
        t.team_id: {
            "id": t.team_id,
            "name": t.name,
            "P": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "GD": 0, "Pts": 0,
        }
        for t in teams
    }

    for f in fixtures:
        if not f.played and not f.events.exists() and not f.walkover_winner:
            continue
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
            elif hs < as_score:
                table[a_id]["W"] += 1
                table[a_id]["Pts"] += 3
                table[h_id]["L"] += 1
            else:
                table[h_id]["D"] += 1
                table[a_id]["D"] += 1
                table[h_id]["Pts"] += 1
                table[a_id]["Pts"] += 1

    rows = list(table.values())
    for r in rows:
        r["GD"] = r["GF"] - r["GA"]
    rows.sort(key=lambda x: (x["Pts"], x["GD"], x["GF"]), reverse=True)

    header = ["Rank", "Team Code", "Team Name", "MP", "W", "D", "L", "GF", "GA", "GD", "Pts"]
    data = [header]
    for i, r in enumerate(rows, 1):
        data.append([
            i,
            r["id"],
            r["name"],
            r["P"],
            r["W"],
            r["D"],
            r["L"],
            r["GF"],
            r["GA"],
            r["GD"],
            r["Pts"],
        ])
    return data


def generate_fixtures_csv_data(category):
    """Generates rows for Fixtures CSV export."""
    fixtures = list(category.fixtures.all())
    fixtures.sort(key=fixture_sort_key)
    header = [
        "Fixture ID",
        "Phase",
        "Date",
        "Home Team Code",
        "Home Team Name",
        "Away Team Code",
        "Away Team Name",
        "Status",
        "Home Score",
        "Away Score",
        "Walkover",
        "Referee",
    ]
    data = [header]
    for f in fixtures:
        hs, as_score = f.score
        score_h = hs if f.played else ""
        score_a = as_score if f.played else ""
        data.append([
            f.fixture_id,
            f.get_phase_display(),
            f.date,
            f.home_team.team_id if f.home_team else "TBD",
            f.home_team.name if f.home_team else "TBD",
            f.away_team.team_id if f.away_team else "TBD",
            f.away_team.name if f.away_team else "TBD",
            "Played" if f.played else "Upcoming / Scheduled",
            score_h,
            score_a,
            f.walkover_winner.name if f.walkover_winner else "",
            f.referee or "",
        ])
    return data


def generate_players_csv_data(category):
    """Generates rows for Players & Stats CSV export."""
    header = [
        "Player ID",
        "Player Name",
        "Team Code",
        "Team Name",
        "Position",
        "Goals",
        "Assists",
        "Yellow Cards",
        "Red Cards",
    ]
    data = [header]

    for team in category.teams.all().order_by("name"):
        for p in team.players.filter(is_unknown=False).order_by("name"):
            goals = MatchEvent.objects.filter(fixture__category=category, player=p, event_type="goal").count()
            assists = (
                MatchEvent.objects.filter(fixture__category=category, assist_player=p, event_type="goal").count()
                + MatchEvent.objects.filter(fixture__category=category, player=p, event_type="assist").count()
            )
            yellows = MatchEvent.objects.filter(fixture__category=category, player=p, event_type="yellow").count()
            reds = MatchEvent.objects.filter(fixture__category=category, player=p, event_type="red").count()

            data.append([
                p.player_id,
                p.name,
                team.team_id,
                team.name,
                p.position or "-",
                goals,
                assists,
                yellows,
                reds,
            ])
    return data


def compute_category_suspensions(category):
    """
    Computes active player suspensions per fixture across a competition:
    - Accumulation of 4 yellow cards -> player misses their team's next match.
    - Red card -> player misses their team's next match.
    - A player from another team not currently playing in a match can be booked
      (yellow or red) for interference in the currently playing match, and their
      card takes effect in the player's actual team's next fixture.
    Returns dict: { fixture_id: [ { "teamId", "team", "playerId", "player", "playerName", "reason", "interference", "sourceFixtureId" }, ... ] }
    """
    all_fixtures = list(
        category.fixtures.select_related("home_team", "away_team")
        .prefetch_related("events__team", "events__player")
    )
    all_fixtures.sort(key=fixture_sort_key)
    active_or_played = [
        f for f in all_fixtures if f.played or f.walkover_winner_id or f.events.exists()
    ]
    upcoming_unplayed = [
        f for f in all_fixtures if not (f.played or f.walkover_winner_id or f.events.exists())
    ]
    ordered_fixtures = active_or_played + upcoming_unplayed

    # Track card state per player key (team_id, player_id)
    player_state = {}
    for team in category.teams.prefetch_related("players").all():
        for p in team.players.all():
            key = (team.team_id, p.player_id)
            player_state[key] = {
                "team_id": team.team_id,
                "team_name": team.name,
                "player_id": p.player_id,
                "player_name": p.name if not p.is_unknown else f"{team.name} squad member",
                "pending_yellows": 0,
                "pending_red": False,
                "yellow_interference": False,
                "red_interference": False,
                "last_card_fixture_id": None,
            }

    by_fixture = {}

    for f in ordered_fixtures:
        h_id = f.home_team.team_id if f.home_team else None
        a_id = f.away_team.team_id if f.away_team else None

        # 1. Any player on the home or away team with a pending red card or >= 4 yellow cards
        # misses this match (their actual team's next fixture), which serves the suspension.
        for (t_id, p_id), st in list(player_state.items()):
            if t_id and t_id in (h_id, a_id):
                if st["pending_red"] or st["pending_yellows"] >= 4:
                    is_interf = st["red_interference"] if st["pending_red"] else st["yellow_interference"]
                    src_fix = st["last_card_fixture_id"]
                    if st["pending_red"] and st["pending_yellows"] >= 4:
                        reason = f"Red Card & {st['pending_yellows']} Yellow Cards Accumulation"
                    elif st["pending_red"]:
                        reason = (
                            f"Red Card (Sideline Interference in {src_fix})"
                            if is_interf and src_fix
                            else ("Red Card (Sideline Interference)" if is_interf else "Red Card — Misses Next Match")
                        )
                    else:
                        reason = (
                            f"{st['pending_yellows']} Yellow Cards Accumulation (incl. Interference in {src_fix})"
                            if is_interf and src_fix
                            else f"{st['pending_yellows']} Yellow Cards Accumulation — Misses Next Match"
                        )

                    by_fixture.setdefault(f.fixture_id, []).append({
                        "teamId": st["team_id"],
                        "team": st["team_name"],
                        "playerId": st["player_id"],
                        "player": st["player_name"],
                        "playerName": st["player_name"],
                        "reason": reason,
                        "interference": bool(is_interf),
                        "sourceFixtureId": src_fix,
                    })

                    if st["pending_red"]:
                        st["pending_red"] = False
                        st["red_interference"] = False
                    if st["pending_yellows"] >= 4:
                        st["pending_yellows"] -= 4
                        if st["pending_yellows"] < 4:
                            st["yellow_interference"] = False

        # 2. Process cards issued during this fixture (including interference cards to non-playing teams' players)
        for ev in f.events.all():
            if ev.event_type not in ("yellow", "red"):
                continue
            t_id = ev.team.team_id if ev.team else None
            if not t_id:
                continue
            p_id = ev.player.player_id if ev.player else f"{t_id}-UNK"
            p_name = (
                ev.player.name
                if (ev.player and not ev.player.is_unknown)
                else f"{ev.team.name} squad member"
            )
            key = (t_id, p_id)
            if key not in player_state:
                player_state[key] = {
                    "team_id": t_id,
                    "team_name": ev.team.name if ev.team else t_id,
                    "player_id": p_id,
                    "player_name": p_name,
                    "pending_yellows": 0,
                    "pending_red": False,
                    "yellow_interference": False,
                    "red_interference": False,
                    "last_card_fixture_id": None,
                }
            st = player_state[key]
            is_interf = bool(ev.is_interference or (h_id and a_id and t_id not in (h_id, a_id)))
            st["last_card_fixture_id"] = f.fixture_id
            if ev.event_type == "yellow":
                st["pending_yellows"] += 1
                if is_interf:
                    st["yellow_interference"] = True
            elif ev.event_type == "red":
                st["pending_red"] = True
                if is_interf:
                    st["red_interference"] = True

    return by_fixture


def get_fixture_match_sheet_context(fixture_id):
    """
    Constructs the template context for a professional printable Match Day Sheet.
    """
    fixture = Fixture.objects.filter(fixture_id=fixture_id).first()
    if not fixture:
        return None

    cat = fixture.category
    home = fixture.home_team
    away = fixture.away_team

    home_players = list(home.players.filter(is_unknown=False).order_by("jersey_number", "name")) if home else []
    away_players = list(away.players.filter(is_unknown=False).order_by("jersey_number", "name")) if away else []

    # Check for active suspensions for this fixture (Red card or 4 Yellow cards, including sideline interference)
    all_suspensions = compute_category_suspensions(cat)
    suspensions = all_suspensions.get(fixture.fixture_id, [])

    hs, as_score = fixture.score

    return {
        "fixture": fixture,
        "category": cat,
        "home": home,
        "away": away,
        "home_players": home_players,
        "away_players": away_players,
        "suspensions": suspensions,
        "home_score": hs if fixture.played else "",
        "away_score": as_score if fixture.played else "",
    }


VALID_PLAYER_POSITIONS = ("GK", "LB", "CB", "RB", "CDM", "CM", "LW", "RW", "ST")

POSITION_GROUP_COMPAT = {
    "GK": ("GK",),
    "LB": ("LB",),
    "CB": ("CB",),
    "RB": ("RB",),
    "CDM": ("CDM",),
    "CM": ("CM",),
    "LW": ("LW",),
    "RW": ("RW",),
    "ST": ("ST",),
    # Legacy group keys map to their respective tactical positions
    "DEF": ("LB", "CB", "RB", "DEF"),
    "MID": ("CDM", "CM", "MID"),
    "WING": ("LW", "RW", "WING"),
}

DEFAULT_PLAYER_POSITIONS = {
    "OXF": {
        "Obonyo": "CB",
        "Wanjohi": "CB",
        "Mugane": "LB",
        "Jobu": "RB",
        "Peter": "CM",
        "Dero": "CDM",
        "Rafo": "RW",
        "Brandon": "LW",
        "Pato": "ST",
        "Jose": "ST",
    },
    "SS": {
        "Ian": "CB",
        "Kuria": "CB",
        "Muturi": "RB",
        "Kevo": "CM",
        "OG": "CDM",
        "Farasi": "LW",
        "Sam": "RW",
        "Alvo": "ST",
    },
    "RAN": {
        "Mugwe": "CB",
        "Tyson": "CB",
        "Marvel": "LB",
        "Chris": "CM",
        "Imma": "RW",
        "Wayne": "ST",
    },
    "MAS": {
        "Isaac": "CB",
        "Toma": "CB",
        "Kaama": "CDM",
        "Aizo": "LW",
        "Caleb": "ST",
    },
    "MAN": {
        "Kibe": "ST",
        "Brayo": "LB",
        "Wafula": "CB",
        "Eddie": "CM",
        "Manu": "CDM",
        "Aizo": "LW",
        "Jimmy": "RW",
        "Ramsey": "ST",
    },
    "TYT": {
        "Kevin": "GK",
        "Dennis": "CB",
        "Brian": "RB",
        "Eliud": "CM",
        "Samson": "LW",
        "Victor": "ST",
    },
    "ROY": {
        "Brian": "GK",
        "Collins": "LB",
        "Kelvin": "CB",
        "Patrick": "CDM",
        "Martin": "RW",
        "Kennedy": "ST",
    },
    "KIM": {
        "Kamau": "GK",
        "Njoroge": "CB",
        "Mwangi": "RB",
        "Kariuki": "CM",
        "Otieno": "LW",
        "Juma": "ST",
    },
}


def ensure_player_default_positions(category=None):
    """
    Normalizes legacy position codes (DEF, MID, WING, FWD) if already assigned,
    but DOES NOT automatically assign positions to unassigned players.
    Positions must be assigned manually.
    """
    legacy_fallback = {
        "DEF": "CB",
        "MID": "CM",
        "WING": "RW",
        "FWD": "ST",
    }
    qs = Player.objects.filter(is_unknown=False).exclude(position="").select_related("team")
    if category:
        qs = qs.filter(team__category=category)

    for player in qs:
        if player.position in legacy_fallback:
            player.position = legacy_fallback[player.position]
            player.save(update_fields=["position"])


def get_or_create_active_voting_round(category):
    """
    Gets the currently active open VotingRound, or creates Week 1 open by default.
    When no league, tournament or cup is active (no played fixtures in the category),
    voting starts at Week 1.
    """
    ensure_player_default_positions(category)

    has_active_competition = category.fixtures.filter(Q(played=True) | Q(walkover_winner__isnull=False)).exists()
    has_recorded_votes = PositionVote.objects.filter(voting_round__category=category).exists()

    # When no league, tournament or cup is active and no votes exist, ensure voting starts at Week 1
    if not has_active_competition and not has_recorded_votes:
        w1_round = VotingRound.objects.filter(category=category, week_number=1).first()
        if not w1_round:
            VotingRound.objects.filter(category=category).delete()
            return VotingRound.objects.create(
                category=category,
                week_number=1,
                title="Week 1",
                is_open=True,
            )
        else:
            VotingRound.objects.filter(category=category).exclude(id=w1_round.id).delete()
            if not w1_round.is_open:
                w1_round.is_open = True
                w1_round.closed_at = None
                w1_round.save(update_fields=["is_open", "closed_at"])
            return w1_round

    active = VotingRound.objects.filter(category=category, is_open=True).order_by("-week_number", "-id").first()
    if active:
        return active

    latest = VotingRound.objects.filter(category=category).order_by("-week_number", "-id").first()
    if latest:
        return latest

    return VotingRound.objects.create(
        category=category,
        week_number=1,
        title="Week 1",
        is_open=True,
    )


def compute_team_of_tournament(category):
    """
    Computes the Team of the Tournament (TOTT) across all voting rounds in a category.
    Players with the highest average votes across all tournament voting rounds win each position.
    Features `voting_team_size` players on display and respects `voting_include_gk`
    (excludes GK completely when False).
    """
    rounds_qs = VotingRound.objects.filter(category=category)
    total_rounds = rounds_qs.count()
    if total_rounds == 0:
        total_rounds = 1

    team_size = max(1, int(category.voting_team_size or 6))
    include_gk = bool(category.voting_include_gk)

    pos_names = dict(PositionVote.POSITION_CHOICES)
    line_map = {
        "GK": "GK",
        "LB": "DEF", "CB": "DEF", "RB": "DEF", "DEF": "DEF",
        "CDM": "MID", "CM": "MID", "MID": "MID",
        "LW": "WING", "RW": "WING", "WING": "WING",
        "ST": "ST",
    }
    ranked_by_line = {"GK": [], "DEF": [], "MID": [], "WING": [], "ST": []}
    seen_in_line = {k: set() for k in ranked_by_line}

    tallies = (
        PositionVote.objects.filter(voting_round__category=category)
        .values("player", "position")
        .annotate(total_votes=Count("id"))
        .order_by("-total_votes")
    )

    player_totals = {}
    for t in tallies:
        if not include_gk and t["position"] == "GK":
            continue
        pid = t["player"]
        player_totals[pid] = player_totals.get(pid, 0) + t["total_votes"]

    for t in sorted(tallies, key=lambda x: (-player_totals.get(x["player"], 0), -x["total_votes"])):
        p = Player.objects.filter(id=t["player"]).select_related("team").first()
        if not p:
            continue
        actual_pos = p.position if p.position in pos_names else t["position"]
        if not include_gk and actual_pos == "GK":
            continue
        line_key = line_map.get(actual_pos, "MID")
        if p.player_id not in seen_in_line[line_key]:
            seen_in_line[line_key].add(p.player_id)
            tot_v = player_totals.get(p.id, 0)
            avg = round(tot_v / total_rounds, 2)
            ranked_by_line[line_key].append({
                "position": actual_pos,
                "player_id": p.player_id,
                "player_name": p.name,
                "team_id": p.team.team_id,
                "team_name": p.team.name,
                "team_color": p.team.color,
                "total_votes": tot_v,
                "average_votes": avg,
            })

    active_players = []
    used_player_ids = set()

    # 1. Outfield base picks: top 1 from DEF (LB/CB/RB), MID (CDM/CM), WING (LW/RW), ST
    outfield_lines = ["DEF", "MID", "WING", "ST"]
    for lkey in outfield_lines:
        if len(active_players) >= team_size:
            break
        cands = ranked_by_line.get(lkey, [])
        if cands and cands[0]["total_votes"] > 0:
            top = cands[0]
            used_player_ids.add(top["player_id"])
            pos_code = top["position"]
            active_players.append({
                "position": pos_code,
                "position_name": pos_names.get(pos_code, pos_code),
                "slot_label": f"{pos_code} • {pos_names.get(pos_code, pos_code)}",
                "player_id": top["player_id"],
                "player_name": top["player_name"],
                "team_id": top["team_id"],
                "team_name": top["team_name"],
                "team_color": top["team_color"],
                "total_votes": top["total_votes"],
                "total_rounds": total_rounds,
                "average_votes": top["average_votes"],
                "rankings": cands[:5],
            })

    # 2. Add GK if enabled and voted
    if include_gk and len(active_players) < team_size:
        gk_cands = ranked_by_line.get("GK", [])
        if gk_cands and gk_cands[0]["total_votes"] > 0:
            top_gk = gk_cands[0]
            used_player_ids.add(top_gk["player_id"])
            active_players.append({
                "position": "GK",
                "position_name": "Goalkeeper",
                "slot_label": "GK • Goalkeeper",
                "player_id": top_gk["player_id"],
                "player_name": top_gk["player_name"],
                "team_id": top_gk["team_id"],
                "team_name": top_gk["team_name"],
                "team_color": top_gk["team_color"],
                "total_votes": top_gk["total_votes"],
                "total_rounds": total_rounds,
                "average_votes": top_gk["average_votes"],
                "rankings": gk_cands[:5],
            })

    # 3. Fill up to `team_size` players from outfield runner-ups
    all_remaining = []
    for lkey in outfield_lines:
        for c in ranked_by_line.get(lkey, []):
            if c["player_id"] not in used_player_ids and c["total_votes"] > 0:
                all_remaining.append({
                    "line_key": lkey,
                    "candidate": c,
                    "all_candidates": ranked_by_line.get(lkey, []),
                })
    all_remaining.sort(key=lambda x: (-x["candidate"]["average_votes"], -x["candidate"]["total_votes"]))

    for rem in all_remaining:
        if len(active_players) >= team_size:
            break
        cand = rem["candidate"]
        used_player_ids.add(cand["player_id"])
        pos_code = cand["position"]
        active_players.append({
            "position": pos_code,
            "position_name": pos_names.get(pos_code, pos_code),
            "slot_label": f"{pos_code} • {pos_names.get(pos_code, pos_code)}",
            "player_id": cand["player_id"],
            "player_name": cand["player_name"],
            "team_id": cand["team_id"],
            "team_name": cand["team_name"],
            "team_color": cand["team_color"],
            "total_votes": cand["total_votes"],
            "total_rounds": total_rounds,
            "average_votes": cand["average_votes"],
            "rankings": rem["all_candidates"][:5],
        })

    # 4. Fill fallback placeholders up to `team_size`
    outfield_fallback_slots = [
        ("CB", "Center Back", "CB • Center Back"),
        ("LB", "Left Back", "LB • Left Back"),
        ("RB", "Right Back", "RB • Right Back"),
        ("CDM", "Defensive Midfielder", "CDM • Defensive Midfielder"),
        ("CM", "Central Midfielder", "CM • Central Midfielder"),
        ("LW", "Left Winger", "LW • Left Winger"),
        ("RW", "Right Winger", "RW • Right Winger"),
        ("ST", "Striker", "ST • Striker"),
    ]
    default_fallback_slots = (
        [("GK", "Goalkeeper", "GK • Goalkeeper")] + outfield_fallback_slots
        if include_gk
        else outfield_fallback_slots
    )
    represented_positions = [p["position"] for p in active_players]
    for f_pos, f_pname, f_slabel in default_fallback_slots:
        if len(active_players) >= team_size:
            break
        if f_pos not in represented_positions:
            active_players.append({
                "position": f_pos,
                "position_name": f_pname,
                "slot_label": f_slabel,
                "player_id": None,
                "player_name": "Pending votes",
                "team_id": None,
                "team_name": "",
                "team_color": "#2B4E40",
                "total_votes": 0,
                "total_rounds": total_rounds,
                "average_votes": 0.0,
                "rankings": [],
            })
            represented_positions.append(f_pos)

    idx = 0
    while len(active_players) < team_size:
        fb = default_fallback_slots[idx % len(default_fallback_slots)]
        active_players.append({
            "position": fb[0],
            "position_name": fb[1],
            "slot_label": fb[2],
            "player_id": None,
            "player_name": "Pending votes",
            "team_id": None,
            "team_name": "",
            "team_color": "#2B4E40",
            "total_votes": 0,
            "total_rounds": total_rounds,
            "average_votes": 0.0,
            "rankings": [],
        })
        idx += 1

    pos_sort_order = {
        "GK": 0,
        "LB": 1, "CB": 2, "RB": 3, "DEF": 2,
        "CDM": 4, "CM": 5, "MID": 5,
        "LW": 6, "RW": 7, "WING": 7,
        "ST": 8,
    }
    active_players.sort(key=lambda p: (pos_sort_order.get(p["position"], 99), 0 if p["player_id"] else 1))

    return {
        "total_rounds": total_rounds,
        "team_size": team_size,
        "include_gk": include_gk,
        "lineup": active_players[:team_size],
    }


def get_category_voting_data(category, voter_id=None, round_id=None):
    """
    Returns full voting payload for frontend:
    - current or selected round
    - all rounds
    - my_votes (if voter_id provided)
    - totw (for the round)
    - tott (tournament averages)
    - candidates (grouped by position: GK, LB, CB, RB, CDM, CM, LW, RW, ST + DEF/MID/WING aliases)
    - voting_config (team_size, max_picks_per_position, include_gk)
    """
    ensure_player_default_positions(category)
    include_gk = bool(category.voting_include_gk)
    team_size = max(1, int(category.voting_team_size or 6))
    max_picks = max(1, int(category.voting_max_picks or 2))

    if round_id:
        target_round = VotingRound.objects.filter(category=category, id=round_id).first()
    else:
        target_round = get_or_create_active_voting_round(category)

    voter_has_voted = False
    voted_round_ids = []
    if voter_id:
        voted_round_ids = list(
            PositionVote.objects.filter(
                voting_round__category=category, voter_id=voter_id
            ).values_list("voting_round_id", flat=True).distinct()
        )
        if target_round:
            voter_has_voted = target_round.id in voted_round_ids

    all_rounds_qs = VotingRound.objects.filter(category=category).order_by("-week_number", "-id")
    all_rounds = [
        {
            "id": r.id,
            "week_number": r.week_number,
            "title": r.title,
            "is_open": r.is_open,
            "opened_at": r.opened_at.isoformat() if r.opened_at else None,
            "closed_at": r.closed_at.isoformat() if r.closed_at else None,
            "total_votes": r.votes.count(),
            "has_voted": r.id in voted_round_ids,
        }
        for r in all_rounds_qs
    ]

    round_data = None
    my_votes = {pos: [] for pos, _ in PositionVote.POSITION_CHOICES}
    totw = []
    if target_round:
        round_data = {
            "id": target_round.id,
            "week_number": target_round.week_number,
            "title": target_round.title,
            "is_open": target_round.is_open,
            "opened_at": target_round.opened_at.isoformat() if target_round.opened_at else None,
            "closed_at": target_round.closed_at.isoformat() if target_round.closed_at else None,
            "total_votes": target_round.votes.count(),
            "has_voted": voter_has_voted,
            "voter_has_voted": voter_has_voted,
        }
        totw = target_round.get_totw()

        if voter_id:
            user_votes = PositionVote.objects.filter(
                voting_round=target_round, voter_id=voter_id
            ).select_related("player", "player__team").order_by("created_at", "id")
            for v in user_votes:
                if not include_gk and (v.position == "GK" or v.player.position == "GK"):
                    continue
                entry = {
                    "player_id": v.player.player_id,
                    "player_name": v.player.name,
                    "team_id": v.player.team.team_id,
                    "team_name": v.player.team.name,
                    "position": v.player.position or v.position,
                }
                if v.position in my_votes:
                    my_votes[v.position].append(entry)
                if v.player.position and v.player.position in my_votes and v.player.position != v.position:
                    my_votes[v.player.position].append(entry)

    players_qs = Player.objects.filter(team__category=category, is_unknown=False).select_related("team").order_by("name")
    candidates = {pos: [] for pos, _ in PositionVote.POSITION_CHOICES}

    all_players = []
    for p in players_qs:
        p_data = {
            "id": p.id,
            "player_id": p.player_id,
            "name": p.name,
            "position": p.position or "",
            "team_id": p.team.team_id,
            "team_name": p.team.name,
            "team_color": p.team.color,
        }
        all_players.append(p_data)
        if p.position == "GK" and not include_gk:
            continue
        if p.position in candidates:
            candidates[p.position].append(p_data)
        # Also populate tactical group aliases (DEF, MID, WING)
        if p.position in ("LB", "CB", "RB"):
            candidates["DEF"].append(p_data)
        elif p.position in ("CDM", "CM"):
            candidates["MID"].append(p_data)
        elif p.position in ("LW", "RW"):
            candidates["WING"].append(p_data)

    if not include_gk:
        candidates.pop("GK", None)

    tott = compute_team_of_tournament(category)

    return {
        "round": round_data,
        "all_rounds": all_rounds,
        "my_votes": my_votes,
        "has_voted": voter_has_voted,
        "voter_has_voted": voter_has_voted,
        "voted_round_ids": voted_round_ids,
        "totw": totw,
        "tott": tott,
        "candidates": candidates,
        "all_players": all_players,
        "voting_config": {
            "team_size": team_size,
            "max_picks_per_position": max_picks,
            "include_gk": include_gk,
        },
    }


@transaction.atomic
def submit_voter_ballot(category, round_id, voter_id, voter_name, votes_dict, allow_revoting=True):
    """
    Submits votes for a voter in a given voting round.
    Supports exact positions (GK, LB, CB, RB, CDM, CM, LW, RW, ST) as well as group aliases (DEF, MID, WING).
    Enforces `voting_include_gk` and `voting_max_picks`.
    If `allow_revoting=False`, rejects submissions from players who have already voted in this round/week.
    """
    if not voter_id:
        raise ValueError("voter_id is required.")

    # Verify if voter_id belongs to a registered player, they are voting in their own competition
    voter_in_cat = Player.objects.filter(team__category=category, player_id=voter_id).first()
    if not voter_in_cat:
        other_player = Player.objects.filter(player_id=voter_id).select_related("team__category").first()
        if other_player and other_player.team and other_player.team.category_id != category.key:
            # Check if a player with the same username or name exists in this category
            same_name_in_cat = Player.objects.filter(
                team__category=category, name__iexact=other_player.name, is_unknown=False
            ).first()
            if same_name_in_cat:
                voter_id = same_name_in_cat.player_id
            else:
                raise ValueError(
                    f"You are registered in '{other_player.team.category.label}'. Players can only vote under the specific competition they are playing in."
                )

    voting_round = VotingRound.objects.filter(category=category, id=round_id).first()
    if not voting_round:
        raise ValueError("Voting round not found.")

    if not voting_round.is_open:
        raise ValueError("The voting window is closed by the admin. Votes cannot be accepted.")

    # Prevent players from voting twice in the same week
    if not allow_revoting and PositionVote.objects.filter(voting_round=voting_round, voter_id=voter_id).exists():
        round_title = voting_round.title or f"Week {voting_round.week_number}"
        raise ValueError(
            f"You have already submitted your official vote for {round_title}. Each player can only vote once per week."
        )

    include_gk = bool(category.voting_include_gk)
    max_picks = max(1, int(category.voting_max_picks or 2))
    valid_positions = dict(PositionVote.POSITION_CHOICES)
    saved_votes = {}

    for pos, raw_val in votes_dict.items():
        if pos not in valid_positions:
            continue

        if raw_val is None:
            p_ids = []
        elif isinstance(raw_val, (list, tuple)):
            p_ids = [str(x).strip() for x in raw_val if x and str(x).strip()]
        elif isinstance(raw_val, str):
            p_ids = [raw_val.strip()] if raw_val.strip() else []
        else:
            p_ids = [str(raw_val)]

        if len(p_ids) != len(set(p_ids)):
            raise ValueError(f"Duplicate player selected for {pos}.")

        if pos == "GK":
            if not include_gk:
                if p_ids:
                    raise ValueError("Goalkeeper (GK) position is currently excluded from voting by the Admin.")
                continue
            if len(p_ids) > 1:
                raise ValueError("Maximum 1 player can be voted for GK.")
        else:
            if len(p_ids) > max_picks:
                raise ValueError(f"Maximum {max_picks} players can be voted for {pos}.")

        PositionVote.objects.filter(
            voting_round=voting_round,
            voter_id=voter_id,
            position=pos,
        ).delete()

        allowed_player_positions = POSITION_GROUP_COMPAT.get(pos, (pos,))

        pos_saved = []
        for pid in p_ids:
            player = Player.objects.filter(team__category=category, player_id=pid).first()
            if not player:
                continue

            if player.position not in allowed_player_positions:
                pos_label = valid_positions.get(pos, pos)
                raise ValueError(
                    f"{player.name} cannot be voted as {pos_label} ({pos}) because their registered position is '{player.position or 'Unassigned'}'."
                )

            PositionVote.objects.create(
                voting_round=voting_round,
                voter_id=voter_id,
                position=pos,
                player=player,
                voter_name=voter_name or "Player/Fan",
            )
            pos_saved.append({
                "player_id": player.player_id,
                "player_name": player.name,
                "team_id": player.team.team_id,
                "team_name": player.team.name,
                "position": player.position,
            })

        saved_votes[pos] = pos_saved

    return {
        "success": True,
        "round_id": voting_round.id,
        "saved_votes": saved_votes,
        "has_voted": True,
        "voter_has_voted": True,
        "voted_round_ids": [voting_round.id],
        "totw": voting_round.get_totw(),
        "message": f"Official vote for {voting_round.title or f'Week {voting_round.week_number}'} submitted successfully.",
    }


def admin_toggle_voting_round(
    category,
    round_id=None,
    is_open=None,
    create_new=False,
    title=None,
    team_size=None,
    max_picks_per_position=None,
    include_gk=None,
):
    """
    Allows admin to open or close voting windows, initiate a new Week round,
    or update voting configuration (team_size, max_picks_per_position, include_gk).
    """
    cat_updated = False
    if team_size is not None:
        ts = int(team_size)
        if ts < 1 or ts > 22:
            raise ValueError("Team size must be between 1 and 22 players.")
        category.voting_team_size = ts
        cat_updated = True
    if max_picks_per_position is not None:
        mp = int(max_picks_per_position)
        if mp < 1 or mp > 10:
            raise ValueError("Max picks per position must be between 1 and 10.")
        category.voting_max_picks = mp
        cat_updated = True
    if include_gk is not None:
        category.voting_include_gk = bool(include_gk)
        cat_updated = True
    if cat_updated:
        category.save(update_fields=["voting_team_size", "voting_max_picks", "voting_include_gk", "updated_at"])

    if create_new:
        VotingRound.objects.filter(category=category, is_open=True).update(
            is_open=False, closed_at=timezone.now()
        )
        max_week = VotingRound.objects.filter(category=category).aggregate(Max("week_number"))["week_number__max"] or 0
        new_week = max_week + 1
        new_title = title.strip() if title else f"Week {new_week}"
        new_round = VotingRound.objects.create(
            category=category,
            week_number=new_week,
            title=new_title,
            is_open=True,
        )
        return new_round

    if round_id:
        v_round = VotingRound.objects.filter(category=category, id=round_id).first()
        if not v_round:
            raise ValueError(f"Round {round_id} not found.")

        if is_open is not None:
            if is_open:
                VotingRound.objects.filter(category=category, is_open=True).exclude(id=v_round.id).update(
                    is_open=False, closed_at=timezone.now()
                )
                v_round.is_open = True
                v_round.closed_at = None
            else:
                v_round.is_open = False
                v_round.closed_at = timezone.now()

        if title:
            v_round.title = title.strip()

        v_round.save()
        return v_round

    active = get_or_create_active_voting_round(category)
    if is_open is not None:
        active.is_open = is_open
        active.closed_at = None if is_open else timezone.now()
        active.save()
    return active


def seed_default_honours_votes(category=None):
    """
    Seeds initial TOTW and TOTT votes across 2 rounds for categories that have no votes yet,
    using the 9 official positions (GK, LB, CB, RB, CDM, CM, LW, RW, ST).
    """
    cats = [category] if category else list(Category.objects.all())
    for cat in cats:
        if not cat:
            continue
        ensure_player_default_positions(cat)
        if PositionVote.objects.filter(voting_round__category=cat).exists():
            continue

        gks = list(Player.objects.filter(team__category=cat, position="GK", is_unknown=False))
        cbs = list(Player.objects.filter(team__category=cat, position="CB", is_unknown=False))
        lbs = list(Player.objects.filter(team__category=cat, position="LB", is_unknown=False))
        rbs = list(Player.objects.filter(team__category=cat, position="RB", is_unknown=False))
        cdms = list(Player.objects.filter(team__category=cat, position="CDM", is_unknown=False))
        cms = list(Player.objects.filter(team__category=cat, position="CM", is_unknown=False))
        lws = list(Player.objects.filter(team__category=cat, position="LW", is_unknown=False))
        rws = list(Player.objects.filter(team__category=cat, position="RW", is_unknown=False))
        sts = list(Player.objects.filter(team__category=cat, position="ST", is_unknown=False))

        if not (cbs and cms and sts):
            continue

        VotingRound.objects.filter(category=cat).delete()
        r1 = VotingRound.objects.create(
            category=cat, week_number=1, title="Week 1", is_open=False, closed_at=timezone.now()
        )
        r2 = VotingRound.objects.create(
            category=cat, week_number=2, title="Week 2", is_open=True
        )

        r1.is_open = True
        r1.save()
        sample_voters_r1 = [
            ("OXF-P1", "Pato (Oxford)", {
                "GK": [gks[0].player_id] if gks else [],
                "CB": [cbs[0].player_id, cbs[min(1, len(cbs) - 1)].player_id] if len(cbs) > 1 else [cbs[0].player_id],
                "LB": [lbs[0].player_id] if lbs else [],
                "CM": [cms[0].player_id, cms[min(1, len(cms) - 1)].player_id] if len(cms) > 1 else [cms[0].player_id],
                "RW": [rws[0].player_id, rws[min(1, len(rws) - 1)].player_id] if len(rws) > 1 else ([rws[0].player_id] if rws else []),
                "LW": [lws[0].player_id] if lws else [],
                "ST": [sts[0].player_id, sts[min(1, len(sts) - 1)].player_id] if len(sts) > 1 else [sts[0].player_id],
            }),
            ("MAN-P1", "Ramsey (Mancheli)", {
                "GK": [gks[min(1, len(gks) - 1)].player_id] if gks else [],
                "CB": [cbs[0].player_id],
                "RB": [rbs[0].player_id] if rbs else [],
                "CDM": [cdms[0].player_id] if cdms else [],
                "CM": [cms[0].player_id],
                "RW": [rws[min(1, len(rws) - 1)].player_id] if rws else [],
                "ST": [sts[min(1, len(sts) - 1)].player_id, sts[0].player_id] if len(sts) > 1 else [sts[0].player_id],
            }),
            ("SS-P1", "Sam (Super Strikers)", {
                "GK": [gks[0].player_id] if gks else [],
                "CB": [cbs[min(1, len(cbs) - 1)].player_id],
                "CM": [cms[0].player_id],
                "LW": [lws[0].player_id] if lws else [],
                "ST": [sts[0].player_id],
            }),
        ]
        for v_id, v_name, ballot in sample_voters_r1:
            try:
                submit_voter_ballot(cat, r1.id, v_id, v_name, ballot)
            except ValueError:
                pass
        r1.is_open = False
        r1.closed_at = timezone.now()
        r1.save()

        sample_voters_r2 = [
            ("OXF-P1", "Pato (Oxford)", {
                "GK": [gks[0].player_id] if gks else [],
                "CB": [cbs[0].player_id],
                "LB": [lbs[0].player_id] if lbs else [],
                "CM": [cms[0].player_id],
                "CDM": [cdms[0].player_id] if cdms else [],
                "RW": [rws[min(1, len(rws) - 1)].player_id] if rws else [],
                "LW": [lws[0].player_id] if lws else [],
                "ST": [sts[min(1, len(sts) - 1)].player_id, sts[0].player_id] if len(sts) > 1 else [sts[0].player_id],
            }),
            ("MAN-P2", "Jimmy (Mancheli)", {
                "GK": [gks[0].player_id] if gks else [],
                "CB": [cbs[min(1, len(cbs) - 1)].player_id, cbs[0].player_id] if len(cbs) > 1 else [cbs[0].player_id],
                "CM": [cms[min(1, len(cms) - 1)].player_id, cms[0].player_id] if len(cms) > 1 else [cms[0].player_id],
                "RW": [rws[min(1, len(rws) - 1)].player_id] if rws else [],
                "ST": [sts[min(1, len(sts) - 1)].player_id, sts[0].player_id] if len(sts) > 1 else [sts[0].player_id],
            }),
        ]
        for v_id, v_name, ballot in sample_voters_r2:
            try:
                submit_voter_ballot(cat, r2.id, v_id, v_name, ballot)
            except ValueError:
                pass


# ============================================================
# AUTHENTICATION & AUTHORIZATION SERVICES (CMS & PLAYERS)
# ============================================================

def ensure_default_cms_admin(allow_create=False):
    """
    Checks for an active staff/superuser account.
    Never creates or resets a hardcoded default password unless explicitly invoked
    with allow_create=True in local development seeding.
    """
    from django.contrib.auth.models import User
    from django.conf import settings
    admin_user = User.objects.filter(is_staff=True, is_active=True).first()
    if admin_user:
        return admin_user
    if allow_create and getattr(settings, "DEBUG", False):
        import os
        seed_pw = os.environ.get("DEV_ADMIN_PASSWORD", "").strip()
        if seed_pw:
            return User.objects.create_superuser("admin", "admin@ruirutitans.com", seed_pw)
    return None


def _is_trusted_proxy_peer(remote_addr: str) -> bool:
    """
    Returns True only if remote_addr belongs to an explicitly configured CIDR or IP
    in settings.TRUSTED_PROXY_CIDRS. Never trusts forwarded headers from arbitrary peers.
    """
    import ipaddress
    from django.conf import settings

    if not remote_addr:
        return False
    trusted_cidrs = getattr(settings, "TRUSTED_PROXY_CIDRS", None) or []
    if not trusted_cidrs:
        return False
    try:
        peer_ip = ipaddress.ip_address(remote_addr.strip())
    except ValueError:
        return False

    for entry in trusted_cidrs:
        entry_str = str(entry or "").strip()
        if not entry_str:
            continue
        try:
            if "/" in entry_str:
                if peer_ip in ipaddress.ip_network(entry_str, strict=False):
                    return True
            else:
                if peer_ip == ipaddress.ip_address(entry_str):
                    return True
        except ValueError:
            continue
    return False


def get_client_ip(request):
    """
    Extracts the client IP address safely for rate limiting.
    Never trusts client-supplied X-Forwarded-For or CF-Connecting-IP headers unless
    the direct peer (REMOTE_ADDR) is in settings.TRUSTED_PROXY_CIDRS.
    When trusted, walks X-Forwarded-For from right to left and returns the first
    valid IP address that is not itself a trusted proxy (preventing spoofed left-side XFF values).
    """
    import ipaddress

    if not request:
        return "unknown"
    meta = getattr(request, "META", {}) or {}
    remote_addr = (meta.get("REMOTE_ADDR") or "").strip()

    if _is_trusted_proxy_peer(remote_addr):
        xff = (meta.get("HTTP_X_FORWARDED_FOR") or "").strip()
        if xff:
            parts = [p.strip() for p in xff.split(",") if p.strip()]
            for candidate in reversed(parts):
                try:
                    ipaddress.ip_address(candidate)
                except ValueError:
                    continue
                if not _is_trusted_proxy_peer(candidate):
                    return candidate
            if parts:
                try:
                    ipaddress.ip_address(parts[0])
                    return parts[0]
                except ValueError:
                    pass

        cf_ip = (meta.get("HTTP_CF_CONNECTING_IP") or "").strip()
        if cf_ip:
            candidate = cf_ip.split(",")[0].strip()
            try:
                ipaddress.ip_address(candidate)
                return candidate
            except ValueError:
                pass

    return remote_addr or "unknown"


def check_auth_rate_limit(scope, ip_addr, identifier="", max_ip_attempts=15, max_ident_attempts=8, window_seconds=300):
    """
    Checks whether an authentication or password-change endpoint is rate-limited
    for the given (scope, ip_addr) or (scope, ip_addr, identifier) tuple.
    Returns True if rate limit is exceeded, False otherwise.
    Designed so an attacker from one IP cannot globally lock out another user's account on a different IP.
    """
    from django.core.cache import cache
    import hashlib

    ip_clean = str(ip_addr or "unknown").strip().lower()
    ident_clean = str(identifier or "").strip().lower()

    ip_hash = hashlib.sha256(f"{scope}:ip:{ip_clean}".encode("utf-8")).hexdigest()[:24]
    ip_key = f"rl:{scope}:ip:{ip_hash}"
    ip_count = cache.get(ip_key, 0)
    if ip_count >= max_ip_attempts:
        return True

    if ident_clean:
        pair_hash = hashlib.sha256(f"{scope}:pair:{ip_clean}:{ident_clean}".encode("utf-8")).hexdigest()[:24]
        pair_key = f"rl:{scope}:pair:{pair_hash}"
        pair_count = cache.get(pair_key, 0)
        if pair_count >= max_ident_attempts:
            return True

    return False


def record_auth_failure(scope, ip_addr, identifier="", window_seconds=300):
    """
    Records a failed authentication or password-change attempt in cache.
    """
    from django.core.cache import cache
    import hashlib

    ip_clean = str(ip_addr or "unknown").strip().lower()
    ident_clean = str(identifier or "").strip().lower()

    ip_hash = hashlib.sha256(f"{scope}:ip:{ip_clean}".encode("utf-8")).hexdigest()[:24]
    ip_key = f"rl:{scope}:ip:{ip_hash}"
    curr_ip = cache.get(ip_key, 0)
    cache.set(ip_key, curr_ip + 1, timeout=window_seconds)

    if ident_clean:
        pair_hash = hashlib.sha256(f"{scope}:pair:{ip_clean}:{ident_clean}".encode("utf-8")).hexdigest()[:24]
        pair_key = f"rl:{scope}:pair:{pair_hash}"
        curr_pair = cache.get(pair_key, 0)
        cache.set(pair_key, curr_pair + 1, timeout=window_seconds)


def clear_auth_failures(scope, ip_addr, identifier=""):
    """
    Clears failure counters for (scope, ip_addr, identifier) upon successful authentication.
    """
    from django.core.cache import cache
    import hashlib

    ip_clean = str(ip_addr or "unknown").strip().lower()
    ident_clean = str(identifier or "").strip().lower()

    if ident_clean:
        pair_hash = hashlib.sha256(f"{scope}:pair:{ip_clean}:{ident_clean}".encode("utf-8")).hexdigest()[:24]
        pair_key = f"rl:{scope}:pair:{pair_hash}"
        cache.delete(pair_key)


def compute_credential_fingerprint(secret_state: str) -> str:
    """
    Computes a short, non-reversible HMAC-SHA256 fingerprint of an account's current
    password hash (and temporary code state) so signed tokens are immediately invalidated
    whenever a password is changed or reset. Never exposes raw hashes.
    """
    import hmac
    import hashlib
    from django.conf import settings

    key = (getattr(settings, "SECRET_KEY", "") or "titans-fallback-fp-key").encode("utf-8")
    msg = f"cred-v1:{secret_state or ''}".encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()[:16]


def get_cms_user_credential_fingerprint(user) -> str:
    if not user:
        return ""
    return compute_credential_fingerprint(f"cms:{user.pk}:{user.password or ''}")


def get_player_credential_fingerprint(player) -> str:
    if not player:
        return ""
    return compute_credential_fingerprint(
        f"player:{player.player_id}:{player.password or ''}:{player.temp_code or ''}:{bool(player.must_change_password)}"
    )


def create_signed_token(payload, salt="titans-auth"):
    from django.core import signing
    token_data = dict(payload) if isinstance(payload, dict) else payload
    if isinstance(token_data, dict) and "_cv" not in token_data:
        role = token_data.get("role")
        if role == "cms" and token_data.get("username"):
            from django.contrib.auth.models import User
            u = User.objects.filter(username__iexact=token_data["username"]).first()
            if u:
                token_data["_cv"] = get_cms_user_credential_fingerprint(u)
        elif role == "player" and (token_data.get("player_id") or token_data.get("id")):
            pid = token_data.get("player_id") or token_data.get("id")
            cat_key = token_data.get("category_key")
            qs = Player.objects.filter(player_id=pid, is_unknown=False)
            p = (qs.filter(team__category__key=cat_key).first() or qs.first()) if cat_key else qs.first()
            if p:
                token_data["_cv"] = get_player_credential_fingerprint(p)
    return signing.dumps(token_data, salt=salt)


def verify_signed_token(token, salt="titans-auth", max_age=86400 * 7):
    from django.core import signing
    if not token:
        return None
    try:
        return signing.loads(token, salt=salt, max_age=max_age)
    except signing.BadSignature:
        return None


def generate_four_digit_code():
    """Generates a cryptographically secure 4-digit numeric code (1000 - 9999)."""
    import secrets
    return f"{secrets.randbelow(9000) + 1000}"


def register_player_by_admin(
    category_key,
    team_id,
    name=None,
    username=None,
    position="",
    jersey_number=None,
    first_name=None,
    surname=None,
    date_of_birth=None,
    active_foot="right",
    preferred_positions=None,
):
    """
    Registers a new club player by Admin.
    Generates a 4-digit activation code and sets must_change_password=True.
    The player is required to change their password on first sign-in before accessing dashboard.
    """
    from django.utils import timezone
    category = Category.objects.filter(key=category_key).first()
    if not category:
        category = Category.objects.first()
    if not category:
        raise ValueError("Tournament category not found.")

    team = Team.objects.filter(category=category, team_id=team_id).first()
    if not team:
        team = Team.objects.filter(category=category, name__iexact=team_id).first()
    if not team:
        raise ValueError(f"Team '{team_id}' not found in category '{category.label}'.")

    f_name = str(first_name or "").strip()
    s_name = str(surname or "").strip()
    if f_name or s_name:
        clean_name = f"{f_name} {s_name}".strip()
    else:
        clean_name = str(name or "").strip()

    if not clean_name:
        raise ValueError("Player name (first name and surname) is required.")

    # Player number is strictly mandatory in registration
    if jersey_number is None or str(jersey_number).strip() == "":
        raise ValueError("Player jersey number is mandatory for registration.")
    clean_j = str(jersey_number).strip().lstrip("#")
    if not clean_j.isdigit():
        raise ValueError("Player jersey number must be a valid positive number.")
    j_num = int(clean_j)
    if j_num <= 0 or j_num > 999:
        raise ValueError("Player jersey number must be between 1 and 999.")

    # Ensure jersey number is unique within this team
    existing_holder = Player.objects.filter(team=team, jersey_number=j_num, is_unknown=False).first()
    if existing_holder:
        raise ValueError(
            f"Jersey #{j_num} is already assigned to {existing_holder.name} on {team.name}. "
            f"Please choose an available number or release #{j_num} from that player."
        )

    if username and str(username).strip():
        uname = slugify(str(username).strip()).replace("-", "_")
    else:
        uname = slugify(clean_name).replace("-", "_")
    if not uname:
        uname = "player"

    base_uname = uname
    counter = 1
    while Player.objects.filter(team__category=category, username__iexact=uname).exists():
        uname = f"{base_uname}_{counter}"
        counter += 1

    code = generate_four_digit_code()

    parsed_dob = None
    if date_of_birth:
        from datetime import datetime, date
        if isinstance(date_of_birth, (datetime, date)):
            parsed_dob = date_of_birth
        else:
            try:
                parsed_dob = datetime.strptime(str(date_of_birth)[:10], "%Y-%m-%d").date()
            except ValueError:
                parsed_dob = None

    pos_list = preferred_positions if isinstance(preferred_positions, list) else []
    primary_pos = position or (pos_list[0] if pos_list else "")

    player = Player.objects.create(
        team=team,
        name=clean_name,
        first_name=f_name,
        surname=s_name,
        date_of_birth=parsed_dob,
        active_foot=str(active_foot or "right").strip().lower(),
        preferred_positions=pos_list,
        username=uname,
        position=primary_pos,
        jersey_number=j_num,
        password=code,
        temp_code=code,
        temp_code_created_at=timezone.now(),
        must_change_password=True,
        is_active=True,
    )

    return player, code


def update_player_profile(player_record, data):
    """
    Updates a player's personal details:
    - first_name, surname, date_of_birth, username, active_foot, preferred_positions
    """
    from datetime import datetime, date
    first_name = str(data.get("first_name", "") or data.get("firstName", "")).strip()
    surname = str(data.get("surname", "")).strip()
    dob_raw = data.get("date_of_birth") or data.get("dob")
    active_foot = str(data.get("active_foot", "") or data.get("activeFoot", "")).strip().lower()
    pref_positions = data.get("preferred_positions") or data.get("preferredPositions")
    new_username = str(data.get("username", "")).strip()

    if first_name:
        player_record.first_name = first_name
    if surname:
        player_record.surname = surname
    if first_name or surname:
        player_record.name = f"{player_record.first_name} {player_record.surname}".strip()

    if dob_raw:
        if isinstance(dob_raw, (datetime, date)):
            player_record.date_of_birth = dob_raw
        else:
            try:
                player_record.date_of_birth = datetime.strptime(str(dob_raw)[:10], "%Y-%m-%d").date()
            except ValueError:
                pass

    if active_foot in ("left", "right", "both"):
        player_record.active_foot = active_foot

    if isinstance(pref_positions, list):
        player_record.preferred_positions = pref_positions
        if pref_positions:
            if not player_record.position or player_record.position not in pref_positions:
                player_record.position = pref_positions[0]

    player_pos = str(data.get("position", "")).strip()
    if player_pos:
        player_record.position = player_pos

    if new_username:
        norm_uname = slugify(new_username).replace("-", "_")
        if norm_uname and norm_uname != player_record.username:
            # Check uniqueness within this category
            existing = Player.objects.filter(
                team__category=player_record.team.category,
                username__iexact=norm_uname,
            ).exclude(pk=player_record.pk).exists()
            if existing:
                raise ValueError(f"Username '@{norm_uname}' is already in use by another player.")
            player_record.username = norm_uname

    player_record.save()
    return player_record


def reset_player_password_by_admin(username_or_ident, category_key=None, team_id=None):
    """
    Resets a player's password using their username, permanent ID, full/partial name,
    or jersey number (e.g. '10' or '#10').
    Generates a new 4-digit activation code and sets must_change_password=True.
    """
    ident = str(username_or_ident or "").strip()
    if not ident:
        raise ValueError("Please provide a player username, ID, name, or jersey number.")

    base_qs = Player.objects.filter(is_unknown=False).select_related("team", "team__category")
    if category_key:
        base_qs = base_qs.filter(team__category__key=category_key)
    if team_id:
        base_qs = base_qs.filter(Q(team__team_id=team_id) | Q(team__name__iexact=team_id))

    clean_num = ident.lstrip("#").strip()
    norm_slug = slugify(ident).replace("-", "_")

    player = None
    # 1. Match by username, player_id, exact name, or slug
    name_or_user_q = (
        Q(username__iexact=ident)
        | Q(username__iexact=norm_slug)
        | Q(player_id__iexact=ident)
        | Q(name__iexact=ident)
    )
    player = base_qs.filter(name_or_user_q).first()

    # 2. If not found and input is a jersey number
    if not player and clean_num.isdigit():
        num_val = int(clean_num)
        num_matches = list(base_qs.filter(jersey_number=num_val))
        if len(num_matches) == 1:
            player = num_matches[0]
        elif len(num_matches) > 1:
            options_str = ", ".join(f"{p.name} ({p.team.name} @{p.username})" for p in num_matches[:4])
            raise ValueError(
                f"Multiple players have jersey #{num_val}: {options_str}. "
                "Please specify their username or team name."
            )

    # 3. If still not found, try partial match on name or username
    if not player:
        partial = base_qs.filter(Q(name__icontains=ident) | Q(username__icontains=ident))
        if partial.count() == 1:
            player = partial.first()
        elif partial.count() > 1:
            options_str = ", ".join(f"{p.name} (@{p.username})" for p in partial[:4])
            raise ValueError(
                f"Multiple players match '{ident}': {options_str}. "
                "Please enter the exact username."
            )

    if not player:
        raise ValueError(f"Player account matching '{ident}' was not found.")

    code = generate_four_digit_code()
    from django.utils import timezone
    linked_players = Player.objects.filter(is_unknown=False).filter(
        Q(username__iexact=player.username) | Q(player_id=player.player_id)
    )
    for p in linked_players:
        p.set_password(code)
        p.temp_code = code
        p.temp_code_created_at = timezone.now()
        p.must_change_password = True
        p.save(update_fields=["password", "temp_code", "temp_code_created_at", "must_change_password"])

    player.refresh_from_db()
    return player, code


def release_player_jersey_admin(player_ident, team_id=None, category_key=None):
    """
    Releases the jersey number from a player so that it is unassigned and available
    for another player to use.
    """
    ident = str(player_ident or "").strip()
    if not ident:
        raise ValueError("Player identifier is required.")

    base_qs = Player.objects.filter(is_unknown=False).select_related("team", "team__category")
    if category_key:
        base_qs = base_qs.filter(team__category__key=category_key)
    if team_id:
        base_qs = base_qs.filter(Q(team__team_id=team_id) | Q(team__name__iexact=team_id))

    clean_num = ident.lstrip("#").strip()
    norm_slug = slugify(ident).replace("-", "_")

    player = (
        base_qs.filter(
            Q(player_id__iexact=ident)
            | Q(username__iexact=ident)
            | Q(username__iexact=norm_slug)
            | Q(name__iexact=ident)
        ).first()
    )

    if not player and clean_num.isdigit():
        num_matches = list(base_qs.filter(jersey_number=int(clean_num)))
        if len(num_matches) == 1:
            player = num_matches[0]
        elif len(num_matches) > 1:
            options_str = ", ".join(f"{p.name} ({p.team.name})" for p in num_matches[:4])
            raise ValueError(f"Multiple players have jersey #{clean_num}: {options_str}. Please specify player ID or team.")

    if not player:
        raise ValueError(f"Player '{ident}' was not found.")

    old_num = player.jersey_number
    if old_num is None:
        return player, None

    linked_players = Player.objects.filter(is_unknown=False).filter(
        Q(player_id=player.player_id) | (Q(username__iexact=player.username) & ~Q(username=""))
    )
    for p in linked_players:
        p.jersey_number = None
        p.save(update_fields=["jersey_number"])

    player.refresh_from_db()
    return player, old_num


def set_player_active_status_admin(player_ident, is_active=None, team_id=None, category_key=None):
    """
    Enables or disables a player's account.
    If is_active is None, toggles the current status.
    """
    ident = str(player_ident or "").strip()
    if not ident:
        raise ValueError("Player identifier is required.")

    base_qs = Player.objects.filter(is_unknown=False).select_related("team", "team__category")
    if category_key:
        base_qs = base_qs.filter(team__category__key=category_key)
    if team_id:
        base_qs = base_qs.filter(Q(team__team_id=team_id) | Q(team__name__iexact=team_id))

    clean_num = ident.lstrip("#").strip()
    norm_slug = slugify(ident).replace("-", "_")

    player = (
        base_qs.filter(
            Q(player_id__iexact=ident)
            | Q(username__iexact=ident)
            | Q(username__iexact=norm_slug)
            | Q(name__iexact=ident)
        ).first()
    )

    if not player and clean_num.isdigit():
        num_matches = list(base_qs.filter(jersey_number=int(clean_num)))
        if len(num_matches) == 1:
            player = num_matches[0]
        elif len(num_matches) > 1:
            options_str = ", ".join(f"{p.name} ({p.team.name})" for p in num_matches[:4])
            raise ValueError(f"Multiple players have jersey #{clean_num}: {options_str}. Please specify player ID or team.")

    if not player:
        raise ValueError(f"Player '{ident}' was not found.")

    new_status = (not player.is_active) if is_active is None else bool(is_active)

    linked_players = Player.objects.filter(is_unknown=False).filter(
        Q(player_id=player.player_id) | (Q(username__iexact=player.username) & ~Q(username=""))
    )
    for p in linked_players:
        p.is_active = new_status
        p.save(update_fields=["is_active"])

    player.refresh_from_db()
    return player, new_status


def update_player_position_by_admin(player_ident, position="", team_id=None, category_key=None):
    """
    Manually sets, changes, or clears a player's tactical position.
    Allowed positions: '', 'GK', 'LB', 'CB', 'RB', 'CDM', 'CM', 'LW', 'RW', 'ST'
    (and legacy aliases 'DEF', 'MID', 'WING', 'FWD' are normalized).
    """
    ident = str(player_ident or "").strip()
    if not ident:
        raise ValueError("Please provide a player username, ID, or name.")

    pos = str(position or "").strip().upper()
    legacy_map = {"DEF": "CB", "MID": "CM", "WING": "RW", "FWD": "ST"}
    if pos in legacy_map:
        pos = legacy_map[pos]

    valid = {"", "GK", "LB", "CB", "RB", "CDM", "CM", "LW", "RW", "ST"}
    if pos not in valid:
        raise ValueError(f"Invalid position '{position}'. Choose from GK, LB, CB, RB, CDM, CM, LW, RW, ST, or leave blank to unassign.")

    base_qs = Player.objects.filter(is_unknown=False).select_related("team", "team__category")
    if category_key:
        base_qs = base_qs.filter(team__category__key=category_key)
    if team_id:
        base_qs = base_qs.filter(Q(team__team_id=team_id) | Q(team__name__iexact=team_id))

    clean_num = ident.lstrip("#").strip()
    norm_slug = slugify(ident).replace("-", "_")

    player = (
        base_qs.filter(
            Q(player_id__iexact=ident)
            | Q(username__iexact=ident)
            | Q(username__iexact=norm_slug)
            | Q(name__iexact=ident)
        ).first()
    )

    if not player and clean_num.isdigit():
        num_matches = list(base_qs.filter(jersey_number=int(clean_num)))
        if len(num_matches) == 1:
            player = num_matches[0]
        elif len(num_matches) > 1:
            options_str = ", ".join(f"{p.name} ({p.team.name})" for p in num_matches[:4])
            raise ValueError(f"Multiple players have jersey #{clean_num}: {options_str}. Please specify player ID or team.")

    if not player and ident.isdigit():
        player = base_qs.filter(id=int(ident)).first()

    if not player:
        raise ValueError(f"Player '{ident}' was not found.")

    player.position = pos
    player.save(update_fields=["position"])

    # Keep linked player records across categories synchronized if desired
    linked_players = Player.objects.filter(is_unknown=False).filter(
        Q(player_id=player.player_id) | (Q(username__iexact=player.username) & ~Q(username=""))
    )
    for p in linked_players:
        if p.pk != player.pk:
            p.position = pos
            p.save(update_fields=["position"])

    player.refresh_from_db()
    return player


def update_player_username_by_admin(player_ident, new_username, team_id=None, category_key=None):
    """
    Allows an administrator to manually edit a player's username (e.g. from generated slug to a custom username).
    Validates formatting and uniqueness across all registered players.
    """
    ident = str(player_ident or "").strip()
    if not ident:
        raise ValueError("Please provide a player ID, username, or name.")

    raw_uname = str(new_username or "").strip().lower()
    if not raw_uname:
        raise ValueError("Username cannot be empty.")

    clean_uname = re.sub(r'[^a-z0-9_]', '_', raw_uname).strip('_')
    if len(clean_uname) < 2:
        raise ValueError("Username must be at least 2 characters long and contain only letters, numbers, and underscores.")
    if len(clean_uname) > 64:
        raise ValueError("Username cannot exceed 64 characters.")

    base_qs = Player.objects.filter(is_unknown=False).select_related("team", "team__category")
    if category_key:
        base_qs = base_qs.filter(team__category__key=category_key)
    if team_id:
        base_qs = base_qs.filter(Q(team__team_id=team_id) | Q(team__name__iexact=team_id))

    clean_num = ident.lstrip("#").strip()
    norm_slug = slugify(ident).replace("-", "_")

    player = (
        base_qs.filter(
            Q(player_id__iexact=ident)
            | Q(username__iexact=ident)
            | Q(username__iexact=norm_slug)
            | Q(name__iexact=ident)
        ).first()
    )

    if not player and clean_num.isdigit():
        num_matches = list(base_qs.filter(jersey_number=int(clean_num)))
        if len(num_matches) == 1:
            player = num_matches[0]
        elif len(num_matches) > 1:
            options_str = ", ".join(f"{p.name} ({p.team.name})" for p in num_matches[:4])
            raise ValueError(f"Multiple players have jersey #{clean_num}: {options_str}. Please specify player ID or team.")

    if not player and ident.isdigit():
        player = base_qs.filter(id=int(ident)).first()

    if not player:
        raise ValueError(f"Player '{ident}' was not found.")

    # Check for uniqueness against other players with a different player_id
    duplicate = (
        Player.objects.filter(username__iexact=clean_uname)
        .exclude(Q(id=player.id) | Q(player_id=player.player_id))
        .first()
    )
    if duplicate:
        raise ValueError(
            f"Username '@{clean_uname}' is already in use by player '{duplicate.name}' (ID: {duplicate.player_id}). Please choose a different username."
        )

    p_id = player.player_id
    player.username = clean_uname
    player.save(update_fields=["username"])

    # Update all linked player records with the same permanent ID
    if p_id:
        Player.objects.filter(player_id=p_id).update(username=clean_uname)

    player.refresh_from_db()
    return player


def change_player_password(player_or_ident, new_password, current_code=None):
    """
    Sets a player's new permanent password, clears the 4-digit temp code,
    and sets must_change_password=False, granting full dashboard access.
    """
    clean_pw = str(new_password or "").strip()
    if len(clean_pw) < 4:
        raise ValueError("New password must be at least 4 characters long.")
    if clean_pw.lower() == "titans2026":
        raise ValueError("Please choose a personal password instead of the legacy default password.")

    if isinstance(player_or_ident, Player):
        player = player_or_ident
    elif isinstance(player_or_ident, dict):
        ident = str(
            player_or_ident.get("username")
            or player_or_ident.get("player_id")
            or player_or_ident.get("id")
            or player_or_ident.get("permanent_id")
            or player_or_ident.get("name")
            or ""
        ).strip()
        norm_slug = slugify(ident).replace("-", "_")
        player = (
            Player.objects.filter(is_unknown=False)
            .filter(
                Q(username__iexact=ident)
                | Q(username__iexact=norm_slug)
                | Q(player_id__iexact=ident)
                | Q(name__iexact=ident)
            )
            .select_related("team", "team__category")
            .first()
        )
        if not player:
            clean_ident = ident.lstrip("@").strip()
            player = (
                Player.objects.filter(is_unknown=False)
                .filter(
                    Q(username__iexact=clean_ident)
                    | Q(player_id__iexact=clean_ident)
                    | Q(name__iexact=clean_ident)
                )
                .select_related("team", "team__category")
                .first()
            )
        if not player:
            raise ValueError("Player account not found.")
    else:
        ident = str(player_or_ident or "").strip()
        norm_slug = slugify(ident).replace("-", "_")
        player = (
            Player.objects.filter(is_unknown=False)
            .filter(
                Q(username__iexact=ident)
                | Q(username__iexact=norm_slug)
                | Q(player_id__iexact=ident)
                | Q(name__iexact=ident)
            )
            .select_related("team", "team__category")
            .first()
        )
        if not player:
            clean_ident = ident.lstrip("@").strip()
            player = (
                Player.objects.filter(is_unknown=False)
                .filter(
                    Q(username__iexact=clean_ident)
                    | Q(player_id__iexact=clean_ident)
                    | Q(name__iexact=clean_ident)
                )
                .select_related("team", "team__category")
                .first()
            )
        if not player:
            raise ValueError("Player account not found.")

    if player.must_change_password:
        if not current_code:
            raise ValueError("Current 4-digit activation code is required.")
        c_code = str(current_code).strip()
        if not player.is_temp_code_valid(c_code) and not player.check_password(c_code):
            raise ValueError("Invalid current activation code or attempt limit reached.")
    else:
        # Standard password change requires verification of existing password
        if not current_code:
            raise ValueError("Current password is required to set a new password.")
        c_code = str(current_code).strip()
        if not player.check_password(c_code):
            raise ValueError("Current password does not match. Please verify and try again.")

    linked_players = Player.objects.filter(is_unknown=False).filter(
        Q(username__iexact=player.username) | Q(player_id=player.player_id)
    )
    for p in linked_players:
        p.set_password(clean_pw)
        p.clear_temp_code()
        p.save(update_fields=["password", "temp_code", "temp_code_created_at", "must_change_password"])

    player.refresh_from_db()
    profile = {
        "role": "player",
        "id": player.player_id,
        "player_id": player.player_id,
        "permanent_id": player.player_id,
        "username": player.username or slugify(player.name).replace("-", "_"),
        "name": player.name,
        "position": player.position or "",
        "jersey_number": player.jersey_number,
        "team_id": player.team.team_id,
        "team_name": player.team.name,
        "team_color": player.team.color,
        "category_key": player.team.category.key,
        "must_change_password": False,
    }
    token = create_signed_token(profile, salt="titans-player-auth")
    return profile, token


def authenticate_player_credentials(
    player_id=None,
    access_code=None,
    category_key=None,
    username=None,
    password=None,
):
    """
    Verifies a club player's login credentials using their username and password/code
    (also accepts permanent player_id or player name as username).
    """
    ident = str(username or player_id or "").strip()
    secret = str(password if password is not None else (access_code or "")).strip()

    if not ident or not secret:
        raise ValueError("Please enter both your player username and password or 4-digit code.")

    norm_slug = slugify(ident).replace("-", "_")
    base_qs = Player.objects.filter(is_unknown=False).select_related("team", "team__category")

    lookup_q = (
        Q(username__iexact=ident)
        | Q(username__iexact=norm_slug)
        | Q(name__iexact=ident)
        | Q(player_id__iexact=ident)
    )

    player = None
    if category_key:
        player = base_qs.filter(team__category__key=category_key).filter(lookup_q).first()
    if not player:
        # Prefer league ('open') category first if multiple categories have the same player name
        player = (
            base_qs.filter(team__category__key="open").filter(lookup_q).first()
            or base_qs.filter(lookup_q).first()
        )

    if not player:
        raise ValueError(
            "Player account not found. Please check your player username (e.g. 'pato' or your permanent ID 'OXF-P1')."
        )

    if not getattr(player, "is_active", True):
        raise ValueError("This player account is currently disabled. Please contact club administration.")

    secret_clean = secret.strip()
    is_valid = False

    if player.must_change_password:
        # Player must authenticate using their generated 4-digit code or current password
        if player.is_temp_code_valid(secret_clean) or player.check_password(secret_clean):
            is_valid = True
    else:
        # Standard login with player's password or unexpired temporary code
        if player.check_password(secret_clean) or (player.temp_code and player.is_temp_code_valid(secret_clean)):
            is_valid = True

    if not is_valid:
        raise ValueError("Invalid player credentials or 4-digit activation code. Please check and try again.")

    profile = {
        "role": "player",
        "id": player.player_id,
        "player_id": player.player_id,
        "permanent_id": player.player_id,
        "username": player.username or slugify(player.name).replace("-", "_"),
        "name": player.name,
        "first_name": player.first_name or (player.name.split(" ", 1)[0] if player.name else ""),
        "surname": player.surname or (player.name.split(" ", 1)[1] if (player.name and " " in player.name) else ""),
        "dob": str(player.date_of_birth) if player.date_of_birth else "",
        "date_of_birth": str(player.date_of_birth) if player.date_of_birth else "",
        "active_foot": player.active_foot or "right",
        "preferred_positions": player.preferred_positions or ([player.position] if player.position else []),
        "position": player.position or "",
        "jersey_number": player.jersey_number,
        "team_id": player.team.team_id,
        "team_name": player.team.name,
        "team_color": player.team.color,
        "category_key": player.team.category.key,
        "must_change_password": bool(player.must_change_password),
        "is_active": bool(getattr(player, "is_active", True)),
    }
    token = create_signed_token(profile, salt="titans-player-auth")
    return profile, token


def _resolve_active_player_record(payload, require_cv=True):
    """
    Resolves and validates a live Player DB record from a token/session payload.
    Returns (player, synced_profile_dict) or (None, None) if not found or inactive.
    """
    import secrets

    if not payload or not isinstance(payload, dict):
        return None, None
    player_id = str(payload.get("player_id") or payload.get("id") or "").strip()
    if not player_id:
        return None, None
    category_key = payload.get("category_key")
    qs = Player.objects.filter(player_id=player_id, is_unknown=False).select_related("team", "team__category")
    if category_key:
        player = qs.filter(team__category__key=category_key).first() or qs.first()
    else:
        player = qs.first()
    if not player or not getattr(player, "is_active", True):
        return None, None

    expected_cv = get_player_credential_fingerprint(player)
    token_cv = payload.get("_cv")
    if require_cv:
        if not token_cv or not secrets.compare_digest(str(token_cv), expected_cv):
            return None, None
    elif token_cv and not secrets.compare_digest(str(token_cv), expected_cv):
        return None, None

    synced_profile = {
        "role": "player",
        "id": player.player_id,
        "player_id": player.player_id,
        "permanent_id": player.player_id,
        "username": player.username or slugify(player.name).replace("-", "_"),
        "name": player.name,
        "first_name": player.first_name or (player.name.split(" ", 1)[0] if player.name else ""),
        "surname": player.surname or (player.name.split(" ", 1)[1] if (player.name and " " in player.name) else ""),
        "dob": str(player.date_of_birth) if player.date_of_birth else "",
        "date_of_birth": str(player.date_of_birth) if player.date_of_birth else "",
        "active_foot": player.active_foot or "right",
        "preferred_positions": player.preferred_positions or ([player.position] if player.position else []),
        "position": player.position or "",
        "jersey_number": player.jersey_number,
        "team_id": player.team.team_id,
        "team_name": player.team.name,
        "team_color": player.team.color,
        "category_key": player.team.category.key,
        "must_change_password": bool(player.must_change_password),
        "is_active": bool(player.is_active),
    }
    return player, synced_profile


def get_authenticated_player_from_request(request):
    """
    Extracts and verifies the logged-in Player from either:
    1. X-Titans-Player-Token header (signed token)
    2. Authorization: Bearer <token> header
    3. Django session ('titans_player')
    Always verifies that the player account exists and is active in the database.
    """
    token = request.headers.get("X-Titans-Player-Token", "").strip()
    if not token:
        auth_header = request.headers.get("Authorization", "").strip()
        if auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if token:
        payload = verify_signed_token(token, salt="titans-player-auth")
        if payload and payload.get("role") == "player" and (payload.get("player_id") or payload.get("id")):
            _, synced = _resolve_active_player_record(payload, require_cv=True)
            if synced:
                return synced
        return None

    session_player = request.session.get("titans_player") if hasattr(request, "session") else None
    if session_player and (session_player.get("player_id") or session_player.get("id")):
        _, synced = _resolve_active_player_record(session_player, require_cv=False)
        if synced:
            return synced

    return None


def get_authenticated_cms_from_request(request):
    """
    Extracts and verifies the logged-in CMS Admin from either:
    1. X-Titans-CMS-Token header (signed token)
    2. Authorization: Bearer <token> header (signed with 'titans-cms-auth')
    3. Django session (request.user.is_authenticated and is_staff, or 'titans_cms')
    Always verifies that the Django User exists in the DB, is_active, and is_staff/is_superuser.
    """
    import secrets
    from django.contrib.auth.models import User

    token = request.headers.get("X-Titans-CMS-Token", "").strip()
    if not token:
        auth_header = request.headers.get("Authorization", "").strip()
        if auth_header.startswith("Bearer "):
            candidate = auth_header[7:].strip()
            if verify_signed_token(candidate, salt="titans-cms-auth"):
                token = candidate

    if token:
        payload = verify_signed_token(token, salt="titans-cms-auth")
        if payload and payload.get("role") == "cms" and payload.get("username"):
            user = User.objects.filter(username__iexact=payload["username"]).first()
            if user and user.is_active and (user.is_staff or user.is_superuser):
                expected_cv = get_cms_user_credential_fingerprint(user)
                token_cv = payload.get("_cv")
                if token_cv and secrets.compare_digest(str(token_cv), expected_cv):
                    return {
                        "role": "cms",
                        "username": user.username,
                        "email": user.email,
                    }

    if hasattr(request, "user") and request.user.is_authenticated and getattr(request.user, "is_active", True) and (request.user.is_staff or request.user.is_superuser):
        return {
            "role": "cms",
            "username": request.user.username,
            "email": request.user.email,
        }

    session_cms = request.session.get("titans_cms") if hasattr(request, "session") else None
    if session_cms and session_cms.get("role") == "cms" and session_cms.get("username"):
        user = User.objects.filter(username__iexact=session_cms["username"]).first()
        if user and user.is_active and (user.is_staff or user.is_superuser):
            token_cv = session_cms.get("_cv")
            expected_cv = get_cms_user_credential_fingerprint(user)
            cv_ok = bool(token_cv and secrets.compare_digest(str(token_cv), expected_cv)) if token else bool(not token_cv or secrets.compare_digest(str(token_cv), expected_cv))
            if cv_ok:
                return {
                    "role": "cms",
                    "username": user.username,
                    "email": user.email,
                }

    return None


# ============================================================
# TEAM BALANCER (EXCEL / CSV / TABLE / GOOGLE SHEETS)
# ============================================================

def extract_google_sheet_csv_url(sheet_url: str) -> str:
    """
    Converts a Google Sheets sharing/edit URL into a direct CSV export URL.
    Strictly validates the URL points to docs.google.com/spreadsheets/ to prevent SSRF.
    """
    import re
    from urllib.parse import urlparse

    url = (sheet_url or "").strip()
    if not url:
        raise ValueError("Google Sheet URL is empty.")

    parsed = urlparse(url)
    if parsed.scheme not in ("https", "http") or parsed.hostname != "docs.google.com" or not parsed.path.startswith("/spreadsheets/"):
        raise ValueError("Invalid Google Sheet link. Expected a URL on 'https://docs.google.com/spreadsheets/...'.")

    # Published Google Sheet URL: /spreadsheets/d/e/<PUB_ID>/pub...
    pub_match = re.search(r"/spreadsheets/d/e/([a-zA-Z0-9\-_]+)", parsed.path)
    if pub_match:
        pub_id = pub_match.group(1)
        gid_match = re.search(r"[#&?]gid=([0-9]+)", url)
        gid_part = f"&gid={gid_match.group(1)}" if gid_match else ""
        return f"https://docs.google.com/spreadsheets/d/e/{pub_id}/pub?output=csv{gid_part}"

    # Standard Google Sheet URL: /spreadsheets/d/<SHEET_ID>/...
    sheet_match = re.search(r"/spreadsheets/d/([a-zA-Z0-9\-_]+)", parsed.path)
    if sheet_match:
        sheet_id = sheet_match.group(1)
        gid_match = re.search(r"[#&?]gid=([0-9]+)", url)
        gid = gid_match.group(1) if gid_match else "0"
        return f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"

    raise ValueError("Invalid Google Sheet link. Expected a URL containing '/spreadsheets/d/...'.")


def parse_xlsx_bytes_to_rows(file_bytes: bytes):
    """
    Zero-dependency .xlsx parser using Python's built-in zipfile and xml.etree.ElementTree.
    Extracts sharedStrings and worksheet rows into a 2D list of string values.
    """
    import io
    import re
    import zipfile
    import xml.etree.ElementTree as ET

    try:
        zf = zipfile.ZipFile(io.BytesIO(file_bytes))
    except Exception as exc:
        raise ValueError(f"Could not read Excel (.xlsx) archive: {exc}")

    ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

    # 1. Load sharedStrings.xml if present
    shared_strings = []
    if "xl/sharedStrings.xml" in zf.namelist():
        ss_root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
        for si in ss_root.findall("main:si", ns):
            texts = [t.text or "" for t in si.findall(".//main:t", ns)]
            shared_strings.append("".join(texts))

    # 2. Find first worksheet
    sheet_files = sorted(
        [name for name in zf.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")]
    )
    if not sheet_files:
        raise ValueError("No worksheet found inside the Excel file.")

    sheet_root = ET.fromstring(zf.read(sheet_files[0]))

    def col_letters_to_index(cell_ref: str) -> int:
        letters = re.match(r"([A-Z]+)", (cell_ref or "").upper())
        if not letters:
            return 0
        idx = 0
        for ch in letters.group(1):
            idx = idx * 26 + (ord(ch) - ord("A") + 1)
        return idx - 1

    rows_out = []
    for row_el in sheet_root.findall(".//main:sheetData/main:row", ns):
        cells = row_el.findall("main:c", ns)
        if not cells:
            continue
        row_map = {}
        max_col = 0
        for c_el in cells:
            c_ref = c_el.attrib.get("r", "")
            c_type = c_el.attrib.get("t", "")
            col_idx = col_letters_to_index(c_ref) if c_ref else len(row_map)
            max_col = max(max_col, col_idx)

            val_str = ""
            if c_type == "s":
                v_el = c_el.find("main:v", ns)
                if v_el is not None and v_el.text is not None:
                    try:
                        s_idx = int(v_el.text)
                        if 0 <= s_idx < len(shared_strings):
                            val_str = shared_strings[s_idx]
                    except ValueError:
                        val_str = v_el.text
            elif c_type == "inlineStr":
                t_els = c_el.findall(".//main:t", ns)
                val_str = "".join(t.text or "" for t in t_els)
            else:
                v_el = c_el.find("main:v", ns)
                if v_el is not None and v_el.text is not None:
                    val_str = v_el.text

            row_map[col_idx] = str(val_str).strip()

        row_list = [row_map.get(i, "") for i in range(max_col + 1)]
        if any(cell for cell in row_list):
            rows_out.append(row_list)

    return rows_out


def parse_tabular_text_to_rows(raw_text: str):
    """
    Parses CSV, TSV (copied from Excel/Sheets), pipe, or semicolon separated text into 2D rows.
    """
    import csv
    import io

    text = (raw_text or "").strip()
    if not text:
        return []

    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        return []

    sample = "\n".join(lines[:5])
    if "\t" in sample:
        delimiter = "\t"
    elif ";" in sample and "," not in sample:
        delimiter = ";"
    elif "|" in sample and "," not in sample:
        delimiter = "|"
    else:
        delimiter = ","

    reader = csv.reader(io.StringIO("\n".join(lines)), delimiter=delimiter)
    rows = []
    for r in reader:
        cleaned = [str(cell).strip() for cell in r]
        # Remove empty outer pipe columns if markdown table
        if delimiter == "|" and len(cleaned) >= 2 and cleaned[0] == "" and cleaned[-1] == "":
            cleaned = cleaned[1:-1]
        if any(cleaned):
            # Skip markdown separator rows like --- | ---
            if all(set(c) <= {"-", ":", " "} for c in cleaned if c):
                continue
            rows.append(cleaned)
    return rows


def normalize_player_class(raw_class: str) -> str:
    """
    Normalizes class/category strings like 'A', 'Class A', 'Category B', 'Tier C', 'a - elite'
    into a single uppercase letter A-Z.
    """
    import re
    val = str(raw_class or "").strip().upper()
    if not val:
        return ""
    if len(val) == 1 and "A" <= val <= "Z":
        return val
    # Check patterns like 'CLASS A', 'CAT B', 'CATEGORY C', 'TIER D', 'GRADE E', 'POT A'
    m = re.match(r"^(?:CLASS|CAT|CATEGORY|TIER|GRADE|GROUP|POT|LEVEL)\s*([A-Z])\b", val)
    if m:
        return m.group(1)
    # Check patterns like 'A (ELITE)', 'A - ELITE', 'B-GOOD'
    m2 = re.match(r"^([A-Z])\s*[\(\-:/]", val)
    if m2:
        return m2.group(1)
    return ""


def extract_players_from_rows(rows):
    """
    Extracts player records [{'id', 'name', 'player_class', 'position'}] from 2D tabular rows.
    Supports tables with or without headers.
    """
    if not rows:
        return []

    header_keywords_name = {"name", "player", "player name", "player_name", "full name", "fullname", "athlete", "member"}
    header_keywords_class = {"class", "category", "cat", "tier", "grade", "level", "pot", "skill", "rank", "rating", "division"}
    header_keywords_pos = {"position", "pos", "role"}
    valid_positions = {"GK", "LB", "CB", "RB", "CDM", "CM", "LW", "RW", "ST"}

    first_row_lower = [str(c).strip().lower() for c in rows[0]]
    name_col = None
    class_col = None
    pos_col = None
    has_header = False

    for idx, cell in enumerate(first_row_lower):
        if cell in header_keywords_name or any(k in cell for k in ("player", "name")):
            if name_col is None:
                name_col = idx
                has_header = True
        elif cell in header_keywords_class or any(k in cell for k in ("class", "category", "tier", "grade")):
            if class_col is None:
                class_col = idx
                has_header = True
        elif cell in header_keywords_pos or "pos" in cell:
            if pos_col is None:
                pos_col = idx
                has_header = True

    data_rows = rows[1:] if has_header else rows
    if not data_rows:
        return []

    # If columns weren't identified by header, infer from data rows
    if name_col is None or class_col is None:
        sample_row = data_rows[0]
        if len(sample_row) >= 2:
            for idx, cell in enumerate(sample_row):
                norm_c = normalize_player_class(cell)
                if norm_c and class_col is None:
                    class_col = idx
                elif str(cell).strip().upper() in valid_positions and pos_col is None:
                    pos_col = idx
                elif name_col is None and str(cell).strip() and not str(cell).strip().isdigit():
                    name_col = idx
        if name_col is None:
            name_col = 0
        if class_col is None:
            class_col = 1 if name_col == 0 else 0

    players = []
    for idx, r in enumerate(data_rows):
        if not r:
            continue
        raw_name = r[name_col].strip() if name_col < len(r) else ""
        raw_cls = r[class_col].strip() if class_col < len(r) else ""
        raw_pos = r[pos_col].strip().upper() if (pos_col is not None and pos_col < len(r)) else ""

        norm_cls = normalize_player_class(raw_cls)
        # In case name and class columns were swapped on a row
        if not norm_cls and normalize_player_class(raw_name):
            norm_cls = normalize_player_class(raw_name)
            raw_name = raw_cls

        if not raw_name:
            continue
        if not norm_cls:
            norm_cls = "C"

        pos = raw_pos if raw_pos in valid_positions else ""
        players.append({
            "id": f"BAL-P{idx + 1}",
            "name": raw_name,
            "player_class": norm_cls,
            "position": pos,
        })

    return players


def balance_players_into_teams(players, players_per_team: int, team_names=None, seed=None):
    """
    Distributes players across teams so that:
    - Each team has up to `players_per_team` players (or balanced sizes when total players is not a multiple).
    - Every team receives a balanced mix of players from all classes/categories (A = Elite down to the last letter = Amateur).
    """
    import math
    import random

    if not players:
        raise ValueError("No players provided to balance.")
    players_per_team = max(1, int(players_per_team or 5))

    rng = random.Random(seed)

    # Identify all distinct classes sorted A -> Z (A = Elite, highest weight; last letter = Amateur, weight 1)
    distinct_classes = sorted({
        normalize_player_class(p.get("player_class") or p.get("class") or "C") or "C"
        for p in players
    })
    num_classes = len(distinct_classes)
    class_weight = {
        cls_letter: (num_classes - idx)
        for idx, cls_letter in enumerate(distinct_classes)
    }

    total_players = len(players)
    num_teams = max(1, math.ceil(total_players / players_per_team))

    palette = [
        "#C9A227", "#2E8B57", "#2563EB", "#DC2626",
        "#9333EA", "#0891B2", "#EA580C", "#4F46E5",
        "#16A34A", "#DB2777", "#CA8A04", "#0D9488",
    ]

    teams = []
    for i in range(num_teams):
        custom_name = (
            team_names[i].strip()
            if isinstance(team_names, list) and i < len(team_names) and str(team_names[i]).strip()
            else f"Team {i + 1}"
        )
        teams.append({
            "team_number": i + 1,
            "id": f"TEAM-{i + 1}",
            "name": custom_name,
            "color": palette[i % len(palette)],
            "players": [],
            "class_counts": {c: 0 for c in distinct_classes},
            "total_skill_score": 0,
        })

    # Group players by class A -> Z and shuffle within each class
    players_by_class = {c: [] for c in distinct_classes}
    for idx, p in enumerate(players):
        cls_letter = normalize_player_class(p.get("player_class") or p.get("class") or "C") or "C"
        pos = str(p.get("position") or "").strip().upper()
        players_by_class[cls_letter].append({
            "id": p.get("id") or f"BAL-P{idx + 1}",
            "name": str(p.get("name", "")).strip(),
            "player_class": cls_letter,
            "position": pos,
            "skill_points": class_weight[cls_letter],
        })

    for cls_letter in distinct_classes:
        rng.shuffle(players_by_class[cls_letter])
        # Sort GKs first within the shuffled class so GKs are spread across teams naturally
        players_by_class[cls_letter].sort(key=lambda x: 0 if x["position"] == "GK" else 1)

        for player in players_by_class[cls_letter]:
            # Candidate teams that have not yet reached players_per_team
            eligible_teams = [t for t in teams if len(t["players"]) < players_per_team]
            if not eligible_teams:
                eligible_teams = teams

            # Stratified selection:
            # 1. Fewest players of this specific class (ensures equal A, B, C... per team)
            # 2. Fewest total players on the team so far
            # 3. Lowest total skill score so far (compensates if a team got an extra higher-tier player)
            # 4. Random tie-breaker
            eligible_teams.sort(
                key=lambda t: (
                    t["class_counts"].get(cls_letter, 0),
                    len(t["players"]),
                    t["total_skill_score"],
                    rng.random(),
                )
            )
            chosen = eligible_teams[0]
            chosen["players"].append(player)
            chosen["class_counts"][cls_letter] = chosen["class_counts"].get(cls_letter, 0) + 1
            chosen["total_skill_score"] += player["skill_points"]

    for t in teams:
        count = len(t["players"])
        t["player_count"] = count
        t["average_skill_score"] = round(t["total_skill_score"] / count, 2) if count else 0.0
        # Sort players within each team by class (A -> Z), then name
        t["players"].sort(key=lambda p: (p["player_class"], p["name"]))

    return {
        "teams": teams,
        "classes": distinct_classes,
        "class_weights": class_weight,
        "players_per_team": players_per_team,
        "total_players": total_players,
        "team_count": num_teams,
    }


def intelligently_add_players_to_balanced_teams(teams, new_players, classes=None, class_weights=None, seed=None):
    """
    Intelligently adds new player(s) to existing balanced teams while preserving team balance:
    1. Equal roster sizes: prioritizes candidate teams with the minimum player count.
    2. Goalkeeper priority: assigns GK to teams without a goalkeeper first.
    3. Category / Class representation: places player on team with fewest players of that specific tier.
    4. Skill score balance: places player on team with lowest total skill score as tiebreaker.
    Does NOT reshuffle existing player assignments.
    """
    import copy
    import random

    if not teams:
        raise ValueError("Cannot add players: no existing teams provided.")
    if not new_players:
        return {
            "teams": teams,
            "assignments": [],
            "total_players": sum(len(t.get("players", [])) for t in teams),
        }

    rng = random.Random(seed)
    updated_teams = copy.deepcopy(teams)

    distinct_classes = list(classes) if classes else []
    for t in updated_teams:
        for p in t.get("players", []):
            c = normalize_player_class(p.get("player_class") or p.get("class") or "C") or "C"
            if c not in distinct_classes:
                distinct_classes.append(c)

    for p in new_players:
        c = normalize_player_class(p.get("player_class") or p.get("class") or "C") or "C"
        if c not in distinct_classes:
            distinct_classes.append(c)
    distinct_classes.sort()

    num_classes = len(distinct_classes)
    weights = dict(class_weights) if class_weights else {}
    for idx, c in enumerate(distinct_classes):
        if c not in weights:
            weights[c] = num_classes - idx

    for t in updated_teams:
        if "class_counts" not in t:
            t["class_counts"] = {}
        for c in distinct_classes:
            if c not in t["class_counts"]:
                t["class_counts"][c] = sum(
                    1 for p in t.get("players", [])
                    if (normalize_player_class(p.get("player_class") or p.get("class") or "C") or "C") == c
                )
        if "total_skill_score" not in t:
            t["total_skill_score"] = sum(
                weights.get(normalize_player_class(p.get("player_class") or p.get("class") or "C") or "C", 1)
                for p in t.get("players", [])
            )

    valid_positions = {"GK", "LB", "CB", "RB", "CDM", "CM", "LW", "RW", "ST"}
    prepared = []
    for idx, p in enumerate(new_players):
        cls_letter = normalize_player_class(p.get("player_class") or p.get("class") or "C") or "C"
        raw_pos = str(p.get("position") or "").strip().upper()
        pos = raw_pos if raw_pos in valid_positions else ""
        sp = weights.get(cls_letter, 1)
        prepared.append({
            "id": p.get("id") or f"BAL-P-ADD-{idx + 1}",
            "name": str(p.get("name") or "").strip(),
            "player_class": cls_letter,
            "position": pos,
            "skill_points": sp,
            "is_newly_added": True,
        })

    # Sort incoming players: higher skill points first, GKs first within the same class
    prepared.sort(key=lambda p: (-p["skill_points"], 0 if p["position"] == "GK" else 1, p["name"]))

    assignments = []
    for player in prepared:
        cls_letter = player["player_class"]
        is_gk = player["position"] == "GK"

        min_size = min(len(t["players"]) for t in updated_teams)
        candidates = [t for t in updated_teams if len(t["players"]) == min_size]

        if is_gk:
            no_gk = [t for t in candidates if not any(p.get("position") == "GK" for p in t["players"])]
            if no_gk:
                candidates = no_gk

        min_class_count = min(t["class_counts"].get(cls_letter, 0) for t in candidates)
        candidates = [t for t in candidates if t["class_counts"].get(cls_letter, 0) == min_class_count]

        min_skill = min(t["total_skill_score"] for t in candidates)
        candidates = [t for t in candidates if t["total_skill_score"] == min_skill]

        chosen = candidates[0]
        chosen["players"].append(player)
        chosen["class_counts"][cls_letter] = chosen["class_counts"].get(cls_letter, 0) + 1
        chosen["total_skill_score"] += player["skill_points"]
        count = len(chosen["players"])
        chosen["player_count"] = count
        chosen["average_skill_score"] = round(chosen["total_skill_score"] / count, 2) if count else 0.0

        assignments.append({
            "player": player,
            "team_id": chosen.get("id"),
            "team_name": chosen.get("name"),
        })

    for t in updated_teams:
        t["players"].sort(key=lambda p: (p["player_class"], p["name"]))

    return {
        "teams": updated_teams,
        "classes": distinct_classes,
        "class_weights": weights,
        "assignments": assignments,
        "total_players": sum(len(t["players"]) for t in updated_teams),
    }


def compute_team_analytics(category, team_id):
    """
    Computes comprehensive analytics for a team in a category:
    - Team details and squad roster with stats
    - Last 20 played matches & results
    - Next 5 upcoming fixtures
    - Active suspensions
    - Current form metrics (W/D/L, points, win rate, goals/game, clean sheets)
    - Competition progression & outcome simulation probabilities
    """
    team = category.teams.filter(team_id=team_id).first()
    if not team:
        return None

    all_fixtures = list(
        category.fixtures.select_related("home_team", "away_team")
        .prefetch_related("events__team", "events__player")
    )
    all_fixtures.sort(key=fixture_sort_key)

    team_played = []
    team_upcoming = []

    for f in all_fixtures:
        h_id = f.home_team.team_id if f.home_team else ""
        a_id = f.away_team.team_id if f.away_team else ""
        if h_id != team_id and a_id != team_id:
            continue

        is_home = (h_id == team_id)
        opp = f.away_team if is_home else f.home_team
        is_played = f.played or (f.walkover_winner_id is not None) or f.events.exists()

        if is_played:
            hs, as_score = f.score
            tg = hs if is_home else as_score
            og = as_score if is_home else hs

            if tg > og:
                result = "W"
            elif tg < og:
                result = "L"
            else:
                result = "D"

            scorers = []
            for ev in f.events.all():
                if ev.event_type in ("goal", "owngoal"):
                    p_name = ev.player.name if ev.player and not ev.player.is_unknown else "Goal"
                    scorers.append({
                        "player_name": p_name,
                        "type": ev.event_type,
                        "penalty": bool(getattr(ev, "is_penalty", False)),
                        "is_own_team": (ev.team_id == team.id if ev.event_type == "goal" else ev.team_id != team.id),
                    })

            team_played.append({
                "fixture_id": f.fixture_id,
                "date": f.date,
                "is_home": is_home,
                "opponent_id": opp.team_id if opp else "TBD",
                "opponent_name": opp.name if opp else "TBD",
                "team_score": tg,
                "opponent_score": og,
                "result": result,
                "walkover": bool(f.walkover_winner_id),
                "scorers": scorers,
                "stage": f"Group {f.group_letter}" if f.group_letter else f.get_phase_display(),
            })
        else:
            team_upcoming.append({
                "fixture_id": f.fixture_id,
                "date": f.date,
                "is_home": is_home,
                "opponent_id": opp.team_id if opp else "TBD",
                "opponent_name": opp.name if opp else "TBD",
                "referee": f.referee or None,
                "stage": f"Group {f.group_letter}" if f.group_letter else f.get_phase_display(),
            })

    last_20 = list(reversed(team_played[-20:]))
    next_5 = team_upcoming[:5]

    recent_for_form = team_played[-5:]
    form_badges = [m["result"] for m in reversed(recent_for_form)]
    pts_last_5 = sum(3 if r == "W" else 1 if r == "D" else 0 for r in form_badges)
    total_played_count = len(team_played)
    total_wins = sum(1 for m in team_played if m["result"] == "W")
    win_rate = round((total_wins / total_played_count * 100), 1) if total_played_count else 0.0
    total_gf = sum(m["team_score"] for m in team_played)
    goals_per_match = round(total_gf / total_played_count, 2) if total_played_count else 0.0
    clean_sheets = sum(1 for m in team_played if m["opponent_score"] == 0 and not m["walkover"])

    roster = []
    for p in team.players.all().order_by("name"):
        if p.is_unknown:
            continue
        goals = p.events.filter(event_type="goal").count()
        assists = MatchEvent.objects.filter(assist_player=p).count()
        yellows = p.events.filter(event_type="yellow").count()
        reds = p.events.filter(event_type="red").count()
        roster.append({
            "id": p.player_id,
            "name": p.name,
            "position": p.position,
            "player_class": getattr(p, "player_class", None) or "",
            "jersey_number": p.jersey_number,
            "goals": goals,
            "assists": assists,
            "yellow_cards": yellows,
            "red_cards": reds,
        })

    all_susp_map = compute_category_suspensions(category)
    active_suspensions = []
    for fix_id, susp_list in all_susp_map.items():
        for s in susp_list:
            if s.get("teamId") == team_id or s.get("team") == team_id:
                active_suspensions.append({
                    "target_fixture_id": fix_id,
                    "player_id": s.get("playerId") or s.get("player"),
                    "player_name": s.get("playerName"),
                    "reason": s.get("reason"),
                    "interference": s.get("interference", False),
                })

    projections = {}
    if category.mode == "league":
        table = {}
        for t in category.teams.all():
            table[t.team_id] = {"id": t.team_id, "name": t.name, "pts": 0, "gd": 0, "p": 0}
        for f in all_fixtures:
            if not (f.played or f.walkover_winner_id):
                continue
            if not f.home_team or not f.away_team:
                continue
            hs, as_score = f.score
            ht = f.home_team.team_id
            at = f.away_team.team_id
            if ht in table:
                table[ht]["p"] += 1
                table[ht]["gd"] += (hs - as_score)
                if hs > as_score:
                    table[ht]["pts"] += 3
                elif hs == as_score:
                    table[ht]["pts"] += 1
            if at in table:
                table[at]["p"] += 1
                table[at]["gd"] += (as_score - hs)
                if as_score > hs:
                    table[at]["pts"] += 3
                elif hs == as_score:
                    table[at]["pts"] += 1

        sorted_table = sorted(table.values(), key=lambda x: (x["pts"], x["gd"]), reverse=True)
        cur_rank = next((idx + 1 for idx, x in enumerate(sorted_table) if x["id"] == team_id), 1)
        cur_pts = table[team_id]["pts"] if team_id in table else 0
        rem_games = len(team_upcoming)
        max_possible_pts = cur_pts + rem_games * 3
        leader_pts = sorted_table[0]["pts"] if sorted_table else 0
        eliminated = max_possible_pts < leader_pts

        projections = {
            "mode": "league",
            "current_rank": cur_rank,
            "current_points": cur_pts,
            "matches_remaining": rem_games,
            "max_possible_points": max_possible_pts,
            "mathematically_eliminated": eliminated,
            "champion_probability": 0.0 if eliminated else (round(100.0 / max(1, cur_rank), 1) if rem_games > 0 else (100.0 if cur_rank == 1 else 0.0)),
            "top2_probability": round(min(100.0, 100.0 / max(1, cur_rank * 0.7)), 1) if max_possible_pts >= (sorted_table[1]["pts"] if len(sorted_table) > 1 else 0) else 0.0,
            "top4_probability": round(min(100.0, 100.0 / max(1, cur_rank * 0.5)), 1) if max_possible_pts >= (sorted_table[3]["pts"] if len(sorted_table) > 3 else 0) else 0.0,
        }
    else:
        projections = {
            "mode": "cup",
            "matches_remaining": len(team_upcoming),
            "knockout_progress_probability": 75.0 if len(team_upcoming) > 0 else 100.0,
            "cup_winner_probability": 25.0 if len(team_upcoming) > 0 else 50.0,
        }

    return {
        "team": {
            "id": team.team_id,
            "name": team.name,
            "color": team.color,
        },
        "category": {
            "key": category.key,
            "label": category.label,
            "mode": category.mode,
        },
        "roster": roster,
        "squad_size": len(roster),
        "last20_matches": last_20,
        "next5_fixtures": next_5,
        "active_suspensions": active_suspensions,
        "form": {
            "badges": form_badges,
            "points_last_5": pts_last_5,
            "win_rate": win_rate,
            "goals_per_match": goals_per_match,
            "clean_sheets": clean_sheets,
            "total_matches_played": total_played_count,
        },
        "tournament_projections": projections,
    }


def lookup_player_usernames_by_name(query, category_key=None, limit=25):
    """
    Takes in a player name, jersey number, username, or partial match,
    and returns matching player records with usernames, jersey numbers, and status.
    """
    if not query or not str(query).strip():
        return []

    q_str = str(query).strip()
    qs = Player.objects.filter(is_unknown=False).select_related("team", "team__category")

    if category_key:
        qs = qs.filter(team__category__key=category_key)

    clean_digits = q_str.lstrip("#").strip()
    filter_q = Q(name__icontains=q_str) | Q(username__icontains=q_str) | Q(player_id__icontains=q_str)
    if clean_digits.isdigit():
        filter_q |= Q(jersey_number=int(clean_digits))

    matches = qs.filter(filter_q).order_by("name")[:limit]

    results = []
    seen = set()
    for p in matches:
        key = (p.username, p.team_id, p.player_id)
        if key in seen:
            continue
        seen.add(key)
        results.append({
            "id": p.player_id,
            "name": p.name,
            "username": p.username,
            "jersey_number": p.jersey_number,
            "position": p.position,
            "team_id": p.team.team_id if p.team else "",
            "team_name": p.team.name if p.team else "",
            "team_color": p.team.color if p.team else "#3F7A4E",
            "is_active": getattr(p, "is_active", True),
            "category_key": p.team.category.key if p.team and p.team.category else "",
            "category_name": p.team.category.label if p.team and p.team.category else "",
        })
    return results


def get_category_fixtures_results_pdf_context(category):
    """
    Constructs an exhaustive context dictionary for generating and printing
    the official Category Fixtures & Results PDF document.
    Works for any active or archived competition (league or cup).
    """
    teams = list(category.teams.all().order_by("name"))
    team_map = {t.team_id: t for t in teams}

    fixtures_qs = category.fixtures.all().prefetch_related(
        "events", "events__player", "events__assist_player", "home_team", "away_team", "walkover_winner"
    )
    fixtures_list = list(fixtures_qs)
    fixtures_list.sort(key=fixture_sort_key)

    total_fixtures = len(fixtures_list)
    played_fixtures = [f for f in fixtures_list if (f.played or f.walkover_winner or f.events.exists())]
    played_count = len(played_fixtures)
    scheduled_count = total_fixtures - played_count

    total_goals = 0
    player_goals = {}
    player_assists = {}
    player_yellows = {}
    player_reds = {}

    team_results = {t.team_id: [] for t in teams}

    formatted_fixtures = []
    for f in fixtures_list:
        h_team = f.home_team
        a_team = f.away_team
        h_id = h_team.team_id if h_team else "TBD"
        a_id = a_team.team_id if a_team else "TBD"
        h_name = h_team.name if h_team else "TBD"
        a_name = a_team.name if a_team else "TBD"
        h_color = h_team.color if h_team else "#4A5568"
        a_color = a_team.color if a_team else "#4A5568"

        hs, as_score = f.score
        is_completed = bool(f.played or f.walkover_winner or f.events.exists())
        if is_completed:
            total_goals += (hs + as_score)
            if hs > as_score:
                if h_id in team_results: team_results[h_id].append("W")
                if a_id in team_results: team_results[a_id].append("L")
            elif hs < as_score:
                if a_id in team_results: team_results[a_id].append("W")
                if h_id in team_results: team_results[h_id].append("L")
            else:
                if h_id in team_results: team_results[h_id].append("D")
                if a_id in team_results: team_results[a_id].append("D")

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
                label = f"{p_name} (OG)" if is_og else p_name
                if ev.is_penalty:
                    label += " (PEN)"
                goals.append({"name": label, "team": t_id, "minute": ev.minute, "assist": ast_name})
                if not is_og:
                    player_goals[(p_name, t_name)] = player_goals.get((p_name, t_name), 0) + 1
                    if ast_name:
                        player_assists[(ast_name, t_name)] = player_assists.get((ast_name, t_name), 0) + 1
            elif ev.event_type == "yellow":
                yellows.append({"name": p_name, "team": t_id, "minute": ev.minute})
                player_yellows[(p_name, t_name)] = player_yellows.get((p_name, t_name), 0) + 1
            elif ev.event_type == "red":
                label = f"{p_name} (Interference)" if ev.is_interference else p_name
                reds.append({"name": label, "team": t_id, "minute": ev.minute})
                player_reds[(p_name, t_name)] = player_reds.get((p_name, t_name), 0) + 1

        phase_display = f.get_phase_display()
        if f.phase == "group" and f.group_letter:
            phase_display = f"Group {f.group_letter}"

        cat_venue = category.schedule.get("venue", "Thoome Pri.")
        formatted_fixtures.append({
            "fixture_id": f.fixture_id,
            "phase": phase_display,
            "date": f.date,
            "venue": cat_venue,
            "home_id": h_id,
            "home_name": h_name,
            "home_color": h_color,
            "away_id": a_id,
            "away_name": a_name,
            "away_color": a_color,
            "played": is_completed,
            "home_score": hs if is_completed else "",
            "away_score": as_score if is_completed else "",
            "score_display": f"{hs} - {as_score}" if is_completed else "vs",
            "pens": f"({f.home_pens} - {f.away_pens} pens)" if (f.home_pens is not None or f.away_pens is not None) else "",
            "walkover": f.walkover_winner.name if f.walkover_winner else "",
            "referee": f.referee or "Official Panel",
            "goals": goals,
            "yellows": yellows,
            "reds": reds,
        })

    standings_tables = []
    if category.mode == "league":
        league_table = {
            t.team_id: {
                "id": t.team_id,
                "name": t.name,
                "color": t.color,
                "P": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "GD": 0, "Pts": 0,
                "form": team_results.get(t.team_id, [])[-5:],
            }
            for t in teams
        }
        for f in played_fixtures:
            if f.phase == "league" or category.mode == "league":
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

        rows = list(league_table.values())
        for r in rows:
            r["GD"] = r["GF"] - r["GA"]
        rows.sort(key=lambda x: (x["Pts"], x["GD"], x["GF"]), reverse=True)
        for idx, r in enumerate(rows, 1):
            r["pos"] = idx
        standings_tables.append({
            "title": f"{category.label} - Standings Table",
            "rows": rows,
        })
    else:
        group_letters = category.group_letters or []
        group_of = category.group_of or {}
        if group_letters:
            for g_letter in group_letters:
                grp_teams = [t for t in teams if group_of.get(t.team_id) == g_letter]
                g_table = {
                    t.team_id: {
                        "id": t.team_id,
                        "name": t.name,
                        "color": t.color,
                        "P": 0, "W": 0, "D": 0, "L": 0, "GF": 0, "GA": 0, "GD": 0, "Pts": 0,
                        "form": team_results.get(t.team_id, [])[-5:],
                    }
                    for t in grp_teams
                }
                for f in played_fixtures:
                    if f.group_letter == g_letter:
                        hs, as_score = f.score
                        h_id = f.home_team.team_id if f.home_team else None
                        a_id = f.away_team.team_id if f.away_team else None
                        if h_id and h_id in g_table and a_id and a_id in g_table:
                            g_table[h_id]["P"] += 1
                            g_table[a_id]["P"] += 1
                            g_table[h_id]["GF"] += hs
                            g_table[h_id]["GA"] += as_score
                            g_table[a_id]["GF"] += as_score
                            g_table[a_id]["GA"] += hs
                            if hs > as_score:
                                g_table[h_id]["W"] += 1
                                g_table[h_id]["Pts"] += 3
                                g_table[a_id]["L"] += 1
                            elif hs < as_score:
                                g_table[a_id]["W"] += 1
                                g_table[a_id]["Pts"] += 3
                                g_table[h_id]["L"] += 1
                            else:
                                g_table[h_id]["D"] += 1
                                g_table[a_id]["D"] += 1
                                g_table[h_id]["Pts"] += 1
                                g_table[a_id]["Pts"] += 1
                rows = list(g_table.values())
                for r in rows:
                    r["GD"] = r["GF"] - r["GA"]
                rows.sort(key=lambda x: (x["Pts"], x["GD"], x["GF"]), reverse=True)
                for idx, r in enumerate(rows, 1):
                    r["pos"] = idx
                standings_tables.append({
                    "title": f"Group {g_letter} Table",
                    "rows": rows,
                })

    top_scorers = []
    for (p_name, t_name), g_count in sorted(player_goals.items(), key=lambda x: x[1], reverse=True)[:10]:
        top_scorers.append({
            "name": p_name,
            "team": t_name,
            "goals": g_count,
            "assists": player_assists.get((p_name, t_name), 0),
        })

    discipline_list = []
    all_card_players = set(player_yellows.keys()) | set(player_reds.keys())
    for (p_name, t_name) in all_card_players:
        y = player_yellows.get((p_name, t_name), 0)
        r = player_reds.get((p_name, t_name), 0)
        discipline_list.append({
            "name": p_name,
            "team": t_name,
            "yellows": y,
            "reds": r,
            "points": (r * 3) + y,
        })
    discipline_list.sort(key=lambda x: (x["reds"], x["yellows"]), reverse=True)
    top_discipline = discipline_list[:10]

    return {
        "category": category,
        "category_name": category.label,
        "category_key": category.key,
        "mode": category.mode,
        "mode_display": "LEAGUE CHAMPIONSHIP" if category.mode == "league" else "CUP TOURNAMENT",
        "format_display": (category.format or "standard").upper(),
        "is_ended": bool(category.is_ended),
        "status_badge": "ARCHIVED / CONCLUDED" if category.is_ended else "ACTIVE COMPETITION",
        "generated_at": timezone.now().strftime("%B %d, %Y - %H:%M"),
        "total_teams": len(teams),
        "total_fixtures": total_fixtures,
        "played_fixtures": played_count,
        "scheduled_fixtures": scheduled_count,
        "total_goals": total_goals,
        "champion_team": category.champion_team,
        "runner_up_team": category.runner_up_team,
        "standings_tables": standings_tables,
        "fixtures": formatted_fixtures,
        "top_scorers": top_scorers,
        "top_discipline": top_discipline,
        "venue": cat_venue,
        "referees": [r.name for r in category.referees.all().order_by("name")],
    }


# ==============================================================================
# DUTY ROSTER SERVICES
# ==============================================================================

def get_category_completed_duty_player_ids(duty_roster):
    """Return set of permanent player IDs who have completed at least one duty."""
    if not isinstance(duty_roster, dict):
        return set()
    completed = set()
    assignments = duty_roster.get("assignments") or {}
    for a in assignments.values():
        h = a.get("homeDuty") or {}
        if h.get("completed") and h.get("playerId"):
            completed.add(str(h["playerId"]))
        aw = a.get("awayDuty") or {}
        if aw.get("completed") and aw.get("playerId"):
            completed.add(str(aw["playerId"]))
    return completed


def get_category_duty_exempted_player_ids(duty_roster):
    """Return set of permanent player IDs who are currently exempted from duties."""
    if not isinstance(duty_roster, dict):
        return set()
    exemptions = duty_roster.get("exemptions") or []
    return {str(e["playerId"]) for e in exemptions if isinstance(e, dict) and e.get("playerId")}


def get_category_duty_eligible_players(category, completed_player_ids=None, exempted_player_ids=None):
    """
    Return dictionary mapping team_id to:
      - 'available': players who have NOT completed duty yet AND are NOT exempted
      - 'completed': players who have completed duty
      - 'exempted': players who are currently on the exemption list
      - 'all': all valid players
    This directly enforces:
      1. 'if a player has been ticked remove from list'
      2. 'the system should not select a player for duty if they appear in the exemption list'
    """
    duty_roster = (category.schedule_days or {}).get("duty_roster") or {}
    if completed_player_ids is None:
        completed_player_ids = get_category_completed_duty_player_ids(duty_roster)
    if exempted_player_ids is None:
        exempted_player_ids = get_category_duty_exempted_player_ids(duty_roster)

    teams = list(category.teams.all().prefetch_related("players"))
    eligible_map = {}
    for t in teams:
        all_players = [
            p for p in t.players.all().order_by("id")
            if not p.is_unknown and p.name != "Unrecorded scorer"
        ]
        completed_list = [p for p in all_players if p.player_id in completed_player_ids]
        exempted_list = [p for p in all_players if p.player_id in exempted_player_ids]
        available_list = [
            p for p in all_players
            if p.player_id not in completed_player_ids and p.player_id not in exempted_player_ids
        ]

        eligible_map[t.team_id] = {
            "team_id": t.team_id,
            "team_name": t.name,
            "available": [p.to_dict() for p in available_list],
            "completed": [p.to_dict() for p in completed_list],
            "exempted": [p.to_dict() for p in exempted_list],
            "all": [p.to_dict() for p in all_players],
        }
    return eligible_map


def build_category_duty_roster(category, force_regenerate=False):
    """
    Build or refresh duty roster for the category.
    Rules:
      - Chronological order of calendar playing days.
      - 1st match of the day: 2 opposing players assigned to wash team bibs.
      - 2nd match of the day: 2 opposing players assigned to take side goalpost to the store.
      - Ticked players have completed: True.
      - Ticked players are excluded from selection lists for remaining duties.
      - Exempted players are NEVER selected for duty and replaced if currently assigned to uncompleted tasks.
    """
    from collections import defaultdict

    existing_schedule_days = category.schedule_days if isinstance(category.schedule_days, dict) else {}
    existing_roster = existing_schedule_days.get("duty_roster") or {}
    existing_assignments = existing_roster.get("assignments") or {}
    exemptions = existing_roster.get("exemptions") or []
    exempted_ids = get_category_duty_exempted_player_ids(existing_roster)

    fixtures_list = list(category.fixtures.all())
    fixtures_list.sort(key=fixture_sort_key)

    days_map = defaultdict(list)
    for f in fixtures_list:
        raw_date = f.date or "TBD"
        parts = raw_date.split(" · ")
        day_str = parts[0].strip() if len(parts) > 1 else raw_date
        days_map[day_str].append(f)

    # Gather team players
    teams = list(category.teams.all().prefetch_related("players"))
    team_obj_map = {t.team_id: t for t in teams}
    team_players_map = {}
    for t in teams:
        valid_players = [
            p for p in t.players.all().order_by("id")
            if not p.is_unknown and p.name != "Unrecorded scorer"
        ]
        team_players_map[t.team_id] = valid_players

    # Track completed player IDs from existing assignments
    completed_ids = set()
    if not force_regenerate:
        completed_ids = get_category_completed_duty_player_ids(existing_roster)

    # Track assignments pointer for each team
    team_assignment_ptrs = {t.team_id: 0 for t in teams}

    new_assignments = {}
    structured_days = []

    for day_str, day_matches in days_map.items():
        day_matches_structured = []
        for order_idx, f in enumerate(day_matches, 1):
            duty_type = "bibs" if order_idx == 1 else "goalpost"
            duty_label = "Wash Team Bibs" if order_idx == 1 else "Take Side Goalpost From & Back to Store"

            h_t = f.home_team
            a_t = f.away_team
            h_id = h_t.team_id if h_t else ""
            a_id = a_t.team_id if a_t else ""
            h_name = h_t.name if h_t else "Home Team"
            a_name = a_t.name if a_t else "Away Team"

            h_task = f"Wash {h_name} Bibs" if duty_type == "bibs" else f"Take {h_name} Side Goalpost from and back to the Store"
            a_task = f"Wash {a_name} Bibs" if duty_type == "bibs" else f"Take {a_name} Side Goalpost from and back to the Store"

            ex = existing_assignments.get(f.fixture_id) if not force_regenerate else None

            # Resolve Home duty
            h_duty = None
            if ex and ex.get("homeDuty") and ex["homeDuty"].get("playerId"):
                h_p_id = str(ex["homeDuty"]["playerId"])
                h_is_done = bool(ex["homeDuty"].get("completed"))
                # If player is now exempted and duty is not yet completed, reassign!
                if h_p_id in exempted_ids and not h_is_done:
                    h_duty = None
                else:
                    h_duty = dict(ex["homeDuty"])
                    h_duty["task"] = h_task  # ensure canonical task description

            if not h_duty:
                # Pick next eligible unticked & non-exempt player for home team
                h_players = team_players_map.get(h_id, [])
                unticked_nonexempt_h = [
                    p for p in h_players
                    if p.player_id not in completed_ids and p.player_id not in exempted_ids
                ]
                # If all unticked are exhausted, pick any non-exempt player
                nonexempt_h = [p for p in h_players if p.player_id not in exempted_ids]
                pool = unticked_nonexempt_h if unticked_nonexempt_h else nonexempt_h
                picked_p = pool[team_assignment_ptrs[h_id] % len(pool)] if pool else None
                team_assignment_ptrs[h_id] += 1
                is_comp = bool(f.played)
                h_duty = {
                    "playerId": picked_p.player_id if picked_p else None,
                    "playerName": picked_p.name if picked_p else "",
                    "task": h_task,
                    "completed": is_comp,
                    "completedAt": timezone.now().isoformat() if is_comp else None,
                }
                if is_comp and picked_p:
                    completed_ids.add(str(picked_p.player_id))

            # Resolve Away duty
            a_duty = None
            if ex and ex.get("awayDuty") and ex["awayDuty"].get("playerId"):
                a_p_id = str(ex["awayDuty"]["playerId"])
                a_is_done = bool(ex["awayDuty"].get("completed"))
                # If player is now exempted and duty is not yet completed, reassign!
                if a_p_id in exempted_ids and not a_is_done:
                    a_duty = None
                else:
                    a_duty = dict(ex["awayDuty"])
                    a_duty["task"] = a_task  # ensure canonical task description

            if not a_duty:
                # Pick next eligible unticked & non-exempt player for away team
                a_players = team_players_map.get(a_id, [])
                unticked_nonexempt_a = [
                    p for p in a_players
                    if p.player_id not in completed_ids and p.player_id not in exempted_ids
                ]
                nonexempt_a = [p for p in a_players if p.player_id not in exempted_ids]
                pool = unticked_nonexempt_a if unticked_nonexempt_a else nonexempt_a
                picked_p = pool[team_assignment_ptrs[a_id] % len(pool)] if pool else None
                team_assignment_ptrs[a_id] += 1
                is_comp = bool(f.played)
                a_duty = {
                    "playerId": picked_p.player_id if picked_p else None,
                    "playerName": picked_p.name if picked_p else "",
                    "task": a_task,
                    "completed": is_comp,
                    "completedAt": timezone.now().isoformat() if is_comp else None,
                }
                if is_comp and picked_p:
                    completed_ids.add(str(picked_p.player_id))

            assignment_entry = {
                "fixtureId": f.fixture_id,
                "date": f.date,
                "dayString": day_str,
                "orderOfDay": order_idx,
                "dutyType": duty_type,
                "dutyLabel": duty_label,
                "homeTeamId": h_id,
                "homeTeamName": h_name,
                "homeDuty": h_duty,
                "awayTeamId": a_id,
                "awayTeamName": a_name,
                "awayDuty": a_duty,
            }
            new_assignments[f.fixture_id] = assignment_entry

            day_matches_structured.append({
                "fixtureId": f.fixture_id,
                "date": f.date,
                "orderOfDay": order_idx,
                "dutyType": duty_type,
                "dutyLabel": duty_label,
                "homeTeam": {
                    "id": h_id,
                    "name": h_name,
                    "duty": h_duty,
                },
                "awayTeam": {
                    "id": a_id,
                    "name": a_name,
                    "duty": a_duty,
                },
            })

        structured_days.append({
            "dayString": day_str,
            "matches": day_matches_structured,
        })

    # Summary metrics
    final_completed_ids = sorted(list(get_category_completed_duty_player_ids({"assignments": new_assignments})))
    total_duties = len(new_assignments) * 2
    comp_count = sum(
        (1 if a["homeDuty"].get("completed") else 0) + (1 if a["awayDuty"].get("completed") else 0)
        for a in new_assignments.values()
    )

    roster_data = {
        "categoryKey": category.key,
        "updatedAt": timezone.now().isoformat(),
        "exemptions": exemptions,
        "days": structured_days,
        "assignments": new_assignments,
        "completedPlayerIds": final_completed_ids,
        "summary": {
            "totalDuties": total_duties,
            "completedDuties": comp_count,
            "pendingDuties": max(0, total_duties - comp_count),
            "exemptedCount": len(exemptions),
        },
    }

    # Save to category.schedule_days
    existing_schedule_days["duty_roster"] = roster_data
    category.schedule_days = existing_schedule_days
    category.save(update_fields=["schedule_days"])
    return roster_data


def add_duty_roster_exemption(category, player_id, reason=""):
    """
    Exempt a player from all duties.
    Adds them to duty_roster['exemptions'], and replaces any uncompleted duty assignments
    for this player with an eligible non-exempt teammate.
    """
    player = Player.objects.filter(team__category=category, player_id=player_id).select_related("team").first()
    if not player:
        raise ValueError(f"Player '{player_id}' not found in category '{category.key}'.")

    existing_schedule_days = category.schedule_days if isinstance(category.schedule_days, dict) else {}
    roster = existing_schedule_days.get("duty_roster") or build_category_duty_roster(category, force_regenerate=False)
    exemptions = roster.get("exemptions") or []

    # Check if already present
    existing = next((e for e in exemptions if str(e.get("playerId")) == str(player.player_id)), None)
    if existing:
        existing["reason"] = reason.strip() or existing.get("reason", "Exempted")
        existing["exemptedAt"] = timezone.now().isoformat()
    else:
        exemptions.append({
            "playerId": player.player_id,
            "playerName": player.name,
            "teamId": player.team.team_id,
            "teamName": player.team.name,
            "reason": reason.strip() or "Exempted by Admin",
            "exemptedAt": timezone.now().isoformat(),
        })

    roster["exemptions"] = exemptions
    existing_schedule_days["duty_roster"] = roster
    category.schedule_days = existing_schedule_days
    category.save(update_fields=["schedule_days"])

    # Rebuild roster to replace any uncompleted assignments of this newly exempted player
    return build_category_duty_roster(category, force_regenerate=False)


def remove_duty_roster_exemption(category, player_id):
    """
    Remove an exemption for a player, returning them to the active rotation pool.
    """
    existing_schedule_days = category.schedule_days if isinstance(category.schedule_days, dict) else {}
    roster = existing_schedule_days.get("duty_roster") or build_category_duty_roster(category, force_regenerate=False)
    exemptions = roster.get("exemptions") or []
    roster["exemptions"] = [e for e in exemptions if str(e.get("playerId")) != str(player_id)]

    existing_schedule_days["duty_roster"] = roster
    category.schedule_days = existing_schedule_days
    category.save(update_fields=["schedule_days"])
    return build_category_duty_roster(category, force_regenerate=False)


def update_duty_roster_assignment(category, fixture_id, side, player_id=None, player_name=None, completed=None):
    """
    Update or tick a specific duty assignment in the category duty roster.
    side must be 'home' or 'away'.
    completed: bool (if True, marks done and removes player from selectable list).
    """
    if side not in ("home", "away"):
        raise ValueError(f"Invalid side '{side}'; must be 'home' or 'away'.")

    # Ensure roster exists
    roster_data = build_category_duty_roster(category, force_regenerate=False)
    assignments = roster_data.get("assignments") or {}
    if fixture_id not in assignments:
        raise ValueError(f"Fixture '{fixture_id}' not found in duty roster.")

    # Validate exemption constraint
    exempted_ids = get_category_duty_exempted_player_ids(roster_data)
    if player_id and str(player_id) in exempted_ids:
        raise ValueError(f"Player {player_id} is on the duty exemption list and cannot be selected for duty.")

    entry = assignments[fixture_id]
    target_key = "homeDuty" if side == "home" else "awayDuty"
    target_duty = entry.get(target_key) or {}

    if player_id is not None:
        target_duty["playerId"] = str(player_id) if player_id else None
        if player_name is not None:
            target_duty["playerName"] = str(player_name)
        elif player_id:
            p_obj = Player.objects.filter(category=category, player_id=player_id).first()
            if p_obj:
                target_duty["playerName"] = p_obj.name

    if completed is not None:
        is_done = bool(completed)
        target_duty["completed"] = is_done
        target_duty["completedAt"] = timezone.now().isoformat() if is_done else None

    entry[target_key] = target_duty
    assignments[fixture_id] = entry

    # Rebuild days structure and recalculate completedPlayerIds
    final_completed_ids = sorted(list(get_category_completed_duty_player_ids({"assignments": assignments})))
    total_duties = len(assignments) * 2
    comp_count = sum(
        (1 if a.get("homeDuty", {}).get("completed") else 0) + (1 if a.get("awayDuty", {}).get("completed") else 0)
        for a in assignments.values()
    )

    # Sync back into structured days
    days = roster_data.get("days") or []
    for d in days:
        for m in d.get("matches", []):
            if m.get("fixtureId") == fixture_id:
                if side == "home":
                    m["homeTeam"]["duty"] = target_duty
                else:
                    m["awayTeam"]["duty"] = target_duty

    roster_data["updatedAt"] = timezone.now().isoformat()
    roster_data["assignments"] = assignments
    roster_data["days"] = days
    roster_data["completedPlayerIds"] = final_completed_ids
    roster_data["summary"] = {
        "totalDuties": total_duties,
        "completedDuties": comp_count,
        "pendingDuties": max(0, total_duties - comp_count),
    }

    # Save to category.schedule_days
    schedule_days = category.schedule_days if isinstance(category.schedule_days, dict) else {}
    schedule_days["duty_roster"] = roster_data
    category.schedule_days = schedule_days
    category.save(update_fields=["schedule_days"])
    return roster_data


def compute_weekly_mvps(category, reference_dt=None, force=False):
    """
    Computes and persists the Weekly MVP for every matchweek in the category.
    Each week's window ends on Saturday at 8:00 PM (20:00:00).
    - If Saturday 8:00 PM has already elapsed relative to reference_dt (or now),
      the week is finalized as the official Weekly MVP.
    - If Saturday 8:00 PM is in the future, the week is provisional/in-progress.
    - Awards points based on goals (4), assists (3), clean sheets (4), MOTM awards (5),
      TOTW votes (1), and disciplinary penalties (yellow: -1, red: -3).
    """
    import datetime
    from collections import defaultdict

    if reference_dt is None:
        reference_dt = timezone.now()

    all_fixtures = list(
        category.fixtures.all().prefetch_related(
            "events", "events__player", "events__assist_player", "events__team",
            "home_team", "away_team", "walkover_winner"
        )
    )
    if not all_fixtures:
        return {
            "category_key": category.key,
            "current_mvp": None,
            "latest_ended_week": None,
            "history": [],
            "next_update": None,
        }

    # Partition fixtures by Saturday 8:00 PM cutoffs
    week_groups = defaultdict(list)
    for f in all_fixtures:
        k = parse_fixture_date_key(f.date)
        if k[0] == 0:
            dt = datetime.datetime(k[1], k[2], k[3], k[4], k[5])
            days_to_sat = (5 - dt.weekday()) % 7
            sat_date = dt.date() + datetime.timedelta(days=days_to_sat)
            sat_cutoff = datetime.datetime(sat_date.year, sat_date.month, sat_date.day, 20, 0)
            if timezone.is_aware(reference_dt):
                sat_cutoff = timezone.make_aware(sat_cutoff, timezone.get_current_timezone())
            week_groups[sat_cutoff].append(f)

    sorted_cutoffs = sorted(week_groups.keys())

    # Fallback if dates were unparseable: group into chunks of 8
    if not sorted_cutoffs:
        sorted_fixtures = sorted(all_fixtures, key=fixture_sort_key)
        chunk_size = 8
        base_sat = reference_dt.date() + datetime.timedelta(days=(5 - reference_dt.weekday()) % 7)
        for i in range(0, len(sorted_fixtures), chunk_size):
            sat_date = base_sat + datetime.timedelta(weeks=i // chunk_size)
            sat_cutoff = datetime.datetime(sat_date.year, sat_date.month, sat_date.day, 20, 0)
            if timezone.is_aware(reference_dt):
                sat_cutoff = timezone.make_aware(sat_cutoff, timezone.get_current_timezone())
            sorted_cutoffs.append(sat_cutoff)
            week_groups[sat_cutoff] = sorted_fixtures[i:i + chunk_size]

    voting_rounds_by_week = {
        vr.week_number: vr for vr in VotingRound.objects.filter(category=category)
    }

    created_or_updated = []
    latest_finalized_mvp = None
    next_sat_cutoff = None

    for week_num, sat_cutoff in enumerate(sorted_cutoffs, start=1):
        f_list = week_groups[sat_cutoff]
        is_finalized = sat_cutoff <= reference_dt
        if not is_finalized and next_sat_cutoff is None:
            next_sat_cutoff = sat_cutoff

        # Check existing MVP
        existing = WeeklyMVP.objects.filter(category=category, week_number=week_num).first()
        if existing and existing.is_manual_override and not force:
            created_or_updated.append(existing)
            if existing.is_finalized:
                latest_finalized_mvp = existing
            continue

        # Aggregate player stats across completed matches in this week
        player_stats = defaultdict(lambda: {
            "player": None,
            "team": None,
            "goals": 0,
            "assists": 0,
            "yellows": 0,
            "reds": 0,
            "clean_sheets": 0,
            "motm_awards": 0,
            "votes": 0,
        })

        completed_fixtures = [
            f for f in f_list if (f.played or f.walkover_winner or f.events.exists())
        ]

        for f in completed_fixtures:
            h_score, a_score = f.score
            motm_name = (f.report or {}).get("motm", "").strip().lower()

            for ev in f.events.all():
                if ev.event_type in ("goal", "penalty") and ev.player:
                    p_entry = player_stats[ev.player.id]
                    p_entry["player"] = ev.player
                    p_entry["team"] = ev.team or ev.player.team
                    p_entry["goals"] += 1
                elif ev.assist_player:
                    p_entry = player_stats[ev.assist_player.id]
                    p_entry["player"] = ev.assist_player
                    p_entry["team"] = ev.assist_player.team
                    p_entry["assists"] += 1
                elif ev.event_type == "yellow" and ev.player:
                    p_entry = player_stats[ev.player.id]
                    p_entry["player"] = ev.player
                    p_entry["team"] = ev.player.team
                    p_entry["yellows"] += 1
                elif ev.event_type == "red" and ev.player:
                    p_entry = player_stats[ev.player.id]
                    p_entry["player"] = ev.player
                    p_entry["team"] = ev.player.team
                    p_entry["reds"] += 1

                if ev.player and motm_name and motm_name in (ev.player.name or "").lower():
                    player_stats[ev.player.id]["motm_awards"] += 1

            # Clean sheet bonus
            if a_score == 0 and f.home_team:
                for p in f.home_team.players.filter(position__in=["GK", "LB", "CB", "RB", "DEF"]):
                    if not p.is_unknown:
                        p_entry = player_stats[p.id]
                        p_entry["player"] = p
                        p_entry["team"] = f.home_team
                        p_entry["clean_sheets"] += 1
            if h_score == 0 and f.away_team:
                for p in f.away_team.players.filter(position__in=["GK", "LB", "CB", "RB", "DEF"]):
                    if not p.is_unknown:
                        p_entry = player_stats[p.id]
                        p_entry["player"] = p
                        p_entry["team"] = f.away_team
                        p_entry["clean_sheets"] += 1

        # Add votes from VotingRound
        v_round = voting_rounds_by_week.get(week_num)
        if v_round:
            vote_counts = (
                PositionVote.objects.filter(voting_round=v_round)
                .values("player_id")
                .annotate(cnt=Count("id"))
            )
            for vc in vote_counts:
                pid = vc["player_id"]
                try:
                    p_obj = Player.objects.get(id=pid)
                    p_entry = player_stats[p_obj.id]
                    p_entry["player"] = p_obj
                    p_entry["team"] = p_obj.team
                    p_entry["votes"] += vc["cnt"]
                except Player.DoesNotExist:
                    pass

        chosen_entry = None
        if player_stats:
            for p_id, data in player_stats.items():
                pts = (
                    (data["goals"] * 4.0)
                    + (data["assists"] * 3.0)
                    + (data["clean_sheets"] * 4.0)
                    + (data["motm_awards"] * 5.0)
                    + (data["votes"] * 1.0)
                    - (data["yellows"] * 1.0)
                    - (data["reds"] * 3.0)
                )
                data["points"] = round(pts, 1)

            sorted_candidates = sorted(
                player_stats.values(),
                key=lambda x: (x["points"], x["goals"], x["assists"]),
                reverse=True
            )
            if sorted_candidates and sorted_candidates[0]["player"]:
                chosen_entry = sorted_candidates[0]

        if not chosen_entry:
            # Week has not yet started or has no completed fixtures/points:
            # Do NOT assign a player; indicate To Be Announced.
            week_date_obj = sat_cutoff.date() if isinstance(sat_cutoff, datetime.datetime) else sat_cutoff
            mvp_obj, _ = WeeklyMVP.objects.update_or_create(
                category=category,
                week_number=week_num,
                defaults={
                    "week_title": f"Matchweek {week_num}",
                    "week_ending_date": week_date_obj,
                    "cutoff_datetime": sat_cutoff,
                    "player": None,
                    "team": None,
                    "goals": 0,
                    "assists": 0,
                    "clean_sheets": 0,
                    "yellows": 0,
                    "reds": 0,
                    "motm_awards": 0,
                    "points": 0.0,
                    "rationale": f"Matchweek {week_num} fixtures have not yet started. The Weekly MVP will be announced on Saturday at 8:00 PM once matches are underway.",
                    "is_finalized": False,
                }
            )
            created_or_updated.append(mvp_obj)
            continue

        player_obj = chosen_entry["player"]
        team_obj = chosen_entry["team"] or player_obj.team
        p_name = player_obj.first_name or player_obj.username or player_obj.name

        g = chosen_entry["goals"]
        a = chosen_entry["assists"]
        pts = chosen_entry["points"]

        if g > 0 and a > 0:
            rationale = f"Electric display registering {g} goal{'s' if g > 1 else ''} and {a} assist{'s' if a > 1 else ''} ({pts} pts) to lead {team_obj.name} in Matchweek {week_num}."
        elif g > 0:
            rationale = f"Clinical attacking output with {g} goal{'s' if g > 1 else ''} ({pts} pts) spearheading {team_obj.name}'s frontline in Matchweek {week_num}."
        elif a > 0:
            rationale = f"Masterclass in midfield delivery with {a} assist{'s' if a > 1 else ''} ({pts} pts) creating decisive scoring opportunities for {team_obj.name} in Matchweek {week_num}."
        elif chosen_entry["clean_sheets"] > 0:
            rationale = f"Impenetrable defensive leadership keeping a clean sheet ({pts} pts) to anchor {team_obj.name} in Matchweek {week_num}."
        else:
            rationale = f"Disciplined tactical tempo and leadership ({pts} pts) setting the standard for {team_obj.name} in Matchweek {week_num}."

        week_date_obj = sat_cutoff.date() if isinstance(sat_cutoff, datetime.datetime) else sat_cutoff

        mvp_obj, _ = WeeklyMVP.objects.update_or_create(
            category=category,
            week_number=week_num,
            defaults={
                "week_title": f"Matchweek {week_num}",
                "week_ending_date": week_date_obj,
                "cutoff_datetime": sat_cutoff,
                "player": player_obj,
                "team": team_obj,
                "goals": g,
                "assists": a,
                "clean_sheets": chosen_entry["clean_sheets"],
                "yellows": chosen_entry["yellows"],
                "reds": chosen_entry["reds"],
                "motm_awards": chosen_entry["motm_awards"],
                "points": pts,
                "rationale": rationale,
                "is_finalized": is_finalized,
            }
        )
        created_or_updated.append(mvp_obj)
        if is_finalized and player_obj is not None:
            latest_finalized_mvp = mvp_obj

    if next_sat_cutoff is None:
        days_to_sat = (5 - reference_dt.weekday()) % 7
        if days_to_sat == 0 and reference_dt.hour >= 20:
            days_to_sat = 7
        next_sat_date = reference_dt.date() + datetime.timedelta(days=days_to_sat)
        next_sat_cutoff = datetime.datetime(next_sat_date.year, next_sat_date.month, next_sat_date.day, 20, 0)
        if timezone.is_aware(reference_dt):
            next_sat_cutoff = timezone.make_aware(next_sat_cutoff, timezone.get_current_timezone())

    history = [m.to_dict() for m in created_or_updated]

    # Current MVP selection:
    # 1. Latest finalized week with an announced player
    # 2. Otherwise in-progress week with an active candidate player
    # 3. Otherwise Matchweek 1 TBA if no week has started yet
    latest_announced = next((m for m in reversed(created_or_updated) if m.is_finalized and m.player_id), None)
    in_progress = next((m for m in created_or_updated if not m.is_finalized and m.player_id), None)

    if latest_announced:
        current_mvp = latest_announced.to_dict()
    elif in_progress:
        current_mvp = in_progress.to_dict()
    elif history:
        current_mvp = history[0]
    else:
        current_mvp = None

    return {
        "category_key": category.key,
        "as_of": reference_dt.isoformat(),
        "current_mvp": current_mvp,
        "latest_ended_week": latest_announced.week_number if latest_announced else None,
        "history": history,
        "next_update": next_sat_cutoff.strftime("Saturday at 8:00 PM (%d %b)"),
        "next_cutoff_iso": next_sat_cutoff.isoformat() if next_sat_cutoff else None,
    }


def get_weekly_mvp_summary(category, auto_compute=True):
    """
    Returns the Weekly MVP summary for a category.
    Auto-computes if records are missing or if a Saturday 8:00 PM cutoff has elapsed.
    """
    import datetime
    existing_qs = WeeklyMVP.objects.filter(category=category).order_by("week_number")
    now = timezone.now()

    needs_compute = not existing_qs.exists()
    if not needs_compute and auto_compute:
        latest_finalized = existing_qs.filter(is_finalized=True).last()
        if latest_finalized and latest_finalized.cutoff_datetime:
            if now > latest_finalized.cutoff_datetime + datetime.timedelta(days=7):
                needs_compute = True

    if needs_compute and auto_compute:
        return compute_weekly_mvps(category, reference_dt=now)

    history = [m.to_dict() for m in existing_qs]
    latest_finalized = existing_qs.filter(is_finalized=True, player__isnull=False).last()
    in_progress = existing_qs.filter(is_finalized=False, player__isnull=False).first()
    if latest_finalized:
        current_mvp = latest_finalized.to_dict()
    elif in_progress:
        current_mvp = in_progress.to_dict()
    elif history:
        current_mvp = history[0]
    else:
        current_mvp = None

    days_to_sat = (5 - now.weekday()) % 7
    if days_to_sat == 0 and now.hour >= 20:
        days_to_sat = 7
    next_sat_date = now.date() + datetime.timedelta(days=days_to_sat)
    next_sat_cutoff = datetime.datetime(next_sat_date.year, next_sat_date.month, next_sat_date.day, 20, 0)
    if timezone.is_aware(now):
        next_sat_cutoff = timezone.make_aware(next_sat_cutoff, timezone.get_current_timezone())

    return {
        "category_key": category.key,
        "as_of": now.isoformat(),
        "current_mvp": current_mvp,
        "latest_ended_week": latest_finalized.week_number if latest_finalized else None,
        "history": history,
        "next_update": next_sat_cutoff.strftime("Saturday at 8:00 PM (%d %b)"),
        "next_cutoff_iso": next_sat_cutoff.isoformat(),
    }




