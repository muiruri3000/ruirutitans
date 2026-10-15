from django.contrib import admin
from .models import Category, Team, Player, Referee, Fixture, MatchEvent, GlobalSettings


class PlayerInline(admin.TabularInline):
    model = Player
    extra = 1
    fields = ("player_id", "name", "position", "jersey_number", "is_unknown")


class MatchEventInline(admin.TabularInline):
    model = MatchEvent
    extra = 1
    fields = ("team", "player", "event_type", "assist_player", "is_penalty", "order")


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ("label", "key", "mode", "format", "team_count", "fixture_count", "created_at")
    list_filter = ("mode", "format")
    search_fields = ("label", "key")

    def team_count(self, obj):
        return obj.teams.count()
    team_count.short_description = "Teams"

    def fixture_count(self, obj):
        return obj.fixtures.count()
    fixture_count.short_description = "Fixtures"


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("name", "team_id", "category", "color", "player_count")
    list_filter = ("category",)
    search_fields = ("name", "team_id")
    inlines = [PlayerInline]

    def player_count(self, obj):
        return obj.players.count()
    player_count.short_description = "Squad Size"


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ("name", "player_id", "team", "position", "is_unknown", "jersey_number")
    list_filter = ("team__category", "position", "is_unknown")
    search_fields = ("name", "player_id", "team__name")


@admin.register(Referee)
class RefereeAdmin(admin.ModelAdmin):
    list_display = ("name", "category")
    list_filter = ("category",)
    search_fields = ("name",)


@admin.register(Fixture)
class FixtureAdmin(admin.ModelAdmin):
    list_display = (
        "fixture_id",
        "category",
        "phase",
        "home_display",
        "away_display",
        "score_display",
        "date",
        "played",
        "referee",
    )
    list_filter = ("category", "phase", "played")
    search_fields = ("fixture_id", "home_team__name", "away_team__name")
    inlines = [MatchEventInline]

    def home_display(self, obj):
        return obj.home_team.name if obj.home_team else "TBD"
    home_display.short_description = "Home"

    def away_display(self, obj):
        return obj.away_team.name if obj.away_team else "TBD"
    away_display.short_description = "Away"

    def score_display(self, obj):
        if not obj.played and not obj.walkover_winner:
            return "vs"
        h, a = obj.score
        if obj.walkover_winner:
            return f"{h} - {a} (W/O to {obj.walkover_winner.team_id})"
        return f"{h} - {a}"
    score_display.short_description = "Score"


@admin.register(MatchEvent)
class MatchEventAdmin(admin.ModelAdmin):
    list_display = ("fixture", "team", "event_type", "player", "assist_player", "is_penalty")
    list_filter = ("event_type", "is_penalty", "fixture__category")
    search_fields = ("player__name", "team__name", "fixture__fixture_id")


@admin.register(GlobalSettings)
class GlobalSettingsAdmin(admin.ModelAdmin):
    list_display = ("active_category_key",)
