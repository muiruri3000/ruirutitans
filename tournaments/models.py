from django.db import models
from django.utils.text import slugify


class GlobalSettings(models.Model):
    active_category_key = models.CharField(max_length=64, default="open")
    homepage_data = models.JSONField(default=dict, blank=True)

    class Meta:
        verbose_name = "Global Tournament Setting"
        verbose_name_plural = "Global Tournament Settings"

    def __str__(self):
        return f"Active Category: {self.active_category_key}"


class Category(models.Model):
    MODE_CHOICES = [
        ("league", "League (Round Robin)"),
        ("cup", "Cup (Groups + Knockout)"),
    ]
    FORMAT_CHOICES = [
        ("single", "Single Round-Robin"),
        ("double", "Double Round-Robin"),
    ]

    key = models.SlugField(max_length=64, unique=True, primary_key=True)
    label = models.CharField(max_length=128)
    mode = models.CharField(max_length=16, choices=MODE_CHOICES, default="league")
    format = models.CharField(max_length=16, choices=FORMAT_CHOICES, default="double")
    note = models.TextField(blank=True, default="")
    schedule_time = models.CharField(max_length=16, default="18:00")
    schedule_days = models.JSONField(default=dict, blank=True)
    group_letters = models.JSONField(default=list, blank=True)
    group_of = models.JSONField(default=dict, blank=True)
    rounds_data = models.JSONField(default=list, blank=True, null=True)
    voting_team_size = models.PositiveSmallIntegerField(default=6)
    voting_max_picks = models.PositiveSmallIntegerField(default=2)
    voting_include_gk = models.BooleanField(default=True)
    is_ended = models.BooleanField(default=False)
    ended_at = models.DateTimeField(null=True, blank=True)
    champion_team = models.CharField(max_length=128, blank=True, default="")
    runner_up_team = models.CharField(max_length=128, blank=True, default="")
    is_deleted = models.BooleanField(default=False)
    deleted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Category / Tournament"
        verbose_name_plural = "Categories / Tournaments"
        ordering = ["key"]

    def __init__(self, *args, **kwargs):
        schedule = kwargs.pop("schedule", None)
        super().__init__(*args, **kwargs)
        if schedule is not None:
            self.schedule = schedule

    @property
    def schedule(self):
        days = self.schedule_days
        matches_per_day = 1
        start_date = None
        venue = "Thoome Pri."
        if isinstance(days, dict):
            if "matches_per_day" in days:
                matches_per_day = days.get("matches_per_day", 1)
            start_date = days.get("startDate") or days.get("start_date")
            venue = days.get("venue") or venue
            if "days" in days:
                days = days.get("days", days)
        res = {
            "time": self.schedule_time or "18:00",
            "days": days or {3: 1, 4: 1, 5: 1, 6: 1},
            "matches_per_day": matches_per_day,
            "venue": venue,
        }
        if start_date:
            res["startDate"] = start_date
            res["start_date"] = start_date
        return res

    @schedule.setter
    def schedule(self, val):
        if isinstance(val, dict):
            if "time" in val:
                self.schedule_time = val.get("time") or "18:00"
            days = val.get("days", {})
            mpd = val.get("matches_per_day") or val.get("fixtures_per_day")
            start_date = val.get("startDate") or val.get("start_date")
            venue = val.get("venue") or "Thoome Pri."
            data = {"days": days, "venue": venue}
            if mpd is not None:
                data["matches_per_day"] = int(mpd)
            if start_date:
                data["startDate"] = str(start_date)
                data["start_date"] = str(start_date)
            self.schedule_days = data

    def __str__(self):
        suffix = " [SOFT-DELETED]" if self.is_deleted else ""
        return f"{self.label} ({self.get_mode_display()}){suffix}"

    def to_state_dict(self):
        """Serialize category to match frontend state format."""
        teams_data = [t.to_dict() for t in self.teams.all().order_by("id")]
        referees_list = [r.name for r in self.referees.all().order_by("id")]

        schedule = self.schedule
        voting_config = {
            "team_size": self.voting_team_size or 6,
            "max_picks_per_position": self.voting_max_picks or 2,
            "include_gk": bool(self.voting_include_gk),
        }

        if self.mode == "league":
            fixtures_data = [f.to_dict() for f in self.fixtures.filter(phase="league").order_by("id")]
            return {
                "label": self.label,
                "mode": "league",
                "format": self.format,
                "note": self.note,
                "teams": teams_data,
                "fixtures": fixtures_data,
                "schedule": schedule,
                "referees": referees_list,
                "votingConfig": voting_config,
                "isEnded": bool(self.is_ended),
                "endedAt": self.ended_at.isoformat() if self.ended_at else None,
                "championTeam": self.champion_team or "",
                "runnerUpTeam": self.runner_up_team or "",
                "isDeleted": bool(self.is_deleted),
                "deletedAt": self.deleted_at.isoformat() if self.deleted_at else None,
            }
        else:
            # Cup mode: organize group fixtures and knockout rounds
            group_fixtures = {}
            for letter in self.group_letters or []:
                group_fixtures[letter] = [
                    f.to_dict()
                    for f in self.fixtures.filter(phase="group", group_letter=letter).order_by("id")
                ]
            all_cup_fixtures = [
                f.to_dict()
                for f in self.fixtures.filter(home_team__isnull=False, away_team__isnull=False).order_by("id")
            ]

            return {
                "label": self.label,
                "mode": "cup",
                "teams": teams_data,
                "fixtures": all_cup_fixtures,
                "groupLetters": self.group_letters or [],
                "groupOf": self.group_of or {},
                "groupFixtures": group_fixtures,
                "rounds": self.rounds_data or None,
                "schedule": schedule,
                "referees": referees_list,
                "note": self.note,
                "votingConfig": voting_config,
                "isEnded": bool(self.is_ended),
                "endedAt": self.ended_at.isoformat() if self.ended_at else None,
                "championTeam": self.champion_team or "",
                "runnerUpTeam": self.runner_up_team or "",
                "isDeleted": bool(self.is_deleted),
                "deletedAt": self.deleted_at.isoformat() if self.deleted_at else None,
            }


