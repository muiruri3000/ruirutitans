import json
from django.db.models import Q
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, HttpResponse, Http404
from rest_framework import status, views, viewsets, permissions
from rest_framework.response import Response
from rest_framework.decorators import api_view

from .permissions import IsCMSAdmin, IsPlayerUser, IsPlayerSelfOrCMSAdmin, ReadOnlyOrCMSAdmin
from .models import (
    Category,
    Team,
    Player,
    Referee,
    Fixture,
    MatchEvent,
    GlobalSettings,
    HighlightVideo,
    VisitorComment,
)
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
    build_category_duty_roster,
    update_duty_roster_assignment,
    get_category_duty_eligible_players,
    get_category_completed_duty_player_ids,
    get_category_duty_exempted_player_ids,
    add_duty_roster_exemption,
    remove_duty_roster_exemption,
)


def home_view(request):
    """
    Renders the main Ruiru Titans single-page application.
    """
    return render(request, "index.html")


class HealthCheckAPIView(views.APIView):
    """
    Lightweight liveness and readiness probe endpoint for Kubernetes / K3s.
    Does not serialize tournament state or auto-seed categories.
    - Liveness (default or ?check=live): verifies the WSGI process and request pipeline are responsive.
    - Readiness (?check=ready): additionally verifies database connectivity with a minimal SELECT 1.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        check_type = (request.query_params.get("check") or "live").strip().lower()
        if check_type == "ready":
            from django.db import connections
            try:
                with connections["default"].cursor() as cursor:
                    cursor.execute("SELECT 1")
                    cursor.fetchone()
            except Exception:
                return Response(
                    {"status": "unhealthy", "check": "ready", "database": "unavailable"},
                    status=status.HTTP_503_SERVICE_UNAVAILABLE,
                )
            return Response({"status": "ok", "check": "ready", "database": "ok"}, status=status.HTTP_200_OK)
        return Response({"status": "ok", "check": "live"}, status=status.HTTP_200_OK)


class StateAPIView(views.APIView):
    """
    Full tournament state synchronization endpoint.
    GET: Retrieve the complete state dictionary.
    POST: Save full state changes atomically into relational models (requires CMS Administrator).
    """
    permission_classes = [ReadOnlyOrCMSAdmin]

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
    Resets the Open League and Ruiru Titans Cup tournaments back to the official season data.
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request):
        from .services import build_default_homepage_data, ensure_archived_open_season
        from .models import VotingRound
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
            "homepage": build_default_homepage_data(),
        })
        ensure_archived_open_season()
        VotingRound.objects.all().delete()
        updated_state = export_state_from_db()
        return Response({
            "message": "Ruiru Titans season reset with the 5 core teams starting with 0 players.",
            "state": updated_state,
        })


class ReloadCanonicalScheduleAPIView(views.APIView):
    """
    Reloads the canonical tournament schedule and fixtures from initial_tournament_state.json
    into the active database models (requires CMS Administrator).
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request):
        from .services import import_state_to_db, export_state_from_db
        import json
        current_db_state = export_state_from_db()
        seed_path = "tournaments/initial_tournament_state.json"
        with open(seed_path, "r", encoding="utf-8") as f:
            state_dict = json.load(f)
        settings_obj = GlobalSettings.objects.first()
        if settings_obj and settings_obj.homepage_data:
            state_dict["homepage"] = settings_obj.homepage_data
        for cat_key, cat_data in state_dict.get("categories", {}).items():
            db_cat = (current_db_state.get("categories") or {}).get(cat_key)
            if db_cat and "fixtures" in db_cat and "fixtures" in cat_data:
                db_played_by_id = {
                    fx["id"]: fx
                    for fx in db_cat["fixtures"]
                    if fx.get("played") or fx.get("walkover") or (fx.get("events") and len(fx["events"]) > 0)
                }
                cat_data["fixtures"] = [
                    db_played_by_id.get(fx["id"], fx) for fx in cat_data["fixtures"]
                ]
        import_state_to_db(state_dict, soft_delete_missing=False)
        updated_state = export_state_from_db()
        return Response({
            "message": "Canonical tournament state successfully reloaded from initial_tournament_state.json.",
            "state": updated_state,
        })


class HomepageAPIView(views.APIView):
    """
    GET: Returns the Club Homepage data (carousel pictures, U13/U15/U17/Wazae jersey photos, upcoming fixtures).
    POST: Updates the Club Homepage data (Admin CMS).
    """
    permission_classes = [ReadOnlyOrCMSAdmin]

    def get(self, request):
        from .services import build_default_homepage_data, persist_homepage_images_to_media
        settings, _ = GlobalSettings.objects.get_or_create(id=1)
        if not settings.homepage_data:
            settings.homepage_data = build_default_homepage_data()
            settings.save(update_fields=["homepage_data"])
        else:
            normalized_hp = persist_homepage_images_to_media(settings.homepage_data)
            if normalized_hp != settings.homepage_data:
                settings.homepage_data = normalized_hp
                settings.save(update_fields=["homepage_data"])
        return Response(settings.homepage_data)

    def post(self, request):
        from .services import build_default_homepage_data, persist_homepage_images_to_media
        payload = request.data
        if not isinstance(payload, dict):
            return Response({"error": "Invalid homepage payload."}, status=status.HTTP_400_BAD_REQUEST)
        settings, _ = GlobalSettings.objects.get_or_create(id=1)
        current = dict(settings.homepage_data or build_default_homepage_data())
        if "carousel" in payload and isinstance(payload["carousel"], list):
            current["carousel"] = payload["carousel"]
        if "jerseys" in payload and isinstance(payload["jerseys"], dict):
            current["jerseys"] = payload["jerseys"]
        if "upcoming_fixtures" in payload and isinstance(payload["upcoming_fixtures"], list):
            current["upcoming_fixtures"] = payload["upcoming_fixtures"]
        settings.homepage_data = persist_homepage_images_to_media(current)
        settings.save(update_fields=["homepage_data"])
        return Response({"success": True, "homepage": settings.homepage_data})


