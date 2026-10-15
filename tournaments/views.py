import json
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, HttpResponse
from rest_framework import status, views, viewsets
from rest_framework.response import Response
from rest_framework.decorators import api_view

from .models import Category, Team, Player, Referee, Fixture, MatchEvent, GlobalSettings
from .serializers import (
    CategorySerializer,
    TeamSerializer,
    PlayerSerializer,
    FixtureSerializer,
    MatchEventSerializer,
)
from .services import (
    import_state_to_db,
    export_state_from_db,
    build_real_open_season_dict,
)


def home_view(request):
    """
    Renders the main Ruiru Titans single-page application.
    """
    return render(request, "index.html")


class StateAPIView(views.APIView):
    """
    Full tournament state synchronization endpoint.
    GET: Retrieve the complete state dictionary.
    POST: Save full state changes atomically into relational models.
    """

    def get(self, request):
        state = export_state_from_db()
        return Response(state)

    def post(self, request):
        state_data = request.data
        if not state_data or "categories" not in state_data:
            return Response(
                {"error": "Invalid state payload. 'categories' object is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        import_state_to_db(state_data)
        updated_state = export_state_from_db()
        return Response(updated_state)


class ResetSeasonAPIView(views.APIView):
    """
    Resets the Open League tournament back to the historical Ruiru Titans season data.
    """

    def post(self, request):
        open_data = build_real_open_season_dict()
        import_state_to_db({"categories": {"open": open_data}, "activeCategory": "open"})
        updated_state = export_state_from_db()
        return Response({
            "message": "Ruiru Titans Open League season restored successfully.",
            "state": updated_state,
        })


class CategoryListCreateAPIView(views.APIView):
    """
    List and create categories.
    """

    def get(self, request):
        categories = Category.objects.all().order_by("key")
        serializer = CategorySerializer(categories, many=True)
        return Response(serializer.data)

    def post(self, request):
        data = request.data
        name = data.get("name", "").strip()
        mode = data.get("mode", "league")
        format_choice = data.get("format", "double")
        if not name:
            return Response({"error": "Category name is required."}, status=status.HTTP_400_BAD_REQUEST)

        # Generate key
        from django.utils.text import slugify
        key = slugify(name) or "cat-" + str(Category.objects.count() + 1)
        if Category.objects.filter(key=key).exists():
            key = f"{key}-{Category.objects.count() + 1}"

        category = Category.objects.create(
            key=key,
            label=name,
            mode=mode,
            format=format_choice,
            schedule_time="18:00",
            schedule_days={3: 1, 4: 1, 5: 1, 6: 1},
        )
        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)


class CategoryDetailAPIView(views.APIView):
    """
    Retrieve and delete categories.
    """

    def get(self, request, key):
        cat = get_object_or_404(Category, key=key)
        return Response(cat.to_state_dict())

    def delete(self, request, key):
        cat = get_object_or_404(Category, key=key)
        cat.delete()
        # Ensure an active category remains
        remaining = Category.objects.first()
        if remaining:
            settings, _ = GlobalSettings.objects.get_or_create(id=1)
            settings.active_category_key = remaining.key
            settings.save()
        return Response(status=status.HTTP_204_NO_CONTENT)


class StandingsAPIView(views.APIView):
    """
    Computes standings for a league or group within a category.
    """

    def get(self, request, key):
        category = get_object_or_404(Category, key=key)
        group_letter = request.query_params.get("group", "").strip().upper()

        if category.mode == "league":
            fixtures = category.fixtures.filter(phase="league")
            teams = category.teams.all()
        else:
            if group_letter:
                fixtures = category.fixtures.filter(phase="group", group_letter=group_letter)
                team_ids = [tid for tid, g in (category.group_of or {}).items() if g == group_letter]
                teams = category.teams.filter(team_id__in=team_ids)
            else:
                fixtures = category.fixtures.filter(phase="group")
                teams = category.teams.all()

        table = {
            t.team_id: {
                "id": t.team_id,
                "name": t.name,
                "color": t.color,
                "P": 0,
                "W": 0,
                "D": 0,
                "L": 0,
                "GF": 0,
                "GA": 0,
                "GD": 0,
                "Pts": 0,
            }
            for t in teams
        }

        for f in fixtures:
            if not f.played:
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
        return Response(rows)