class Team(models.Model):
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="teams")
    team_id = models.CharField(max_length=32)
    name = models.CharField(max_length=128)
    color = models.CharField(max_length=16, default="#2E5A8F")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("category", "team_id")
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.team_id})"

    def to_dict(self):
        players_data = [p.to_dict() for p in self.players.all().order_by("id")]
        return {
            "id": self.team_id,
            "name": self.name,
            "color": self.color,
            "players": players_data,
        }


class Player(models.Model):
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="players")
    player_id = models.CharField(max_length=64)
    name = models.CharField(max_length=128)
    username = models.CharField(max_length=64, blank=True, default="")
    password = models.CharField(max_length=128, blank=True, default="titans2026")
    position = models.CharField(
        max_length=16,
        blank=True,
        default="",
        choices=[
            ("", "No position set"),
            ("GK", "Goalkeeper (GK)"),
            ("LB", "Left Back (LB)"),
            ("CB", "Center Back (CB)"),
            ("RB", "Right Back (RB)"),
            ("CDM", "Defensive Midfielder (CDM)"),
            ("CM", "Central Midfielder (CM)"),
            ("LW", "Left Winger (LW)"),
            ("RW", "Right Winger (RW)"),
            ("ST", "Striker (ST)"),
        ],
    )
    is_unknown = models.BooleanField(default=False)
    jersey_number = models.PositiveSmallIntegerField(null=True, blank=True)
    must_change_password = models.BooleanField(default=False)
    temp_code = models.CharField(max_length=16, blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("team", "player_id")
        ordering = ["is_unknown", "name"]

    def __str__(self):
        pos = f" [{self.position}]" if self.position else ""
        return f"{self.name}{pos} ({self.player_id}) - {self.team.name}"

    def save(self, *args, **kwargs):
        # Preserve permanent player_id once assigned, or assign a permanent unique ID on creation
        if self.pk:
            orig = Player.objects.filter(pk=self.pk).values_list("player_id", flat=True).first()
            if orig:
                self.player_id = orig
        if not self.player_id and self.team_id:
            prefix = self.team.team_id.upper()
            if self.is_unknown:
                self.player_id = f"{prefix}-UNK"
            else:
                existing_ids = set(
                    Player.objects.filter(team=self.team).values_list("player_id", flat=True)
                )
                seq = 1
                while f"{prefix}-P{seq}" in existing_ids:
                    seq += 1
                self.player_id = f"{prefix}-P{seq}"

        if not self.is_unknown:
            if not self.username:
                base_slug = slugify(self.name).replace("-", "_") or self.player_id.lower().replace("-", "_")
                self.username = base_slug
            if not self.password:
                self.password = "titans2026"
        super().save(*args, **kwargs)

    def to_dict(self):
        default_uname = self.username or (
            slugify(self.name).replace("-", "_") if not self.is_unknown else ""
        )
        res = {
            "id": self.player_id,
            "permanentId": self.player_id,
            "name": self.name,
            "username": default_uname,
            "position": self.position or "",
            "jerseyNumber": self.jersey_number,
            "mustChangePassword": bool(self.must_change_password),
            "isActive": bool(self.is_active),
        }
        if self.is_unknown:
            res["unknown"] = True
        return res


class Referee(models.Model):
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="referees")
    name = models.CharField(max_length=128)

    class Meta:
        unique_together = ("category", "name")
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} ({self.category.label})"


