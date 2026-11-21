"""
High-Concurrency Multi-Tier API Caching & Cache Versioning utilities for Ruiru Titans.

Features:
- Multi-Tier Cache with automatic in-memory (LocMemCache) fallback if Redis or file cache is offline.
- Versioned Product Catalog Cache (products:list:{tenant}:v{version}:cat:{category}).
  Atomic version token bumping allows instant cache busting without flushing unrelated entries.
- Financial Ledger & Cashflow Summaries (finance:summary:{tenant}, 300s TTL) with instant invalidation.
- Tenant Configuration Cache (tenants:list) with instant bust-on-write.
- Traffic Analytics Summary (analytics:summary:{tenant}) with automatic invalidation.
- Tournament Category State & Standings caching.
"""

import logging
from typing import Any, Optional
from django.core.cache import cache, caches

logger = logging.getLogger(__name__)

# Fallback local in-memory cache for multi-tier resilience
try:
    _fallback_locmem = caches["locmem"] if "locmem" in caches else cache
except Exception:
    _fallback_locmem = cache


def _safe_call(fn, fallback_fn=None, *args, **kwargs):
    """
    Executes a cache operation against the primary cache backend.
    If an operational or connectivity error occurs (e.g. Redis offline),
    it logs a warning and falls back to in-memory cache.
    """
    try:
        return fn(*args, **kwargs)
    except Exception as exc:
        logger.warning("Primary cache operation failed (%s), using local fallback: %s", fn.__name__, exc)
        if fallback_fn is not None:
            try:
                return fallback_fn(*args, **kwargs)
            except Exception:
                return None
        return None


def safe_cache_get(key: str, default: Any = None) -> Any:
    """Retrieve value from cache with automatic fallback."""
    val = _safe_call(cache.get, _fallback_locmem.get, key, default)
    return default if val is None else val


def safe_cache_set(key: str, value: Any, timeout: int = 300) -> bool:
    """Store value in cache with automatic fallback."""
    res = _safe_call(cache.set, _fallback_locmem.set, key, value, timeout=timeout)
    return bool(res)


def safe_cache_delete(key: str) -> bool:
    """Delete a key from cache with automatic fallback."""
    res = _safe_call(cache.delete, _fallback_locmem.delete, key)
    return bool(res)


# ==============================================================================
# 1. ATOMIC VERSION TOKENS FOR CACHE VERSIONING
# ==============================================================================

def get_cache_version(namespace: str, tenant_or_cat: str = "default") -> int:
    """
    Returns current integer version token for a given tenant/category namespace.
    Defaults to 1 if not previously initialized.
    """
    v_key = f"cache_ver:{namespace}:{tenant_or_cat}"
    version = safe_cache_get(v_key)
    if version is None:
        safe_cache_set(v_key, 1, timeout=86400 * 30)
        return 1
    try:
        return int(version)
    except (ValueError, TypeError):
        return 1


def bump_cache_version(namespace: str, tenant_or_cat: str = "default") -> int:
    """
    Atomically increments the version token for a given tenant/category namespace.
    All keys formed with :v{version} become immediately invalidated without
    flushing or deleting unrelated tenant caches.
    """
    v_key = f"cache_ver:{namespace}:{tenant_or_cat}"
    try:
        new_version = cache.incr(v_key)
    except Exception:
        curr = get_cache_version(namespace, tenant_or_cat)
        new_version = curr + 1
        safe_cache_set(v_key, new_version, timeout=86400 * 30)
    return new_version


# ==============================================================================
# 2. VERSIONED PRODUCT CATALOG & INVENTORY CACHE
# ==============================================================================

def get_catalog_cache_key(tenant: str, category: str, version: Optional[int] = None) -> str:
    """Generates versioned product catalog cache key."""
    t = str(tenant or "default").strip()
    c = str(category or "all").strip()
    v = version if version is not None else get_cache_version("catalog", t)
    return f"products:list:{t}:v{v}:cat:{c}"


def get_catalog_cache(tenant: str, category: str = "all") -> Optional[Any]:
    """Retrieves cached product/merchandise catalog for tenant."""
    key = get_catalog_cache_key(tenant, category)
    return safe_cache_get(key)


def set_catalog_cache(tenant: str, category: str, data: Any, timeout: int = 300) -> bool:
    """Caches product/merchandise catalog for tenant."""
    key = get_catalog_cache_key(tenant, category)
    return safe_cache_set(key, data, timeout=timeout)


def invalidate_catalog_cache(tenant: str, category: Optional[str] = None) -> int:
    """
    Atomically bumps the catalog version token for tenant, invalidating all
    cached catalog slices immediately without flushing the entire cache.
    """
    return bump_cache_version("catalog", str(tenant or "default").strip())


# ==============================================================================
# 3. FINANCIAL LEDGER & CASHFLOW SUMMARIES (300s TTL + BUST-ON-WRITE)
# ==============================================================================

def get_finance_summary_cache_key(tenant: str = "default") -> str:
    return f"finance:summary:{str(tenant or 'default').strip()}"


def get_finance_summary_cache(tenant: str = "default") -> Optional[Any]:
    """Retrieves cached financial ledger and cashflow summary."""
    key = get_finance_summary_cache_key(tenant)
    return safe_cache_get(key)


def set_finance_summary_cache(tenant: str, data: Any, timeout: int = 300) -> bool:
    """Caches financial ledger and cashflow summary with 300s TTL."""
    key = get_finance_summary_cache_key(tenant)
    return safe_cache_set(key, data, timeout=timeout)


def invalidate_finance_cache(tenant: str = "default") -> bool:
    """Instant cache invalidation on new transaction, accrual, payment, or reversal."""
    key = get_finance_summary_cache_key(tenant)
    return safe_cache_delete(key)


# ==============================================================================
# 4. TENANT CONFIGURATION CACHE (BUST-ON-WRITE)
# ==============================================================================

TENANTS_LIST_CACHE_KEY = "tenants:list"


def get_tenants_cache() -> Optional[Any]:
    """Retrieves cached tenant / tournament configuration list."""
    return safe_cache_get(TENANTS_LIST_CACHE_KEY)


def set_tenants_cache(data: Any, timeout: int = 600) -> bool:
    """Caches tenant list with 600s TTL."""
    return safe_cache_set(TENANTS_LIST_CACHE_KEY, data, timeout=timeout)


def invalidate_tenants_cache() -> bool:
    """Instant bust-on-write during tenant creation, update, or deletion."""
    return safe_cache_delete(TENANTS_LIST_CACHE_KEY)


# ==============================================================================
# 5. TRAFFIC ANALYTICS SUMMARY CACHE
# ==============================================================================

def get_analytics_summary_cache_key(tenant: str = "default") -> str:
    return f"analytics:summary:{str(tenant or 'default').strip()}"


def get_analytics_summary_cache(tenant: str = "default") -> Optional[Any]:
    """Retrieves cached aggregated traffic analytics summary."""
    key = get_analytics_summary_cache_key(tenant)
    return safe_cache_get(key)


def set_analytics_summary_cache(tenant: str, data: Any, timeout: int = 300) -> bool:
    """Caches aggregated traffic analytics summary with 300s TTL."""
    key = get_analytics_summary_cache_key(tenant)
    return safe_cache_set(key, data, timeout=timeout)


def invalidate_analytics_cache(tenant: str = "default") -> bool:
    """Automatic invalidation when new click or visitor metrics are posted."""
    key = get_analytics_summary_cache_key(tenant)
    return safe_cache_delete(key)


# ==============================================================================
# 6. TOURNAMENT CATEGORY STATE & STANDINGS CACHE
# ==============================================================================

def get_category_state_cache_key(category_key: str, version: Optional[int] = None) -> str:
    cat = str(category_key or "default").strip()
    v = version if version is not None else get_cache_version("state", cat)
    return f"state:summary:{cat}:v{v}"


def get_category_state_cache(category_key: str) -> Optional[Any]:
    key = get_category_state_cache_key(category_key)
    return safe_cache_get(key)


def set_category_state_cache(category_key: str, data: Any, timeout: int = 300) -> bool:
    key = get_category_state_cache_key(category_key)
    return safe_cache_set(key, data, timeout=timeout)


def invalidate_category_state_cache(category_key: str) -> int:
    """Atomically bumps version token for tournament category state."""
    return bump_cache_version("state", str(category_key or "default").strip())