class HomepageImageUploadAPIView(views.APIView):
    """
    POST /api/homepage/upload-image/
    Uploads a carousel or jersey image file (multipart/form-data 'file' or JSON 'image' data URL),
    stores it in MEDIA_ROOT/homepage/, and returns the persistent '/media/homepage/<hash>.<ext>' URL.
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request):
        import hashlib
        from pathlib import Path
        from django.conf import settings
        from .services import save_data_url_image_to_media

        uploaded_file = request.FILES.get("file") or request.FILES.get("image")
        if uploaded_file:
            raw_bytes = uploaded_file.read()
            if not raw_bytes:
                return Response({"error": "Uploaded image file is empty."}, status=status.HTTP_400_BAD_REQUEST)
            orig_ext = Path(uploaded_file.name or "photo.jpg").suffix.lower().lstrip(".")
            if orig_ext not in ("jpg", "jpeg", "png", "webp", "gif", "svg"):
                orig_ext = "jpg"
            if orig_ext == "jpeg":
                orig_ext = "jpg"
            digest = hashlib.sha256(raw_bytes).hexdigest()[:24]
            filename = f"{digest}.{orig_ext}"
            media_dir = settings.MEDIA_ROOT / "homepage"
            media_dir.mkdir(parents=True, exist_ok=True)
            target_path = media_dir / filename
            if not target_path.exists():
                target_path.write_bytes(raw_bytes)
            media_url = (getattr(settings, "MEDIA_URL", "/media/") or "/media/").rstrip("/")
            url = f"{media_url}/homepage/{filename}"
            return Response({"success": True, "url": url})

        data_url = (request.data or {}).get("image") if isinstance(request.data, dict) else None
        if data_url and isinstance(data_url, str):
            url = save_data_url_image_to_media(data_url)
            return Response({"success": True, "url": url})

        return Response({"error": "No image file or data URL provided."}, status=status.HTTP_400_BAD_REQUEST)


class CategoryListCreateAPIView(views.APIView):
    """
    List and create categories.
    """
    permission_classes = [ReadOnlyOrCMSAdmin]

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
        # Initialize with the 5 core teams starting with 0 players
        core_teams_spec = [
            {"team_id": "MAN", "name": "Mancheli", "color": "#C9A227"},
            {"team_id": "SS", "name": "Super Strikers", "color": "#B23A2E"},
            {"team_id": "RAN", "name": "Rangers", "color": "#3F7A4E"},
            {"team_id": "MAS", "name": "Masters", "color": "#D97B29"},
            {"team_id": "OXF", "name": "Oxford", "color": "#2E5A8F"},
        ]
        for ct in core_teams_spec:
            Team.objects.create(category=category, **ct)

        return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)


class CategoryDetailAPIView(views.APIView):
    """
    Retrieve, update, and delete categories.
    """
    permission_classes = [ReadOnlyOrCMSAdmin]

    def get(self, request, key):
        cat = get_object_or_404(Category, key=key)
        return Response(cat.to_state_dict())

    def patch(self, request, key):
        cat = get_object_or_404(Category, key=key)
        data = request.data or {}
        if "label" in data and str(data["label"]).strip():
            cat.label = str(data["label"]).strip()
        if "format" in data and data["format"] in ("single", "double"):
            cat.format = data["format"]
        if "note" in data:
            cat.note = str(data["note"])
        if "schedule" in data and isinstance(data["schedule"], dict):
            cat.schedule = data["schedule"]
        if "isEnded" in data:
            cat.is_ended = bool(data["isEnded"])
            if cat.is_ended and not cat.ended_at:
                from django.utils import timezone
                cat.ended_at = timezone.now()
        if "championTeam" in data:
            cat.champion_team = str(data["championTeam"])
        if "referees" in data and isinstance(data["referees"], list):
            cat.referees.all().delete()
            for r_name in data["referees"]:
                clean_name = str(r_name or "").strip()
                if clean_name:
                    Referee.objects.create(category=cat, name=clean_name)
        if "votingConfig" in data and isinstance(data["votingConfig"], dict):
            vc = data["votingConfig"]
            if "team_size" in vc:
                cat.voting_team_size = int(vc["team_size"])
            if "max_picks_per_position" in vc:
                cat.voting_max_picks = int(vc["max_picks_per_position"])
            if "include_gk" in vc:
                cat.voting_include_gk = bool(vc["include_gk"])
        cat.save()
        return Response(cat.to_state_dict())

    def put(self, request, key):
        return self.patch(request, key)

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
            if not f.played and not f.events.exists() and not f.walkover_winner_id:
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
        for idx, r in enumerate(rows, 1):
            r["pos"] = idx
        return Response(rows)


class H2HComparisonAPIView(views.APIView):
    """
    Returns Head-to-Head (H2H) comparison and form records between two teams.
    Query params: team1, team2
    """

    def get(self, request, key):
        category = get_object_or_404(Category, key=key)
        team1_id = request.query_params.get("team1", "").strip()
        team2_id = request.query_params.get("team2", "").strip()

        if not team1_id or not team2_id:
            return Response(
                {"error": "Both 'team1' and 'team2' query parameters are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .services import compute_h2h_comparison
        data = compute_h2h_comparison(category, team1_id, team2_id)
        if not data:
            return Response({"error": "One or both teams not found in this category."}, status=status.HTTP_404_NOT_FOUND)

        return Response(data)


class ExportStandingsCSVView(views.View):
    """
    Streams CSV export of the league / tournament standings table.
    """

    def get(self, request, key):
        import csv
        category = get_object_or_404(Category, key=key)
        from .services import generate_standings_csv_data
        rows = generate_standings_csv_data(category)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="ruiru_titans_{category.key}_standings.csv"'

        writer = csv.writer(response)
        for r in rows:
            writer.writerow(r)
        return response


class ExportFixturesCSVView(views.View):
    """
    Streams CSV export of all fixtures and results.
    """

    def get(self, request, key):
        import csv
        category = get_object_or_404(Category, key=key)
        from .services import generate_fixtures_csv_data
        rows = generate_fixtures_csv_data(category)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="ruiru_titans_{category.key}_fixtures.csv"'

        writer = csv.writer(response)
        for r in rows:
            writer.writerow(r)
        return response


class ExportFixturesJSONView(views.View):
    """
    Streams a downloadable JSON file of all fixtures, results, events and league info.
    """

    def get(self, request, key=None):
        import json
        from pathlib import Path
        from django.conf import settings

        json_path = settings.BASE_DIR / "league_fixtures_and_results.json"
        if json_path.exists():
            with open(json_path, "r", encoding="utf-8") as f:
                content = f.read()
        else:
            from .services import serialize_full_tournament_state
            state = serialize_full_tournament_state()
            target_key = key or "ruiru-titans-league-oct-nov-2026"
            cat = state.get("categories", {}).get(target_key, {})
            content = json.dumps(cat.get("fixtures", []), indent=2)

        filename = f"ruiru_titans_{key or 'league'}_fixtures_and_results.json"
        response = HttpResponse(content, content_type="application/json")
        response["Content-Disposition"] = f'attachment; filename="{filename}"'
        return response


class ExportPlayersCSVView(views.View):
    """
    Streams CSV export of player statistics (goals, assists, cards).
    """

    def get(self, request, key):
        import csv
        category = get_object_or_404(Category, key=key)
        from .services import generate_players_csv_data
        rows = generate_players_csv_data(category)

        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="ruiru_titans_{category.key}_players.csv"'

        writer = csv.writer(response)
        for r in rows:
            writer.writerow(r)
        return response


def match_sheet_view(request, fixture_id):
    """
    Renders an official, printable Match Day Sheet (designed for both screen view and PDF print).
    """
    from .services import get_fixture_match_sheet_context
    context = get_fixture_match_sheet_context(fixture_id)
    if not context:
        return HttpResponse("Fixture not found", status=404)
    return render(request, "match_sheet.html", context)


def category_fixtures_results_pdf_view(request, key):
    """
    Renders an official, high-resolution Fixtures & Results PDF document
    for any active or archived competition (League, Cup, or Tournament).
    Supports auto-print trigger (?auto=1) or direct viewing/saving.
    """
    category = Category.objects.filter(key=key).first()
    if not category:
        category = Category.objects.filter(key__iexact=key).first()

    # If the category isn't in DB yet, auto-seed standard categories if requested
    if not category:
        if key in ("cup", "titans-cup", "ruiru-titans-cup"):
            from .services import build_real_cup_season_dict
            cup_dict = build_real_cup_season_dict()
            import_state_to_db({"categories": {key: cup_dict}, "activeCategory": key})
            category = Category.objects.filter(key=key).first()
        elif key in ("open", "open-league", "league"):
            from .services import build_real_open_season_dict
            open_dict = build_real_open_season_dict()
            import_state_to_db({"categories": {key: open_dict}, "activeCategory": key})
            category = Category.objects.filter(key=key).first()

    if not category:
        raise Http404(f"Category '{key}' not found.")

    from .services import get_category_fixtures_results_pdf_context
    context = get_category_fixtures_results_pdf_context(category)
    context["auto_print"] = request.GET.get("auto") in ("1", "true")
    return render(request, "fixtures_results_pdf.html", context)


def ai_matchweek_report_pdf_view(request, key):
    """
    Renders an official, AI-analyzed Matchweek and Daily dossier report PDF.
    Analyzes raw match JSON data (scores, events, stats, admin reports)
    and produces weekly narrative, day-by-day breakdowns, and tactical insights.
    Supports ?week=<num>, ?auto=1, and ?format=json.
    """
    category = Category.objects.filter(key=key).first()
    if not category:
        category = Category.objects.filter(key__iexact=key).first()
    if not category:
        raise Http404(f"Category '{key}' not found.")

    from .ai_report import get_ai_matchweek_report_context
    week_param = request.GET.get("week")
    week_number = None
    if week_param:
        try:
            week_number = int(week_param)
        except (ValueError, TypeError):
            week_number = None

    context = get_ai_matchweek_report_context(category, week_number=week_number)
    context["auto_print"] = request.GET.get("auto") in ("1", "true")

    if request.GET.get("format") == "json":
        payload = json.loads(context["raw_json"])
        payload["ai_analysis"] = context.get("ai", {})
        payload["ai"] = context.get("ai", {})
        return JsonResponse(payload, safe=False)

    return render(request, "ai_matchweek_report_pdf.html", context)


class FixtureReportAPIView(views.APIView):
    """
    Allows administrators to write and update official game reports for completed matches.
    Public users can view match reports.
    """
    def get_permissions(self):
        if self.request.method in ("GET", "HEAD", "OPTIONS"):
            return [permissions.AllowAny()]
        return [IsCMSAdmin()]

    def get(self, request, key, fixture_id):
        category = Category.objects.filter(key=key).first() or Category.objects.filter(key__iexact=key).first()
        if not category:
            return Response({"error": "Category not found"}, status=status.HTTP_404_NOT_FOUND)
        fixture = category.fixtures.filter(fixture_id=fixture_id).first()
        if not fixture:
            return Response({"error": "Fixture not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response({
            "fixture_id": fixture.fixture_id,
            "report": fixture.report or {},
            "played": fixture.played,
        })

    def post(self, request, key, fixture_id):
        from django.utils import timezone
        category = Category.objects.filter(key=key).first() or Category.objects.filter(key__iexact=key).first()
        if not category:
            return Response({"error": "Category not found"}, status=status.HTTP_404_NOT_FOUND)
        fixture = category.fixtures.filter(fixture_id=fixture_id).first()
        if not fixture:
            return Response({"error": "Fixture not found"}, status=status.HTTP_404_NOT_FOUND)

        data = request.data or {}
        report_data = {
            "title": str(data.get("title", "")).strip(),
            "content": str(data.get("content", "")).strip(),
            "motm": str(data.get("motm", "")).strip(),
            "motm_team": str(data.get("motm_team", "")).strip(),
            "tactical_notes": str(data.get("tactical_notes", "")).strip(),
            "attendance": str(data.get("attendance", "")).strip(),
            "weather": str(data.get("weather", "")).strip(),
            "author": request.user.username if (request.user and request.user.is_authenticated) else "admin",
            "updated_at": timezone.now().isoformat(),
        }
        fixture.report = report_data
        fixture.save(update_fields=["report", "updated_at"])

        return Response({
            "success": True,
            "fixture_id": fixture.fixture_id,
            "report": fixture.report,
            "message": f"Match report for {fixture.fixture_id} updated successfully.",
        })



class VotingCurrentAPIView(views.APIView):
    """
    Returns active voting round, candidate options, TOTW, TOTT, and current voter's selections.
    Publicly accessible so everyone can view TOTW and TOTT.
    """

    def get(self, request, key):
        category = get_object_or_404(Category, key=key)
        from .services import get_category_voting_data, get_authenticated_player_from_request
        player_auth = get_authenticated_player_from_request(request)
        voter_id = request.query_params.get("voter_id") or (player_auth["player_id"] if player_auth else None)
        round_id_param = request.query_params.get("round_id")
        round_id = int(round_id_param) if round_id_param and round_id_param.isdigit() else None

        data = get_category_voting_data(category, voter_id=voter_id, round_id=round_id)
        data["authenticated_player"] = player_auth
        return Response(data)


class VotingSubmitAPIView(views.APIView):
    """
    Submits a voter's ballot for positions (GK, DEF, MID, WING, ST).
    Strictly restricted: Only logged-in Ruiru Titans players can vote.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, key):
        category = get_object_or_404(Category, key=key)
        from .services import submit_voter_ballot, get_authenticated_player_from_request

        player_auth = get_authenticated_player_from_request(request)
        if not player_auth:
            return Response(
                {"error": "Only logged-in Ruiru Titans players can vote. Please sign in with your player profile."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if player_auth.get("must_change_password"):
            return Response(
                {"error": "You must change your temporary password before voting or accessing protected player features."},
                status=status.HTTP_403_FORBIDDEN,
            )

        payload = request.data or {}
        voter_id = player_auth["player_id"]
        voter_name = f"{player_auth['name']} ({player_auth['team_name']})"
        round_id = payload.get("round_id")
        votes = payload.get("votes", {})

        if not round_id:
            from .services import get_or_create_active_voting_round
            round_id = get_or_create_active_voting_round(category).id
        if not votes or not isinstance(votes, dict):
            return Response({"error": "votes dictionary is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            result = submit_voter_ballot(
                category=category,
                round_id=round_id,
                voter_id=voter_id,
                voter_name=voter_name,
                votes_dict=votes,
                allow_revoting=False,
            )
            result["voter"] = player_auth
            return Response(result)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class VotingTOTTAPIView(views.APIView):
    """
    Returns Team of the Tournament computed across all voting rounds by highest average votes.
    Publicly accessible.
    """

    def get(self, request, key):
        category = get_object_or_404(Category, key=key)
        from .services import compute_team_of_tournament
        tott = compute_team_of_tournament(category)
        return Response(tott)


class VotingAdminToggleAPIView(views.APIView):
    """
    Admin control endpoint to open/close voting windows, generate new rounds,
    and configure number of players being voted for (team_size, max_picks_per_position)
    and Goalkeeper (GK) inclusion toggle (include_gk).
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request, key):
        category = get_object_or_404(Category, key=key)
        payload = request.data or {}
        round_id = payload.get("round_id")
        is_open = payload.get("is_open")
        create_new = bool(payload.get("create_new", False))
        title = payload.get("title")
        team_size = payload.get("team_size")
        max_picks_per_position = payload.get("max_picks_per_position")
        include_gk = payload.get("include_gk")

        from .services import admin_toggle_voting_round, get_category_voting_data
        try:
            target_round = admin_toggle_voting_round(
                category=category,
                round_id=round_id,
                is_open=is_open,
                create_new=create_new,
                title=title,
                team_size=team_size,
                max_picks_per_position=max_picks_per_position,
                include_gk=include_gk,
            )
            data = get_category_voting_data(category, round_id=target_round.id)
            return Response({
                "success": True,
                "round": data["round"],
                "all_rounds": data["all_rounds"],
                "voting_config": data["voting_config"],
                "totw": data["totw"],
                "tott": data["tott"],
                "candidates": data["candidates"],
            })
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AuthSessionAPIView(views.APIView):
    """
    Returns current authentication status for CMS Admin and Club Player.
    Enforces that player and manager are mutually exclusive (cannot be signed in together).
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        from django.contrib.auth.models import User
        from .services import (
            get_authenticated_cms_from_request,
            get_authenticated_player_from_request,
            create_signed_token,
            get_cms_user_credential_fingerprint,
        )
        cms_user = get_authenticated_cms_from_request(request)
        player_user = get_authenticated_player_from_request(request)

        # Enforce mutual exclusivity: player and manager cannot be signed in at the same time
        if cms_user and player_user:
            request.session.pop("titans_player", None)
            player_user = None

        cms_token = None
        if cms_user:
            cms_token = create_signed_token(cms_user, salt="titans-cms-auth")
            if hasattr(request, "session"):
                u_obj = User.objects.filter(username__iexact=cms_user.get("username", "")).first()
                sess_payload = dict(cms_user)
                if u_obj:
                    sess_payload["_cv"] = get_cms_user_credential_fingerprint(u_obj)
                request.session["titans_cms"] = sess_payload

        return Response({
            "cms_authenticated": bool(cms_user),
            "cms_user": cms_user,
            "token": cms_token,
            "player_authenticated": bool(player_user),
            "player": player_user,
        })


class CMSLoginAPIView(views.APIView):
    """
    Authenticates Administrators to enter the Admin Dashboard.
    Does not auto-login to Django's /admin/ session so /admin/ always requires a password.
    Automatically logs off any former player account in this browser.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.contrib.auth import authenticate
        from django.contrib.auth.models import User
        from .services import (
            create_signed_token,
            get_cms_user_credential_fingerprint,
            get_client_ip,
            check_auth_rate_limit,
            record_auth_failure,
            clear_auth_failures,
        )

        payload = request.data or {}
        username = str(payload.get("username", "")).strip()
        password = str(payload.get("password", "")).strip()
        client_ip = get_client_ip(request)

        if check_auth_rate_limit("cms_login", client_ip, username):
            return Response(
                {"error": "Too many login attempts. Please wait a few minutes and try again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        if not username or not password:
            return Response(
                {"error": "Username and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        matched_user = User.objects.filter(username__iexact=username).first()
        auth_username = matched_user.username if matched_user else username

        user = authenticate(request, username=auth_username, password=password)
        if not user or not user.is_active or not (user.is_staff or user.is_superuser):
            record_auth_failure("cms_login", client_ip, username)
            return Response(
                {"error": "Invalid Admin credentials. Please check your admin username and password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        clear_auth_failures("cms_login", client_ip, username)

        # Log off former player session immediately
        if hasattr(request, "session"):
            request.session.pop("titans_player", None)

        cms_profile = {
            "role": "cms",
            "username": user.username,
            "email": user.email,
        }
        if hasattr(request, "session"):
            request.session["titans_cms"] = {
                **cms_profile,
                "_cv": get_cms_user_credential_fingerprint(user),
            }
        token = create_signed_token(cms_profile, salt="titans-cms-auth")
        return Response({
            "success": True,
            "role": "cms",
            "cms_user": cms_profile,
            "token": token,
            "logged_off_former": "player",
        })


class PlayerLoginAPIView(views.APIView):
    """
    Authenticates a registered Ruiru Titans player using username and password
    so their permanent player_id is used for TOTW/TOTT voting and player identification.
    Automatically logs off any former manager/admin account in this browser.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.contrib.auth import logout
        from .services import (
            authenticate_player_credentials,
            get_client_ip,
            check_auth_rate_limit,
            record_auth_failure,
            clear_auth_failures,
        )
        payload = request.data or {}
        username = str(payload.get("username", "")).strip() or None
        password = str(payload.get("password", "")).strip() or None
        player_id = str(payload.get("player_id", "")).strip() or None
        access_code = str(payload.get("access_code", "")).strip() or None
        category_key = str(payload.get("category_key", "")).strip() or None

        ident = username or player_id or ""
        client_ip = get_client_ip(request)
        if check_auth_rate_limit("player_login", client_ip, ident):
            return Response(
                {"error": "Too many login attempts. Please wait a few minutes and try again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            profile, token = authenticate_player_credentials(
                player_id=player_id,
                access_code=access_code,
                category_key=category_key,
                username=username,
                password=password,
            )
            clear_auth_failures("player_login", client_ip, ident)
            # Log off former manager/admin session immediately
            if hasattr(request, "session"):
                request.session.pop("titans_cms", None)
                logout(request)
                request.session["titans_player"] = profile
            return Response({
                "success": True,
                "role": "player",
                "player": profile,
                "token": token,
                "must_change_password": profile.get("must_change_password", False),
                "logged_off_former": "cms",
            })
        except ValueError as e:
            record_auth_failure("player_login", client_ip, ident)
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class AdminPlayerRegisterAPIView(views.APIView):
    """
    Admin registers a new player.
    Generates a 4-digit activation code and flags must_change_password=True.
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request):
        from .services import register_player_by_admin
        payload = request.data or {}
        first_name = payload.get("first_name") or payload.get("firstName")
        surname = payload.get("surname")
        name = payload.get("name")
        username = payload.get("username")
        team_id = payload.get("team_id") or payload.get("teamId")
        category_key = payload.get("category_key") or payload.get("categoryKey") or "open"
        position = payload.get("position", "")
        jersey_number = payload.get("jersey_number") or payload.get("jerseyNumber")
        date_of_birth = payload.get("date_of_birth") or payload.get("dob")
        active_foot = payload.get("active_foot") or payload.get("activeFoot") or "right"
        preferred_positions = payload.get("preferred_positions") or payload.get("preferredPositions")

        try:
            player, code = register_player_by_admin(
                category_key=category_key,
                team_id=team_id,
                name=name,
                username=username,
                position=position,
                jersey_number=jersey_number,
                first_name=first_name,
                surname=surname,
                date_of_birth=date_of_birth,
                active_foot=active_foot,
                preferred_positions=preferred_positions,
            )
            return Response({
                "success": True,
                "player": player.to_dict(),
                "code": code,
                "username": player.username,
                "message": f"Player '{player.name}' registered successfully! Username: @{player.username}. 4-digit code: {code}",
            }, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PlayerUpdateProfileAPIView(views.APIView):
    """
    POST /api/players/update-profile/
    Allows logged-in player (or CMS Admin) to update player personal details:
    first_name, surname, date_of_birth, username, active_foot, preferred_positions.
    """
    def post(self, request):
        from .services import (
            get_authenticated_player_from_request,
            get_authenticated_cms_from_request,
            update_player_profile,
        )
        payload = request.data or {}
        auth_player = get_authenticated_player_from_request(request)
        auth_cms = get_authenticated_cms_from_request(request)

        target_player = None
        if auth_cms:
            player_id = payload.get("player_id") or payload.get("id") or payload.get("username")
            category_key = payload.get("category_key") or payload.get("categoryKey")
            qs = Player.objects.filter(is_unknown=False)
            if category_key:
                qs = qs.filter(team__category__key=category_key)
            if player_id:
                target_player = qs.filter(
                    Q(player_id=player_id) | Q(username__iexact=player_id) | Q(name__iexact=player_id)
                ).first()

        if not target_player and auth_player:
            pid = auth_player.get("player_id") or auth_player.get("id")
            cat_k = auth_player.get("category_key")
            qs = Player.objects.filter(is_unknown=False)
            if cat_k:
                qs = qs.filter(team__category__key=cat_k)
            target_player = qs.filter(Q(player_id=pid) | Q(username__iexact=auth_player.get("username"))).first()

        if not target_player:
            return Response({"error": "Authentication required to update player profile."}, status=status.HTTP_401_UNAUTHORIZED)

        try:
            updated_player = update_player_profile(target_player, payload)
            p_dict = updated_player.to_dict()
            p_dict["team_id"] = updated_player.team.team_id
            p_dict["team_name"] = updated_player.team.name
            p_dict["team_color"] = updated_player.team.color
            p_dict["category_key"] = updated_player.team.category.key
            p_dict["first_name"] = updated_player.first_name
            p_dict["surname"] = updated_player.surname
            p_dict["dob"] = str(updated_player.date_of_birth) if updated_player.date_of_birth else ""
            p_dict["date_of_birth"] = str(updated_player.date_of_birth) if updated_player.date_of_birth else ""
            p_dict["active_foot"] = updated_player.active_foot
            p_dict["preferred_positions"] = updated_player.preferred_positions
            # Update session if player is logged in
            if hasattr(request, "session") and "titans_player" in request.session:
                request.session["titans_player"] = p_dict
            return Response({
                "success": True,
                "message": f"Personal details for @{updated_player.username} updated successfully!",
                "player": p_dict,
            })
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminPlayerResetPasswordAPIView(views.APIView):
    """
    Admin resets a player's password using their username.
    Generates a new 4-digit code and requires them to change password upon next login.
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request):
        from .services import reset_player_password_by_admin
        payload = request.data or {}
        username = (
            payload.get("username")
            or payload.get("player_number")
            or payload.get("jersey_number")
            or payload.get("identifier")
        )
        category_key = payload.get("category_key") or payload.get("categoryKey")
        team_id = payload.get("team_id") or payload.get("teamId")

        try:
            player, code = reset_player_password_by_admin(
                username, category_key=category_key, team_id=team_id
            )
            return Response({
                "success": True,
                "username": player.username,
                "player_id": player.player_id,
                "name": player.name,
                "jersey_number": player.jersey_number,
                "team_name": player.team.name,
                "code": code,
                "is_active": player.is_active,
                "message": f"Password reset for @{player.username} ({player.name}). 4-digit temporary code: {code}",
            })
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminPlayerToggleStatusAPIView(views.APIView):
    """
    POST /api/admin/players/toggle-status/
    Admin disables or re-enables a player's account.
    Disabled player accounts cannot authenticate or access dashboard.
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request):
        from .services import set_player_active_status_admin
        payload = request.data or {}
        player_ident = (
            payload.get("player_id")
            or payload.get("username")
            or payload.get("player_number")
            or payload.get("identifier")
        )
        is_active = payload.get("is_active") if payload.get("is_active") is not None else payload.get("isActive")
        team_id = payload.get("team_id") or payload.get("teamId")
        category_key = payload.get("category_key") or payload.get("categoryKey")

        try:
            player, new_status = set_player_active_status_admin(
                player_ident=player_ident,
                is_active=is_active,
                team_id=team_id,
                category_key=category_key,
            )
            status_text = "activated" if new_status else "disabled"
            return Response({
                "success": True,
                "player_id": player.player_id,
                "username": player.username,
                "name": player.name,
                "is_active": new_status,
                "message": f"Player account @{player.username} ({player.name}) has been {status_text}.",
            })
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminPlayerReleaseNumberAPIView(views.APIView):
    """
    POST /api/admin/players/release-number/
    Admin releases the jersey number from a player so it is unassigned and available
    for another player to use.
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request):
        from .services import release_player_jersey_admin
        payload = request.data or {}
        player_ident = (
            payload.get("player_id")
            or payload.get("username")
            or payload.get("player_number")
            or payload.get("identifier")
        )
        team_id = payload.get("team_id") or payload.get("teamId")
        category_key = payload.get("category_key") or payload.get("categoryKey")

        try:
            player, old_num = release_player_jersey_admin(
                player_ident=player_ident,
                team_id=team_id,
                category_key=category_key,
            )
            return Response({
                "success": True,
                "player_id": player.player_id,
                "username": player.username,
                "name": player.name,
                "released_number": old_num,
                "message": f"Jersey #{old_num} successfully released from {player.name}."
                if old_num is not None
                else f"Player {player.name} had no jersey number assigned.",
            })
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminPlayerUpdatePositionAPIView(views.APIView):
    """
    POST /api/admin/players/update-position/
    Allows an administrator to manually set, change, or clear a player's tactical position.
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request):
        from .services import update_player_position_by_admin
        payload = request.data or {}
        player_ident = (
            payload.get("player_id")
            or payload.get("id")
            or payload.get("username")
            or payload.get("identifier")
        )
        position = payload.get("position", "")
        team_id = payload.get("team_id") or payload.get("teamId")
        category_key = payload.get("category_key") or payload.get("categoryKey")

        try:
            player = update_player_position_by_admin(
                player_ident=player_ident,
                position=position,
                team_id=team_id,
                category_key=category_key,
            )
            return Response({
                "success": True,
                "player_id": player.player_id,
                "username": player.username,
                "name": player.name,
                "position": player.position,
                "team_id": player.team.team_id,
                "message": f"Position for {player.name} updated to '{player.position or 'Unassigned'}'.",
            })
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminPlayerUpdateUsernameAPIView(views.APIView):
    """
    POST /api/admin/players/update-username/
    Allows an administrator to manually edit a player's username.
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request):
        from .services import update_player_username_by_admin
        payload = request.data or {}
        player_ident = (
            payload.get("player_id")
            or payload.get("id")
            or payload.get("username")
            or payload.get("identifier")
        )
        new_username = payload.get("new_username") or payload.get("username") or payload.get("newUsername")
        team_id = payload.get("team_id") or payload.get("teamId")
        category_key = payload.get("category_key") or payload.get("categoryKey")

        try:
            player = update_player_username_by_admin(
                player_ident=player_ident,
                new_username=new_username,
                team_id=team_id,
                category_key=category_key,
            )
            return Response({
                "success": True,
                "player_id": player.player_id,
                "username": player.username,
                "name": player.name,
                "team_id": player.team.team_id,
                "message": f"Username for {player.name} updated to '@{player.username}'.",
            })
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class PlayerChangePasswordAPIView(views.APIView):
    """
    Player changes their password from temporary 4-digit code to their personal password,
    granting full access to the Player Dashboard.
    """

    def post(self, request):
        from .services import (
            change_player_password,
            get_authenticated_player_from_request,
            get_client_ip,
            check_auth_rate_limit,
            record_auth_failure,
            clear_auth_failures,
        )
        payload = request.data or {}
        new_password = payload.get("new_password") or payload.get("newPassword")
        confirm_password = payload.get("confirm_password") or payload.get("confirmPassword")
        current_code = payload.get("current_code") or payload.get("currentCode")
        username = (
            payload.get("username")
            or payload.get("player_id")
            or payload.get("playerId")
            or payload.get("id")
        )

        if confirm_password is not None and str(confirm_password).strip() != str(new_password or "").strip():
            return Response(
                {"error": "New password and confirmation do not match."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        authed_player = get_authenticated_player_from_request(request)
        if authed_player:
            # If authenticated as a player, they can ONLY change their own password!
            authed_id = str(authed_player.get("player_id", "")).strip().lower()
            authed_user = str(authed_player.get("username", "")).strip().lower()
            if username:
                clean_target = str(username).strip().lower()
                if clean_target != authed_id and clean_target != authed_user:
                    return Response(
                        {"error": "Forbidden: You cannot change another player's password."},
                        status=status.HTTP_403_FORBIDDEN,
                    )
            target = authed_player
            ident_for_rl = authed_id or authed_user
        else:
            if not username:
                return Response(
                    {"error": "Player username or ID is required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            target = username
            ident_for_rl = str(username).strip()

        client_ip = get_client_ip(request)
        if check_auth_rate_limit("player_pw_change", client_ip, ident_for_rl):
            return Response(
                {"error": "Too many password change attempts. Please wait a few minutes and try again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        try:
            profile, token = change_player_password(
                player_or_ident=target,
                new_password=new_password,
                current_code=current_code,
            )
            clear_auth_failures("player_pw_change", client_ip, ident_for_rl)
            request.session["titans_player"] = profile
            return Response({
                "success": True,
                "player": profile,
                "token": token,
                "message": "Password updated successfully! Welcome to your Player Dashboard.",
            })
        except ValueError as e:
            record_auth_failure("player_pw_change", client_ip, ident_for_rl)
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CMSChangePasswordAPIView(views.APIView):
    """
    POST /api/auth/cms-change-password/
    Allows an authenticated Manager / Staff Admin to change their password.
    Requires verification of their current password.
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.contrib.auth import update_session_auth_hash
        from django.contrib.auth.models import User
        from .services import (
            get_authenticated_cms_from_request,
            create_signed_token,
            get_cms_user_credential_fingerprint,
            get_client_ip,
            check_auth_rate_limit,
            record_auth_failure,
            clear_auth_failures,
        )

        cms_info = get_authenticated_cms_from_request(request)
        if not cms_info or not cms_info.get("username"):
            return Response(
                {"error": "Unauthorized. You must be signed in as Manager to change your password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        username = cms_info["username"]
        client_ip = get_client_ip(request)
        if check_auth_rate_limit("cms_pw_change", client_ip, username):
            return Response(
                {"error": "Too many password change attempts. Please wait a few minutes and try again."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        payload = request.data or {}
        current_password = str(payload.get("current_password") or payload.get("currentPassword") or "").strip()
        new_password = str(payload.get("new_password") or payload.get("newPassword") or "").strip()
        confirm_password = str(payload.get("confirm_password") or payload.get("confirmPassword") or "").strip()

        if not current_password:
            return Response({"error": "Current manager password is required."}, status=status.HTTP_400_BAD_REQUEST)

        if not new_password:
            return Response({"error": "New password is required."}, status=status.HTTP_400_BAD_REQUEST)

        if len(new_password) < 4:
            return Response({"error": "New password must be at least 4 characters long."}, status=status.HTTP_400_BAD_REQUEST)

        if confirm_password and new_password != confirm_password:
            return Response({"error": "New password and confirmation do not match."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(username__iexact=username).first()
        if not user or not (user.is_staff or user.is_superuser):
            return Response({"error": "Manager account not found or lacks administrative privileges."}, status=status.HTTP_404_NOT_FOUND)

        if not user.check_password(current_password):
            record_auth_failure("cms_pw_change", client_ip, username)
            return Response({"error": "Current manager password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        try:
            validate_password(new_password, user=user)
        except ValidationError as e:
            return Response({"error": " ".join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()
        clear_auth_failures("cms_pw_change", client_ip, username)

        if hasattr(request, "user") and request.user.is_authenticated:
            update_session_auth_hash(request, user)

        cms_profile = {
            "role": "cms",
            "username": user.username,
            "email": user.email,
        }
        request.session["titans_cms"] = {
            **cms_profile,
            "_cv": get_cms_user_credential_fingerprint(user),
        }
        token = create_signed_token(cms_profile, salt="titans-cms-auth")

        return Response({
            "success": True,
            "message": "Manager password changed successfully!",
            "cms_user": cms_profile,
            "token": token,
        })


class AuthLogoutAPIView(views.APIView):
    """
    Logs out CMS Admin, Player, or both.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        from django.contrib.auth import logout
        payload = request.data or {}
        target_role = payload.get("role", "all")

        if target_role in ("player", "all"):
            request.session.pop("titans_player", None)
        if target_role in ("cms", "all"):
            request.session.pop("titans_cms", None)
            logout(request)

        return Response({"success": True})


class TeamBalancerAPIView(views.APIView):
    """
    POST /api/team-balancer/
    Accepts:
    - Uploaded file (.xlsx, .csv, .tsv) via multipart `file` or `file_base64` + `filename`
    - `google_sheet_url` (Google Sheets link)
    - `raw_text` (CSV / TSV / pasted table)
    - `players` (array of {name, player_class, position})
    - `players_per_team` (int)
    - `team_names` (optional list of custom team names)
    Returns parsed players and/or balanced teams across categories (A = Elite down to last letter = Amateur).
    Restricted strictly to authenticated CMS Administrators.
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request):
        import base64
        import urllib.request
        from .services import (
            extract_google_sheet_csv_url,
            parse_xlsx_bytes_to_rows,
            parse_tabular_text_to_rows,
            extract_players_from_rows,
            balance_players_into_teams,
            intelligently_add_players_to_balanced_teams,
        )

        payload = request.data or {}
        action = str(payload.get("action", "balance")).strip().lower()
        players = payload.get("players")
        rows = []

        try:
            # 1. Check multipart file upload
            uploaded_file = request.FILES.get("file")
            if uploaded_file:
                fname = (uploaded_file.name or "").lower()
                raw_bytes = uploaded_file.read()
                if fname.endswith(".xlsx") or raw_bytes[:2] == b"PK":
                    rows = parse_xlsx_bytes_to_rows(raw_bytes)
                else:
                    text = raw_bytes.decode("utf-8-sig", errors="replace")
                    rows = parse_tabular_text_to_rows(text)
                players = extract_players_from_rows(rows)

            # 2. Check base64 file upload
            elif payload.get("file_base64"):
                b64_str = str(payload.get("file_base64", ""))
                if "," in b64_str:
                    b64_str = b64_str.split(",", 1)[1]
                raw_bytes = base64.b64decode(b64_str)
                fname = str(payload.get("filename", "")).lower()
                if fname.endswith(".xlsx") or raw_bytes[:2] == b"PK":
                    rows = parse_xlsx_bytes_to_rows(raw_bytes)
                else:
                    text = raw_bytes.decode("utf-8-sig", errors="replace")
                    rows = parse_tabular_text_to_rows(text)
                players = extract_players_from_rows(rows)

            # 3. Check Google Sheet URL
            elif payload.get("google_sheet_url"):
                csv_url = extract_google_sheet_csv_url(str(payload.get("google_sheet_url")))
                req = urllib.request.Request(
                    csv_url,
                    headers={"User-Agent": "Mozilla/5.0 (RuiruTitansTeamBalancer/1.0)"},
                )
                with urllib.request.urlopen(req, timeout=10) as resp:
                    csv_text = resp.read().decode("utf-8-sig", errors="replace")
                rows = parse_tabular_text_to_rows(csv_text)
                players = extract_players_from_rows(rows)

            # 4. Check raw tabular / CSV text
            elif payload.get("raw_text"):
                rows = parse_tabular_text_to_rows(str(payload.get("raw_text")))
                players = extract_players_from_rows(rows)

            if action == "parse":
                if not players:
                    return Response(
                        {"error": "No valid player rows found in the provided input."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return Response({
                    "success": True,
                    "players": players,
                    "total_players": len(players),
                })

            if action in ("add_players", "add"):
                teams = payload.get("teams") or []
                new_players = payload.get("new_players") or payload.get("players") or []
                if not teams:
                    return Response(
                        {"error": "Please provide existing teams to add players to."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if not new_players:
                    return Response(
                        {"error": "Please provide new players to add."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                result = intelligently_add_players_to_balanced_teams(
                    teams=teams,
                    new_players=new_players,
                    classes=payload.get("classes"),
                    class_weights=payload.get("class_weights"),
                )
                return Response({
                    "success": True,
                    **result,
                })

            if not players or not isinstance(players, list):
                return Response(
                    {"error": "Please provide players via Excel, CSV, Table, or Google Sheet link."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            players_per_team = int(payload.get("players_per_team") or 5)
            team_names = payload.get("team_names")
            balanced = balance_players_into_teams(
                players=players,
                players_per_team=players_per_team,
                team_names=team_names,
            )
            return Response({
                "success": True,
                "players": players,
                **balanced,
            })
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as exc:
            return Response(
                {"error": f"Unable to process input: {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )


class TeamAnalyticsAPIView(views.APIView):
    """
    GET /api/categories/<key>/teams/<team_id>/analytics/
    Returns detailed match history (last 20), next 5 upcoming fixtures,
    player roster & individual statistics, active suspensions, form metrics,
    and predictive tournament progression odds.
    """

    def get(self, request, key, team_id):
        from .services import compute_team_analytics
        category = Category.objects.filter(key=key).first()
        if not category:
            return Response({"error": "Category not found"}, status=status.HTTP_404_NOT_FOUND)
        analytics = compute_team_analytics(category, team_id)
        if not analytics:
            return Response({"error": "Team not found in this category"}, status=status.HTTP_404_NOT_FOUND)
        return Response(analytics, status=status.HTTP_200_OK)


class PlayerLookupAPIView(views.APIView):
    """
    GET /api/players/lookup/?name=...&category=...
    Takes in a player name and returns matching players and their usernames
    in case they forgot their username.
    """

    def get(self, request):
        from .services import lookup_player_usernames_by_name
        query = request.query_params.get("name") or request.query_params.get("q") or ""
        category_key = request.query_params.get("category") or None
        results = lookup_player_usernames_by_name(query, category_key=category_key)
        return Response({"query": query, "results": results, "count": len(results)})


class HighlightListCreateAPIView(views.APIView):
    """
    GET /api/highlights/?category=...&q=...
    Lists highlight videos.

    POST /api/highlights/
    Creates a new highlight video (YouTube link, uploaded video file, or external link).
    """
    permission_classes = [ReadOnlyOrCMSAdmin]

    def get(self, request):
        from django.db.models import Q
        queryset = HighlightVideo.objects.all().order_by("-created_at")
        cat = request.query_params.get("category")
        if cat:
            queryset = queryset.filter(category_key=cat)
        q = request.query_params.get("q")
        if q:
            queryset = queryset.filter(
                Q(title__icontains=q) |
                Q(description__icontains=q) |
                Q(match_name__icontains=q)
            )
        data = [h.to_dict() for h in queryset]
        return Response(data, status=status.HTTP_200_OK)

    def post(self, request):
        title = request.data.get("title") or request.POST.get("title")
        if not title:
            return Response({"error": "Title is required."}, status=status.HTTP_400_BAD_REQUEST)

        description = request.data.get("description") or request.POST.get("description") or ""
        category_key = request.data.get("categoryKey") or request.data.get("category_key") or request.POST.get("categoryKey") or request.POST.get("category_key") or ""
        match_name = request.data.get("matchName") or request.data.get("match_name") or request.POST.get("matchName") or request.POST.get("match_name") or ""
        match_date = request.data.get("matchDate") or request.data.get("match_date") or request.POST.get("matchDate") or request.POST.get("match_date") or ""
        video_type = request.data.get("videoType") or request.data.get("video_type") or request.POST.get("videoType") or request.POST.get("video_type") or "youtube"
        video_url = request.data.get("videoUrl") or request.data.get("video_url") or request.POST.get("videoUrl") or request.POST.get("video_url") or ""
        thumbnail_url = request.data.get("thumbnailUrl") or request.data.get("thumbnail_url") or request.POST.get("thumbnailUrl") or request.POST.get("thumbnail_url") or ""
        duration = request.data.get("duration") or request.POST.get("duration") or ""

        video_file = request.FILES.get("video_file") or request.FILES.get("file")
        if video_file:
            video_type = "upload"

        if video_type != "upload" and not video_url:
            return Response({"error": "Please provide a valid video URL (e.g. YouTube or external link)."}, status=status.HTTP_400_BAD_REQUEST)

        highlight = HighlightVideo.objects.create(
            title=title.strip(),
            description=description.strip(),
            category_key=category_key.strip(),
            match_name=match_name.strip(),
            match_date=match_date.strip(),
            video_type=video_type,
            video_url=video_url.strip(),
            video_file=video_file,
            thumbnail_url=thumbnail_url.strip(),
            duration=duration.strip(),
        )
        return Response({"success": True, "highlight": highlight.to_dict()}, status=status.HTTP_201_CREATED)


class HighlightDeleteAPIView(views.APIView):
    """
    DELETE /api/highlights/<id>/
    Deletes a highlight video.
    """
    permission_classes = [IsCMSAdmin]

    def delete(self, request, pk):
        highlight = HighlightVideo.objects.filter(pk=pk).first()
        if not highlight:
            return Response({"error": "Highlight not found."}, status=status.HTTP_404_NOT_FOUND)

        if highlight.video_file:
            try:
                highlight.video_file.delete(save=False)
            except Exception:
                pass
        highlight.delete()
        return Response({"success": True, "message": "Highlight deleted successfully."})


class CategoryToggleArchiveAPIView(views.APIView):
    """
    POST /api/categories/<key>/toggle-archive/
    Sets or toggles tournament archived / ended status.
    Payload: {"isEnded": bool, "championTeam": str, "runnerUpTeam": str}
    """
    permission_classes = [IsCMSAdmin]

    def post(self, request, key):
        from django.utils import timezone
        category = Category.objects.filter(key=key).first()
        if not category:
            return Response({"error": "Category not found."}, status=status.HTTP_404_NOT_FOUND)

        req_ended = request.data.get("isEnded")
        if req_ended is None:
            category.is_ended = not category.is_ended
        else:
            category.is_ended = bool(req_ended)

        if category.is_ended:
            if not category.ended_at:
                category.ended_at = timezone.now()
            champ = request.data.get("championTeam")
            if champ is not None:
                category.champion_team = str(champ).strip()
            runner = request.data.get("runnerUpTeam")
            if runner is not None:
                category.runner_up_team = str(runner).strip()
        else:
            category.ended_at = None

        category.save()
        return Response({
            "success": True,
            "key": category.key,
            "isEnded": category.is_ended,
            "championTeam": category.champion_team,
            "category": category.to_state_dict(),
        })


class DutyRosterAPIView(views.APIView):
    """
    Endpoint for Duty Roster management and viewing.
    GET: Returns the duty roster and eligible/completed player pools.
    POST: Updates an assignment, toggles completion status, or triggers auto-assignment (CMS admin only).
    """
    permission_classes = [ReadOnlyOrCMSAdmin]

    def get_category(self, key=None):
        if key:
            cat = Category.objects.filter(key=key).first()
            if cat:
                return cat
        # Fallback to active league category
        cat = Category.objects.filter(is_deleted=False, is_ended=False, mode="league").order_by("-created_at").first()
        if not cat:
            cat = Category.objects.filter(is_deleted=False).order_by("-created_at").first()
        return cat

    def get(self, request, key=None):
        cat = self.get_category(key or request.query_params.get("key"))
        if not cat:
            return Response({"error": "Category not found"}, status=status.HTTP_404_NOT_FOUND)

        roster = build_category_duty_roster(cat, force_regenerate=False)
        eligible_players = get_category_duty_eligible_players(cat)

        return Response({
            "status": "success",
            "categoryKey": cat.key,
            "categoryLabel": cat.label,
            "dutyRoster": roster,
            "eligiblePlayers": eligible_players,
        })

    def post(self, request, key=None):
        cat = self.get_category(key or request.data.get("categoryKey") or request.query_params.get("key"))
        if not cat:
            return Response({"error": "Category not found"}, status=status.HTTP_404_NOT_FOUND)

        action = request.data.get("action", "update_assignment")

        if action == "regenerate":
            roster = build_category_duty_roster(cat, force_regenerate=True)
            eligible_players = get_category_duty_eligible_players(cat)
            return Response({
                "status": "success",
                "message": "Duty roster regenerated successfully.",
                "dutyRoster": roster,
                "eligiblePlayers": eligible_players,
            })

        elif action == "add_exemption":
            player_id = request.data.get("playerId") or request.data.get("player_id")
            reason = request.data.get("reason", "")
            if not player_id:
                return Response({"error": "playerId is required."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                roster = add_duty_roster_exemption(cat, player_id, reason=reason)
            except ValueError as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            eligible_players = get_category_duty_eligible_players(cat)
            return Response({
                "status": "success",
                "message": f"Player {player_id} added to exemption list.",
                "dutyRoster": roster,
                "eligiblePlayers": eligible_players,
            })

        elif action == "remove_exemption":
            player_id = request.data.get("playerId") or request.data.get("player_id")
            if not player_id:
                return Response({"error": "playerId is required."}, status=status.HTTP_400_BAD_REQUEST)
            roster = remove_duty_roster_exemption(cat, player_id)
            eligible_players = get_category_duty_eligible_players(cat)
            return Response({
                "status": "success",
                "message": f"Exemption removed for {player_id}.",
                "dutyRoster": roster,
                "eligiblePlayers": eligible_players,
            })

        elif action in ("update_assignment", "toggle_completion"):
            fixture_id = request.data.get("fixtureId") or request.data.get("fixture_id")
            side = request.data.get("side")
            player_id = request.data.get("playerId") or request.data.get("player_id")
            player_name = request.data.get("playerName") or request.data.get("player_name")
            completed = request.data.get("completed")

            if not fixture_id or side not in ("home", "away"):
                return Response(
                    {"error": "Both fixtureId and side ('home' or 'away') are required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            try:
                roster = update_duty_roster_assignment(
                    category=cat,
                    fixture_id=fixture_id,
                    side=side,
                    player_id=player_id,
                    player_name=player_name,
                    completed=completed,
                )
            except ValueError as e:
                return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
            eligible_players = get_category_duty_eligible_players(cat)
            return Response({
                "status": "success",
                "message": "Assignment updated.",
                "dutyRoster": roster,
                "eligiblePlayers": eligible_players,
            })

        elif action == "save_all":
            assignments = request.data.get("assignments")
            if isinstance(assignments, dict):
                sched = cat.schedule_days if isinstance(cat.schedule_days, dict) else {}
                roster = sched.get("duty_roster") or build_category_duty_roster(cat)
                roster["assignments"] = assignments
                roster["completedPlayerIds"] = sorted(list(get_category_completed_duty_player_ids({"assignments": assignments})))
                total = len(assignments) * 2
                comp = sum(
                    (1 if a.get("homeDuty", {}).get("completed") else 0) + (1 if a.get("awayDuty", {}).get("completed") else 0)
                    for a in assignments.values()
                )
                roster["summary"] = {
                    "totalDuties": total,
                    "completedDuties": comp,
                    "pendingDuties": max(0, total - comp),
                }
                sched["duty_roster"] = roster
                cat.schedule_days = sched
                cat.save(update_fields=["schedule_days"])
                eligible_players = get_category_duty_eligible_players(cat)
                return Response({
                    "status": "success",
                    "dutyRoster": roster,
                    "eligiblePlayers": eligible_players,
                })

        return Response({"error": f"Unknown action '{action}'"}, status=status.HTTP_400_BAD_REQUEST)


def ensure_initial_visitor_comments():
    """
    Seeds initial approved comments and reactions if the collection is empty.
    """
    if VisitorComment.objects.exists():
        return
    initial = [
        ("Coach Kimani", "Titan for life! The organization, tactical discipline, and fighting spirit shown this season has been phenomenal. Keep flying high Ruiru Titans! 🚀", "🔥 Fire"),
        ("Captain Dave", "Incredible performance by all squads! Let's maintain this momentum all the way to the championship cup. Titans forever!", "⚽ Football"),
        ("Mama Kevin", "Proud parent here! Watching our boys grow through the U13, U15 and U17 academy ranks fills my heart with joy. Thank you management and coaches!", "❤️ Love"),
        ("Anonymous", "The new matchday duty schedule and transparent fixtures tracking make following the league so much fun. Best community club around!", "👏 Respect"),
        ("Dennis Otieno", "The intensity in the evening games under the floodlights is electric. Looking forward to the upcoming weekend clashes!", "⚡ Electric"),
    ]
    for name, content, reaction in initial:
        VisitorComment.objects.create(
            author_name=name,
            content=content,
            reaction=reaction,
            status="approved",
            is_approved=True,
            moderated_by="System",
        )


class VisitorCommentAPIView(views.APIView):
    """
    GET: Returns list of visitor comments / reactions.
         Visitors see approved comments; CMS admins see all comments or filter by ?status=pending|approved|rejected.
    POST:
         - Public: Submits a new comment (set to pending moderation).
         - CMS Admin with 'action': Moderates a comment ('approve', 'reject', 'delete').
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def _is_cms(self, request):
        token = request.headers.get("X-CMS-Token") or request.META.get("HTTP_X_CMS_TOKEN")
        has_token = bool(token and token.startswith("cms-token-"))
        return bool(
            has_token
            or getattr(request, "cms_user", None)
            or (request.user and request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser))
            or (request.session and request.session.get("cms_authenticated"))
        )

    def get(self, request):
        ensure_initial_visitor_comments()
        is_cms = self._is_cms(request)
        status_filter = (request.query_params.get("status") or "").strip().lower()

        qs = VisitorComment.objects.all()
        if not is_cms:
            qs = qs.filter(is_approved=True)
        else:
            if status_filter == "pending":
                qs = qs.filter(is_approved=False, status="pending")
            elif status_filter == "approved":
                qs = qs.filter(is_approved=True)
            elif status_filter == "rejected":
                qs = qs.filter(status="rejected")

        comments = [c.to_dict() for c in qs[:150]]
        total_count = VisitorComment.objects.count()
        pending_count = VisitorComment.objects.filter(is_approved=False, status="pending").count()
        approved_count = VisitorComment.objects.filter(is_approved=True).count()
        rejected_count = VisitorComment.objects.filter(status="rejected").count()

        return Response({
            "comments": comments,
            "counts": {
                "total": total_count,
                "pending": pending_count,
                "approved": approved_count,
                "rejected": rejected_count,
            },
            "isCms": is_cms,
        })

    def post(self, request):
        from django.utils import timezone
        data = request.data or {}
        action = data.get("action")

        # Admin moderation action
        if action in ["approve", "reject", "delete"]:
            if not self._is_cms(request):
                return Response({"error": "Admin permission required to moderate comments."}, status=status.HTTP_403_FORBIDDEN)
            comment_id = data.get("commentId") or data.get("id")
            if not comment_id:
                return Response({"error": "commentId is required."}, status=status.HTTP_400_BAD_REQUEST)
            try:
                comment = VisitorComment.objects.get(id=comment_id)
            except VisitorComment.DoesNotExist:
                return Response({"error": "Comment not found."}, status=status.HTTP_404_NOT_FOUND)

            moderator_name = (
                getattr(request.user, "username", "")
                or getattr(request, "cms_user", {}).get("username", "")
                or "CMS Admin"
            )

            if action == "approve":
                comment.is_approved = True
                comment.status = "approved"
                comment.moderated_at = timezone.now()
                comment.moderated_by = moderator_name
                comment.save(update_fields=["is_approved", "status", "moderated_at", "moderated_by"])
                msg = "Comment approved and published to the public carousel."
            elif action == "reject":
                comment.is_approved = False
                comment.status = "rejected"
                comment.moderated_at = timezone.now()
                comment.moderated_by = moderator_name
                comment.save(update_fields=["is_approved", "status", "moderated_at", "moderated_by"])
                msg = "Comment rejected."
            elif action == "delete":
                comment.delete()
                msg = "Comment deleted."

            pending_count = VisitorComment.objects.filter(is_approved=False, status="pending").count()
            approved_count = VisitorComment.objects.filter(is_approved=True).count()
            rejected_count = VisitorComment.objects.filter(status="rejected").count()

            return Response({
                "status": "success",
                "message": msg,
                "comment": comment.to_dict() if action != "delete" else None,
                "counts": {
                    "pending": pending_count,
                    "approved": approved_count,
                    "rejected": rejected_count,
                },
            })

        # Public visitor submission
        content = str(data.get("comment") or "").strip()
        if not content:
            return Response({"error": "Please enter a comment or reaction text."}, status=status.HTTP_400_BAD_REQUEST)
        if len(content) > 3000:
            return Response({"error": "Comment is too long (maximum 3000 characters)."}, status=status.HTTP_400_BAD_REQUEST)

        raw_name = str(data.get("name") or "").strip()
        author_name = raw_name if raw_name else "Anonymous"
        reaction = str(data.get("reaction") or "❤️").strip() or "❤️"

        # Check if submitted by an authenticated CMS admin: if admin posts, auto-approve
        is_admin_submission = self._is_cms(request)
        new_comment = VisitorComment.objects.create(
            author_name=author_name,
            content=content,
            reaction=reaction,
            status="approved" if is_admin_submission else "pending",
            is_approved=is_admin_submission,
            moderated_by="CMS Admin" if is_admin_submission else "",
        )

        msg = (
            "🎉 Your reaction has been posted!"
            if is_admin_submission
            else "🎉 Thank you! Your reaction has been submitted and will appear in the carousel once approved by club moderators."
        )

        return Response({
            "status": "success",
            "message": msg,
            "comment": new_comment.to_dict(),
            "requiresModeration": not is_admin_submission,
        }, status=status.HTTP_201_CREATED)


class VisitorCommentDetailAPIView(views.APIView):
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        comment = get_object_or_404(VisitorComment, pk=pk)
        return Response(comment.to_dict())