class Fixture(models.Model):
    PHASE_CHOICES = [
        ("league", "League"),
        ("group", "Group Stage"),
        ("knockout", "Knockout"),
    ]

    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="fixtures")
    fixture_id = models.CharField(max_length=64)
    phase = models.CharField(max_length=16, choices=PHASE_CHOICES, default="league")
    group_letter = models.CharField(max_length=8, blank=True, default="")
    round_index = models.PositiveSmallIntegerField(null=True, blank=True)
    tie_index = models.PositiveSmallIntegerField(null=True, blank=True)

    date = models.CharField(max_length=64, default="TBD")
    home_team = models.ForeignKey(
        Team, on_delete=models.SET_NULL, null=True, blank=True, related_name="home_fixtures"
    )
    away_team = models.ForeignKey(
        Team, on_delete=models.SET_NULL, null=True, blank=True, related_name="away_fixtures"
    )
    played = models.BooleanField(default=False)
    walkover_winner = models.ForeignKey(
        Team, on_delete=models.SET_NULL, null=True, blank=True, related_name="walkover_fixtures"
    )
    home_pens = models.PositiveSmallIntegerField(null=True, blank=True)
    away_pens = models.PositiveSmallIntegerField(null=True, blank=True)
    referee = models.CharField(max_length=128, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("category", "fixture_id")
        ordering = ["id"]

    def __str__(self):
        h = self.home_team.team_id if self.home_team else "TBD"
        a = self.away_team.team_id if self.away_team else "TBD"
        return f"{self.fixture_id}: {h} vs {a} ({self.date})"

    @property
    def score(self):
        """Calculate match score considering events and walkovers."""
        if self.walkover_winner_id:
            if self.home_team_id and self.walkover_winner_id == self.home_team_id:
                return 3, 0
            elif self.away_team_id and self.walkover_winner_id == self.away_team_id:
                return 0, 3

        h_goals = 0
        a_goals = 0
        for ev in self.events.all():
            if ev.event_type == "goal":
                if self.home_team_id and ev.team_id == self.home_team_id:
                    h_goals += 1
                elif self.away_team_id and ev.team_id == self.away_team_id:
                    a_goals += 1
            elif ev.event_type == "owngoal":
                # Own goal is awarded to opponent
                if self.home_team_id and ev.team_id == self.home_team_id:
                    a_goals += 1
                elif self.away_team_id and ev.team_id == self.away_team_id:
                    h_goals += 1
        return h_goals, a_goals

    def to_dict(self):
        events_data = [e.to_dict() for e in self.events.all().order_by("order", "id")]
        res = {
            "id": self.fixture_id,
            "date": self.date,
            "venue": self.category.schedule.get("venue", "Thoome Pri."),
            "home": self.home_team.team_id if self.home_team else None,
            "away": self.away_team.team_id if self.away_team else None,
            "played": self.played,
            "events": events_data,
        }
        if self.referee:
            res["referee"] = self.referee
        if self.walkover_winner:
            res["walkover"] = self.walkover_winner.team_id
        if self.home_pens is not None or self.away_pens is not None:
            res["pens"] = [self.home_pens or 0, self.away_pens or 0]
        return res


class MatchEvent(models.Model):
    EVENT_TYPES = [
        ("goal", "Goal"),
        ("owngoal", "Own Goal"),
        ("assist", "Assist"),
        ("yellow", "Yellow Card"),
        ("red", "Red Card"),
    ]

    fixture = models.ForeignKey(Fixture, on_delete=models.CASCADE, related_name="events")
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="events")
    player = models.ForeignKey(
        Player, on_delete=models.SET_NULL, null=True, blank=True, related_name="events"
    )
    event_type = models.CharField(max_length=16, choices=EVENT_TYPES)
    assist_player = models.ForeignKey(
        Player, on_delete=models.SET_NULL, null=True, blank=True, related_name="assist_events"
    )
    is_penalty = models.BooleanField(default=False)
    is_interference = models.BooleanField(default=False)
    minute = models.PositiveSmallIntegerField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        p_name = self.player.name if self.player else "Unknown"
        suffix = " [Interference]" if self.is_interference else ""
        return f"{self.get_event_type_display()} - {p_name} ({self.team.team_id}){suffix}"

    def to_dict(self):
        data = {
            "teamId": self.team.team_id,
            "team": self.team.team_id,
            "playerId": self.player.player_id if self.player else None,
            "player": self.player.player_id if self.player else None,
            "playerName": self.player.name if self.player else None,
            "type": self.event_type,
        }
        if self.event_type == "goal":
            data["assistPlayerId"] = self.assist_player.player_id if self.assist_player else None
            data["assistPlayer"] = self.assist_player.name if self.assist_player else None
            data["penalty"] = bool(self.is_penalty)
            data["is_penalty"] = bool(self.is_penalty)
        if self.is_interference:
            data["interference"] = True
            data["is_interference"] = True
        return data


