from django.db import models
from django.utils.text import slugify


class GlobalSettings(models.Model):
    active_category_key = models.CharField(max_length=64, default="open")

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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Category / Tournament"
        verbose_name_plural = "Categories / Tournaments"
        ordering = ["key"]

    def __str__(self):
        return f"{self.label} ({self.get_mode_display()})"

    def to_state_dict(self):
        """Serialize category to match frontend state format."""
        teams_data = [t.to_dict() for t in self.teams.all().order_by("id")]
        referees_list = [r.name for r in self.referees.all().order_by("name")]

        schedule = {
            "time": self.schedule_time or "18:00",
            "days": self.schedule_days or {3: 1, 4: 1, 5: 1, 6: 1},
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
            }
        else:
            # Cup mode: organize group fixtures and knockout rounds
            group_fixtures = {}
            for letter in self.group_letters or []:
                group_fixtures[letter] = [
                    f.to_dict()
                    for f in self.fixtures.filter(phase="group", group_letter=letter).order_by("id")
                ]

            return {
                "label": self.label,
                "mode": "cup",
                "teams": teams_data,
                "groupLetters": self.group_letters or [],
                "groupOf": self.group_of or {},
                "groupFixtures": group_fixtures,
                "rounds": self.rounds_data or None,
                "schedule": schedule,
                "referees": referees_list,
                "note": self.note,
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
    position = models.CharField(
        max_length=16,
        blank=True,
        default="",
        choices=[
            ("", "No position set"),
            ("GK", "Goalkeeper (GK)"),
            ("DEF", "Defender (DEF)"),
            ("MID", "Midfielder (MID)"),
            ("FWD", "Forward (FWD)"),
        ],
    )
    is_unknown = models.BooleanField(default=False)
    jersey_number = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        unique_together = ("team", "player_id")
        ordering = ["is_unknown", "name"]

    def __str__(self):
        pos = f" [{self.position}]" if self.position else ""
        return f"{self.name}{pos} - {self.team.name}"

    def to_dict(self):
        res = {
            "id": self.player_id,
            "name": self.name,
            "position": self.position or "",
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
    minute = models.PositiveSmallIntegerField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    def __str__(self):
        p_name = self.player.name if self.player else "Unknown"
        return f"{self.get_event_type_display()} - {p_name} ({self.team.team_id})"

    def to_dict(self):
        data = {
            "teamId": self.team.team_id,
            "playerId": self.player.player_id if self.player else None,
            "type": self.event_type,
        }
        if self.event_type == "goal":
            data["assistPlayerId"] = self.assist_player.player_id if self.assist_player else None
            data["penalty"] = self.is_penalty
        return data
