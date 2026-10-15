from django.urls import path
from .views import (
    home_view,
    StateAPIView,
    ResetSeasonAPIView,
    CategoryListCreateAPIView,
    CategoryDetailAPIView,
    StandingsAPIView,
    H2HComparisonAPIView,
    ExportStandingsCSVView,
    ExportFixturesCSVView,
    ExportPlayersCSVView,
    match_sheet_view,
)

app_name = "tournaments"

urlpatterns = [
    path("", home_view, name="home"),
    path("fixtures/<str:fixture_id>/sheet/", match_sheet_view, name="fixture_match_sheet"),
    path("api/state/", StateAPIView.as_view(), name="api_state"),
    path("api/reset-real-season/", ResetSeasonAPIView.as_view(), name="api_reset_season"),
    path("api/categories/", CategoryListCreateAPIView.as_view(), name="api_categories"),
    path("api/categories/<str:key>/", CategoryDetailAPIView.as_view(), name="api_category_detail"),
    path("api/categories/<str:key>/standings/", StandingsAPIView.as_view(), name="api_standings"),
    path("api/categories/<str:key>/h2h/", H2HComparisonAPIView.as_view(), name="api_category_h2h"),
    path("api/categories/<str:key>/export/standings-csv/", ExportStandingsCSVView.as_view(), name="api_export_standings_csv"),
    path("api/categories/<str:key>/export/fixtures-csv/", ExportFixturesCSVView.as_view(), name="api_export_fixtures_csv"),
    path("api/categories/<str:key>/export/players-csv/", ExportPlayersCSVView.as_view(), name="api_export_players_csv"),
]