class VotingRound(models.Model):
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name="voting_rounds")
    week_number = models.PositiveIntegerField(default=1)
    title = models.CharField(max_length=128, default="Week 1")
    is_open = models.BooleanField(default=True)
    opened_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-week_number", "-id"]
        verbose_name = "Voting Window / Round"
        verbose_name_plural = "Voting Windows / Rounds"

    def __str__(self):
        status = "OPEN" if self.is_open else "CLOSED"
        return f"{self.category.label} - {self.title} [{status}]"

    def get_totw(self):
        """
        Calculates the Team of the Week (TOTW) for this round featuring `voting_team_size` players.
        Respects `voting_include_gk` (excludes GK completely when False).
        Supports all official positions: GK, LB, CB, RB, CDM, CM, LW, RW, ST
        (plus legacy group keys DEF, MID, WING).
        """
        from django.db.models import Count
        pos_names = dict(PositionVote.POSITION_CHOICES)
        team_size = max(1, int(self.category.voting_team_size or 6))
        include_gk = bool(self.category.voting_include_gk)

        # Aggregate votes per player across this round
        tallies = (
            PositionVote.objects.filter(voting_round=self)
            .values("player", "position")
            .annotate(vote_count=Count("id"))
            .order_by("-vote_count")
        )

        # Group by tactical line so the TOTW is balanced across lines:
        # GK, DEF_LINE (LB, CB, RB), MID_LINE (CDM, CM), WING_LINE (LW, RW), ST_LINE (ST)
        line_map = {
            "GK": "GK",
            "LB": "DEF", "CB": "DEF", "RB": "DEF", "DEF": "DEF",
            "CDM": "MID", "CM": "MID", "MID": "MID",
            "LW": "WING", "RW": "WING", "WING": "WING",
            "ST": "ST",
        }
        ranked_by_line = {"GK": [], "DEF": [], "MID": [], "WING": [], "ST": []}
        seen_in_line = {k: set() for k in ranked_by_line}

        # Aggregate total round votes per player
        player_totals = {}
        for t in tallies:
            if not include_gk and t["position"] == "GK":
                continue
            pid = t["player"]
            player_totals[pid] = player_totals.get(pid, 0) + t["vote_count"]

        for t in sorted(tallies, key=lambda x: (-player_totals.get(x["player"], 0), -x["vote_count"])):
            p = Player.objects.filter(id=t["player"]).select_related("team").first()
            if not p:
                continue
            actual_pos = p.position if p.position in pos_names else t["position"]
            if not include_gk and actual_pos == "GK":
                continue
            line_key = line_map.get(actual_pos, "MID")
            if p.player_id not in seen_in_line[line_key]:
                seen_in_line[line_key].add(p.player_id)
                ranked_by_line[line_key].append({
                    "player": p,
                    "position": actual_pos,
                    "votes": player_totals.get(p.id, 0),
                })

        active_players = []
        used_player_ids = set()

        # 1. Outfield base picks: top 1 from DEF (LB/CB/RB), MID (CDM/CM), WING (LW/RW), ST
        outfield_lines = ["DEF", "MID", "WING", "ST"]
        for lkey in outfield_lines:
            if len(active_players) >= team_size:
                break
            cands = ranked_by_line.get(lkey, [])
            if cands and cands[0]["votes"] > 0:
                top = cands[0]
                used_player_ids.add(top["player"].player_id)
                pos_code = top["position"]
                active_players.append({
                    "position": pos_code,
                    "position_name": pos_names.get(pos_code, pos_code),
                    "slot_label": f"{pos_code} • {pos_names.get(pos_code, pos_code)}",
                    "player_id": top["player"].player_id,
                    "player_name": top["player"].name,
                    "team_id": top["player"].team.team_id,
                    "team_name": top["player"].team.name,
                    "team_color": top["player"].team.color,
                    "votes": top["votes"],
                })

        # 2. Add GK if enabled and voted
        if include_gk and len(active_players) < team_size:
            gk_candidates = ranked_by_line.get("GK", [])
            if gk_candidates and gk_candidates[0]["votes"] > 0:
                top_gk = gk_candidates[0]
                used_player_ids.add(top_gk["player"].player_id)
                active_players.append({
                    "position": "GK",
                    "position_name": "Goalkeeper",
                    "slot_label": "GK • Goalkeeper",
                    "player_id": top_gk["player"].player_id,
                    "player_name": top_gk["player"].name,
                    "team_id": top_gk["player"].team.team_id,
                    "team_name": top_gk["player"].team.name,
                    "team_color": top_gk["player"].team.color,
                    "votes": top_gk["votes"],
                })

        # 3. Fill up to `team_size` players from remaining highest-voted outfielders
        all_remaining = []
        for lkey in outfield_lines:
            for c in ranked_by_line.get(lkey, []):
                if c["player"].player_id not in used_player_ids and c["votes"] > 0:
                    all_remaining.append(c)
        all_remaining.sort(key=lambda x: -x["votes"])

        for rem in all_remaining:
            if len(active_players) >= team_size:
                break
            used_player_ids.add(rem["player"].player_id)
            pos_code = rem["position"]
            active_players.append({
                "position": pos_code,
                "position_name": pos_names.get(pos_code, pos_code),
                "slot_label": f"{pos_code} • {pos_names.get(pos_code, pos_code)}",
                "player_id": rem["player"].player_id,
                "player_name": rem["player"].name,
                "team_id": rem["player"].team.team_id,
                "team_name": rem["player"].team.name,
                "team_color": rem["player"].team.color,
                "votes": rem["votes"],
            })

        # 4. If fewer than `team_size` players have votes, fill with fallback placeholders
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
                    "votes": 0,
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
                "votes": 0,
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

        return active_players[:team_size]


