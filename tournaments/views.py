import json
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse, HttpResponse
from rest_framework import status, views, viewsets
from rest_framework.response import Response
from rest_framework.decorators import api_view

from .models import Category, Team, Player, Referee, Fixture, MatchEvent, GlobalSettings, HighlightVideo
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
    Resets the Open League and Ruiru Titans Cup tournaments back to the official season data.
    """

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


class HomepageAPIView(views.APIView):
    """
    GET: Returns the Club Homepage data (carousel pictures, U13/U15/U17/Wazae jersey photos, upcoming fixtures).
    POST: Updates the Club Homepage data (Admin CMS).
    """

    def get(self, request):
        from .services import build_default_homepage_data
        settings, _ = GlobalSettings.objects.get_or_create(id=1)
        if not settings.homepage_data:
            settings.homepage_data = build_default_homepage_data()
            settings.save(update_fields=["homepage_data"])
        return Response(settings.homepage_data)

    def post(self, request):
        from .services import build_default_homepage_data
        payload = request.data
        if not isinstance(payload, dict):
            return Response({"error": "Invalid homepage payload."}, status=status.HTTP_400_BAD_REQUEST)
        settings, _ = GlobalSettings.objects.get_or_create(id=1)
        current = settings.homepage_data or build_default_homepage_data()
        if "carousel" in payload and isinstance(payload["carousel"], list):
            current["carousel"] = payload["carousel"]
        if "jerseys" in payload and isinstance(payload["jerseys"], dict):
            current["jerseys"] = payload["jerseys"]
        if "upcoming_fixtures" in payload and isinstance(payload["upcoming_fixtures"], list):
            current["upcoming_fixtures"] = payload["upcoming_fixtures"]
        settings.homepage_data = current
        settings.save(update_fields=["homepage_data"])
        return Response({"success": True, "homepage": settings.homepage_data})


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
    category = get_object_or_404(Category, key=key)
    from .services import get_category_fixtures_results_pdf_context
    context = get_category_fixtures_results_pdf_context(category)
    context["auto_print"] = request.GET.get("auto") in ("1", "true")
    return render(request, "fixtures_results_pdf.html", context)



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

    def post(self, request, key):
        category = get_object_or_404(Category, key=key)
        from .services import submit_voter_ballot, get_authenticated_player_from_request

        player_auth = get_authenticated_player_from_request(request)
        if not player_auth:
            return Response(
                {"error": "Only logged-in Ruiru Titans players can vote. Please sign in with your player profile."},
                status=status.HTTP_401_UNAUTHORIZED,
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

    def get(self, request):
        from .services import get_authenticated_cms_from_request, get_authenticated_player_from_request
        cms_user = get_authenticated_cms_from_request(request)
        player_user = get_authenticated_player_from_request(request)

        # Enforce mutual exclusivity: player and manager cannot be signed in at the same time
        if cms_user and player_user:
            request.session.pop("titans_player", None)
            player_user = None

        return Response({
            "cms_authenticated": bool(cms_user),
            "cms_user": cms_user,
            "player_authenticated": bool(player_user),
            "player": player_user,
        })


class CMSLoginAPIView(views.APIView):
    """
    Authenticates Administrators to enter the Admin Dashboard.
    Does not auto-login to Django's /admin/ session so /admin/ always requires a password.
    Automatically logs off any former player account in this browser.
    """

    def post(self, request):
        from django.contrib.auth import authenticate
        from django.contrib.auth.models import User
        from .services import ensure_default_cms_admin, create_signed_token

        ensure_default_cms_admin()
        payload = request.data or {}
        username = str(payload.get("username", "")).strip()
        password = str(payload.get("password", "")).strip()

        if not username or not password:
            return Response(
                {"error": "Username and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        matched_user = User.objects.filter(username__iexact=username).first()
        auth_username = matched_user.username if matched_user else username

        user = authenticate(request, username=auth_username, password=password)
        if not user or not (user.is_staff or user.is_superuser):
            return Response(
                {"error": "Invalid Admin credentials. Please check your admin username and password."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Log off former player session immediately
        request.session.pop("titans_player", None)

        cms_profile = {
            "role": "cms",
            "username": user.username,
            "email": user.email,
        }
        request.session["titans_cms"] = cms_profile
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

    def post(self, request):
        from django.contrib.auth import logout
        from .services import authenticate_player_credentials
        payload = request.data or {}
        username = str(payload.get("username", "")).strip() or None
        password = str(payload.get("password", "")).strip() or None
        player_id = str(payload.get("player_id", "")).strip() or None
        access_code = str(payload.get("access_code", "")).strip() or None
        category_key = str(payload.get("category_key", "")).strip() or None

        try:
            profile, token = authenticate_player_credentials(
                player_id=player_id,
                access_code=access_code,
                category_key=category_key,
                username=username,
                password=password,
            )
            # Log off former manager/admin session immediately
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
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)


class AdminPlayerRegisterAPIView(views.APIView):
    """
    Admin registers a new player.
    Generates a 4-digit activation code and flags must_change_password=True.
    """

    def post(self, request):
        from .services import register_player_by_admin
        payload = request.data or {}
        name = payload.get("name")
        username = payload.get("username")
        team_id = payload.get("team_id") or payload.get("teamId")
        category_key = payload.get("category_key") or payload.get("categoryKey") or "open"
        position = payload.get("position", "")
        jersey_number = payload.get("jersey_number") or payload.get("jerseyNumber")

        try:
            player, code = register_player_by_admin(
                category_key=category_key,
                team_id=team_id,
                name=name,
                username=username,
                position=position,
                jersey_number=jersey_number,
            )
            return Response({
                "success": True,
                "player": player.to_dict(),
                "code": code,
                "username": player.username,
                "message": f"Player '{player.name}' registered successfully! 4-digit activation code: {code}",
            }, status=status.HTTP_201_CREATED)
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class AdminPlayerResetPasswordAPIView(views.APIView):
    """
    Admin resets a player's password using their username.
    Generates a new 4-digit code and requires them to change password upon next login.
    """

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


class PlayerChangePasswordAPIView(views.APIView):
    """
    Player changes their password from temporary 4-digit code to their personal password,
    granting full access to the Player Dashboard.
    """

    def post(self, request):
        from .services import change_player_password, get_authenticated_player_from_request
        payload = request.data or {}
        new_password = payload.get("new_password") or payload.get("newPassword")
        current_code = payload.get("current_code") or payload.get("currentCode")
        username = (
            payload.get("username")
            or payload.get("player_id")
            or payload.get("playerId")
            or payload.get("id")
        )

        authed_player = get_authenticated_player_from_request(request)
        target = username or authed_player

        try:
            profile, token = change_player_password(
                player_or_ident=target,
                new_password=new_password,
                current_code=current_code,
            )
            request.session["titans_player"] = profile
            return Response({
                "success": True,
                "player": profile,
                "token": token,
                "message": "Password updated successfully! Welcome to your Player Dashboard.",
            })
        except ValueError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class CMSChangePasswordAPIView(views.APIView):
    """
    POST /api/auth/cms-change-password/
    Allows an authenticated Manager / Staff Admin to change their password.
    Requires verification of their current password.
    """

    def post(self, request):
        from django.contrib.auth import update_session_auth_hash
        from django.contrib.auth.models import User
        from .services import get_authenticated_cms_from_request, create_signed_token

        cms_info = get_authenticated_cms_from_request(request)
        if not cms_info or not cms_info.get("username"):
            return Response(
                {"error": "Unauthorized. You must be signed in as Manager to change your password."},
                status=status.HTTP_401_UNAUTHORIZED,
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

        username = cms_info["username"]
        user = User.objects.filter(username__iexact=username).first()
        if not user or not (user.is_staff or user.is_superuser):
            return Response({"error": "Manager account not found or lacks administrative privileges."}, status=status.HTTP_404_NOT_FOUND)

        if not user.check_password(current_password):
            return Response({"error": "Current manager password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)

        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError
        try:
            validate_password(new_password, user=user)
        except ValidationError as e:
            return Response({"error": " ".join(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save()

        if hasattr(request, "user") and request.user.is_authenticated:
            update_session_auth_hash(request, user)

        cms_profile = {
            "role": "cms",
            "username": user.username,
            "email": user.email,
        }
        request.session["titans_cms"] = cms_profile
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
    """

    def post(self, request):
        import base64
        import urllib.request
        from .services import (
            extract_google_sheet_csv_url,
            parse_xlsx_bytes_to_rows,
            parse_tabular_text_to_rows,
            extract_players_from_rows,
            balance_players_into_teams,
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
