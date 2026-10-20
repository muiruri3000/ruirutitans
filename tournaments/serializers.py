from rest_framework import serializers
from .models import Category, Team, Player, Referee, Fixture, MatchEvent, GlobalSettings

class PlayerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Player
        fields = ["id", "player_id", "name", "position", "is_unknown", "jersey_number"]


class TeamSerializer(serializers.ModelSerializer):
    players = PlayerSerializer(many=True, read_only=True)

    class Meta:
        model = Team
        fields = ["id", "team_id", "name", "color", "category", "players"]


class MatchEventSerializer(serializers.ModelSerializer):
    team_code = serializers.CharField(source="team.team_id", read_only=True)
    player_code = serializers.CharField(source="player.player_id", read_only=True, allow_null=True)
    assist_player_code = serializers.CharField(source="assist_player.player_id", read_only=True, allow_null=True)

    class Meta:
        model = MatchEvent
        fields = [
            "id",
            "fixture",
            "team",
            "team_code",
            "player",
            "player_code",
            "event_type",
            "assist_player",
            "assist_player_code",
            "is_penalty",
            "is_interference",
            "minute",
            "order",
        ]


class FixtureSerializer(serializers.ModelSerializer):
    events = MatchEventSerializer(many=True, read_only=True)
    home_code = serializers.CharField(source="home_team.team_id", read_only=True, allow_null=True)
    away_code = serializers.CharField(source="away_team.team_id", read_only=True, allow_null=True)
    home_name = serializers.CharField(source="home_team.name", read_only=True, allow_null=True)
    away_name = serializers.CharField(source="away_team.name", read_only=True, allow_null=True)
    score = serializers.ReadOnlyField()

    class Meta:
        model = Fixture
        fields = [
            "id",
            "category",
            "fixture_id",
            "phase",
            "group_letter",
            "round_index",
            "tie_index",
            "date",
            "home_team",
            "home_code",
            "home_name",
            "away_team",
            "away_code",
            "away_name",
            "played",
            "walkover_winner",
            "home_pens",
            "away_pens",
            "referee",
            "score",
            "events",
        ]


class RefereeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Referee
        fields = ["id", "name", "category"]


class CategorySerializer(serializers.ModelSerializer):
    teams = TeamSerializer(many=True, read_only=True)
    referees = RefereeSerializer(many=True, read_only=True)

    class Meta:
        model = Category
        fields = [
            "key",
            "label",
            "mode",
            "format",
            "note",
            "schedule_time",
            "schedule_days",
            "group_letters",
            "group_of",
            "rounds_data",
            "teams",
            "referees",
            "created_at",
            "updated_at",
        ]