class PositionVote(models.Model):
    POSITION_CHOICES = [
        ("GK", "Goalkeeper"),
        ("LB", "Left Back"),
        ("CB", "Center Back"),
        ("RB", "Right Back"),
        ("CDM", "Defensive Midfielder"),
        ("CM", "Central Midfielder"),
        ("LW", "Left Winger"),
        ("RW", "Right Winger"),
        ("ST", "Striker"),
        ("DEF", "Defender"),
        ("MID", "Midfielder"),
        ("WING", "Winger"),
    ]

    voting_round = models.ForeignKey(VotingRound, on_delete=models.CASCADE, related_name="votes")
    voter_id = models.CharField(max_length=128, db_index=True)
    voter_name = models.CharField(max_length=128, blank=True, default="Player/Fan")
    position = models.CharField(max_length=16, choices=POSITION_CHOICES)
    player = models.ForeignKey(Player, on_delete=models.CASCADE, related_name="position_votes")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("voting_round", "voter_id", "position", "player")
        ordering = ["-created_at"]
        verbose_name = "Position Vote"
        verbose_name_plural = "Position Votes"

    def __str__(self):
        return f"{self.voter_id} voted {self.player.name} for {self.position}"


class HighlightVideo(models.Model):
    VIDEO_TYPE_CHOICES = [
        ("youtube", "YouTube Video"),
        ("upload", "Uploaded Video File"),
        ("external", "External Video Link"),
    ]

    title = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    category_key = models.CharField(max_length=64, blank=True, default="")
    match_name = models.CharField(max_length=255, blank=True, default="")
    match_date = models.CharField(max_length=64, blank=True, default="")
    video_type = models.CharField(max_length=16, choices=VIDEO_TYPE_CHOICES, default="youtube")
    video_url = models.URLField(max_length=1000, blank=True, default="")
    video_file = models.FileField(upload_to="highlights/", blank=True, null=True)
    thumbnail_url = models.URLField(max_length=1000, blank=True, default="")
    duration = models.CharField(max_length=32, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        verbose_name = "Highlight Video"
        verbose_name_plural = "Highlight Videos"

    def __str__(self):
        return f"{self.title} ({self.get_video_type_display()})"

    def to_dict(self):
        file_url = self.video_file.url if self.video_file else ""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "categoryKey": self.category_key,
            "matchName": self.match_name,
            "matchDate": self.match_date,
            "videoType": self.video_type,
            "videoUrl": self.video_url,
            "fileUrl": file_url,
            "thumbnailUrl": self.thumbnail_url,
            "duration": self.duration,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }

