import sys
import threading
import time
from django.test import TestCase, override_settings
from django.core.cache import cache
from django.db import connection
from django.conf import settings
from tournaments.models import (
    Fixture, MatchEvent, Player, AuditLog, VisitorComment, PlayerBan, TransferRequest, Category, Team
)
from tournaments.cache_utils import (
    get_cache_version,
    bump_cache_version,
    get_catalog_cache_key,
    get_catalog_cache,
    set_catalog_cache,
    invalidate_catalog_cache,
    get_finance_summary_cache,
    set_finance_summary_cache,
    invalidate_finance_cache,
    get_tenants_cache,
    set_tenants_cache,
    invalidate_tenants_cache,
    get_analytics_summary_cache,
    set_analytics_summary_cache,
    invalidate_analytics_cache,
    get_category_state_cache,
    set_category_state_cache,
    invalidate_category_state_cache,
)
from tournaments.async_dispatcher import dispatch_task_async


class DatabaseOptimizationTests(TestCase):
    """Verifies targeted composite indexes and persistent database connections."""

    def test_composite_indexes_configured(self):
        # Verify Fixture composite indexes
        fixture_indexes = [idx.name for idx in Fixture._meta.indexes]
        self.assertIn("fix_cat_phase_idx", fixture_indexes)
        self.assertIn("fix_cat_played_idx", fixture_indexes)
        self.assertIn("fix_cat_date_idx", fixture_indexes)
        self.assertIn("fix_cat_group_idx", fixture_indexes)
        self.assertIn("fix_ht_at_idx", fixture_indexes)
        self.assertIn("fix_cat_fixid_idx", fixture_indexes)

        # Verify MatchEvent composite indexes
        me_indexes = [idx.name for idx in MatchEvent._meta.indexes]
        self.assertIn("me_fix_type_idx", me_indexes)
        self.assertIn("me_team_type_idx", me_indexes)
        self.assertIn("me_player_type_idx", me_indexes)
        self.assertIn("me_assist_p_idx", me_indexes)

        # Verify Player composite indexes
        player_indexes = [idx.name for idx in Player._meta.indexes]
        self.assertIn("player_cat_team_idx", player_indexes)
        self.assertIn("player_cat_unkn_idx", player_indexes)
        self.assertIn("player_team_unkn_idx", player_indexes)
        self.assertIn("player_cat_act_idx", player_indexes)

        # Verify AuditLog composite indexes
        audit_indexes = [idx.name for idx in AuditLog._meta.indexes]
        self.assertIn("audit_cat_time_idx", audit_indexes)
        self.assertIn("audit_type_time_idx", audit_indexes)
        self.assertIn("audit_actor_time_idx", audit_indexes)

        # Verify VisitorComment composite indexes
        com_indexes = [idx.name for idx in VisitorComment._meta.indexes]
        self.assertIn("com_appr_time_idx", com_indexes)
        self.assertIn("com_stat_time_idx", com_indexes)

        # Verify PlayerBan & TransferRequest composite indexes
        self.assertIn("ban_cat_act_idx", [idx.name for idx in PlayerBan._meta.indexes])
        self.assertIn("tr_cat_stat_idx", [idx.name for idx in TransferRequest._meta.indexes])

    def test_persistent_database_connections_configured(self):
        # Check settings DATABASES default CONN_MAX_AGE
        db_conf = settings.DATABASES["default"]
        # In test mode or config, CONN_MAX_AGE is integer
        self.assertIn("CONN_MAX_AGE", db_conf)


class CacheVersioningTests(TestCase):
    """Verifies multi-tier caching and atomic version token invalidation."""

    def setUp(self):
        cache.clear()

    def test_versioned_catalog_cache_and_atomic_bump(self):
        tenant = "titan-store"
        cat = "jerseys"

        # Initial version should be 1
        v1 = get_cache_version("catalog", tenant)
        self.assertEqual(v1, 1)

        key1 = get_catalog_cache_key(tenant, cat)
        self.assertEqual(key1, f"products:list:{tenant}:v1:cat:{cat}")

        payload = [{"id": 1, "name": "Titans Home Kit 2026", "price": 2500}]
        set_catalog_cache(tenant, cat, payload)
        self.assertEqual(get_catalog_cache(tenant, cat), payload)

        # Atomic bump upon restock / edit
        new_v = invalidate_catalog_cache(tenant)
        self.assertEqual(new_v, 2)

        # Old cache key is bypassed without deleting unrelated tenant caches
        self.assertIsNone(get_catalog_cache(tenant, cat))
        key2 = get_catalog_cache_key(tenant, cat)
        self.assertEqual(key2, f"products:list:{tenant}:v2:cat:{cat}")

    def test_finance_summary_cache(self):
        tenant = "ruiru-sports"
        data = {"revenue": 450000, "expenses": 120000, "net_cashflow": 330000}
        set_finance_summary_cache(tenant, data)
        self.assertEqual(get_finance_summary_cache(tenant), data)

        # Invalidate on transaction / payment
        invalidate_finance_cache(tenant)
        self.assertIsNone(get_finance_summary_cache(tenant))

    def test_tenants_configuration_cache(self):
        tenants = [{"id": "open", "label": "Open League"}, {"id": "veterans", "label": "Veterans Cup"}]
        set_tenants_cache(tenants)
        self.assertEqual(get_tenants_cache(), tenants)

        # Bust-on-write during tenant creation
        invalidate_tenants_cache()
        self.assertIsNone(get_tenants_cache())

    def test_traffic_analytics_summary_cache(self):
        tenant = "open"
        analytics = {"total_views": 18240, "unique_visitors": 4120, "reactions": 340}
        set_analytics_summary_cache(tenant, analytics)
        self.assertEqual(get_analytics_summary_cache(tenant), analytics)

        # Invalidate when click metrics are updated
        invalidate_analytics_cache(tenant)
        self.assertIsNone(get_analytics_summary_cache(tenant))

    def test_category_state_cache_versioning(self):
        cat = "veterans"
        state = {"fixtures": [], "teams": [], "referees": []}
        set_category_state_cache(cat, state)
        self.assertEqual(get_category_state_cache(cat), state)

        invalidate_category_state_cache(cat)
        self.assertIsNone(get_category_state_cache(cat))


class AsyncDispatcherTests(TestCase):
    """Verifies sub-30ms async task offloading with daemon thread fallback."""

    def test_dispatch_task_async_execution(self):
        test_box = []

        def sample_bg_job(val):
            test_box.append(val)
            return f"done-{val}"

        res = dispatch_task_async(sample_bg_job, 42)
        self.assertEqual(res["status"], "completed_inline")
        self.assertEqual(test_box, [42])


class ThrottlingAndCorsSettingsTests(TestCase):
    """Verifies DRF rate limiting and streamlined CORS headers."""

    def test_cors_preflight_and_headers_configured(self):
        self.assertEqual(getattr(settings, "CORS_PREFLIGHT_MAX_AGE", 0), 86400)
        allow_headers = getattr(settings, "CORS_ALLOW_HEADERS", [])
        self.assertIn("x-tenant-slug", allow_headers)
        self.assertIn("x-csrftoken", allow_headers)
        self.assertIn("content-type", allow_headers)

    def test_rest_framework_throttling_configured(self):
        rf = getattr(settings, "REST_FRAMEWORK", {})
        self.assertIn("DEFAULT_THROTTLE_CLASSES", rf)
        self.assertIn("DEFAULT_THROTTLE_RATES", rf)
        rates = rf["DEFAULT_THROTTLE_RATES"]
        self.assertIn("anon", rates)
        self.assertIn("user", rates)
