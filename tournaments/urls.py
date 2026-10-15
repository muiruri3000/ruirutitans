from django.urls import path
from .views import (
    home_view,
    StateAPIView,
    ResetSeasonAPIView,
    CategoryListCreateAPIView,
    CategoryDetailAPIView,
    StandingsAPIView,
)

app_name = "tournaments"

urlpatterns = [
    path("", home_view, name="home"),
    path("api/state/", StateAPIView.as_view(), name="api_state"),
    path("api/reset-real-season/", ResetSeasonAPIView.as_view(), name="api_reset_season"),
    path("api/categories/", CategoryListCreateAPIView.as_view(), name="api_categories"),
    path("api/categories/<str:key>/", CategoryDetailAPIView.as_view(), name="api_category_detail"),
    path("api/categories/<str:key>/standings/", StandingsAPIView.as_view(), name="api_standings"),
]
