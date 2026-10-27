"""
Django settings for config project.

Production-hardened settings for Ruiru Titans Football Platform.
"""

from pathlib import Path
import os
import sys
import secrets
import importlib.util
import urllib.parse
from django.core.exceptions import ImproperlyConfigured

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(env_file_path: Path):
    """
    Loads environment variables from a .env file without external dependencies.
    Existing os.environ variables take precedence.
    """
    if not env_file_path.exists():
        return
    try:
        with open(env_file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                if k and k not in os.environ:
                    os.environ[k] = v
    except Exception:
        pass


# Automatically load .env if present
_load_env_file(BASE_DIR / ".env")


# ==============================================================================
# 1. CORE APPLICATION & DEBUG MODE
# ==============================================================================

# SECURITY: DEBUG must default to False in production
_debug_raw = os.environ.get("DEBUG", "False").strip().lower()
DEBUG = _debug_raw in ("true", "1", "yes")

# SECURITY: SECRET_KEY must be loaded from an environment variable and not hardcoded
EXPOSED_DEV_SECRET_KEYS = {
    "django-insecure-2c)_b@i8gohhd68rb=pk@bmw(8s(r)5-v+@vzl67s3^dm#pei4",
    "your-secure-secret-key-change-in-production",
    "django-insecure-change-me",
}

SECRET_KEY = os.environ.get("SECRET_KEY", "").strip()

if not SECRET_KEY or SECRET_KEY in EXPOSED_DEV_SECRET_KEYS:
    if DEBUG:
        # Development fallback: generate a non-committed ephemeral key if none specified
        SECRET_KEY = "dev-insecure-" + secrets.token_hex(32)
    else:
        raise ImproperlyConfigured(
            "CRITICAL SECURITY CONFIGURATION ERROR: SECRET_KEY environment variable is missing, "
            "empty, or set to an exposed insecure development key. Set a unique, cryptographically secure "
            "SECRET_KEY in production."
        )


# ==============================================================================
# 2. ALLOWED HOSTS & DOMAINS
# ==============================================================================

# Restrict ALLOWED_HOSTS to specified domains: ruirutitans.com and *.ruirutitans.com
# In Django, '.ruirutitans.com' matches ruirutitans.com and all subdomains (*.ruirutitans.com)
PRODUCTION_DOMAINS = ["ruirutitans.com", ".ruirutitans.com"]

env_allowed_hosts = os.environ.get("ALLOWED_HOSTS", "").strip()
if env_allowed_hosts:
    raw_hosts = [h.strip() for h in env_allowed_hosts.split(",") if h.strip()]
    ALLOWED_HOSTS = []
    for h in raw_hosts:
        if h not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(h)
        # In Django, leading period '.ruirutitans.com' matches the domain and any subdomain (*.ruirutitans.com)
        if h.startswith("*."):
            normalized = "." + h[2:]
            if normalized not in ALLOWED_HOSTS:
                ALLOWED_HOSTS.append(normalized)
    for prod_domain in PRODUCTION_DOMAINS:
        if prod_domain not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(prod_domain)
else:
    ALLOWED_HOSTS = list(PRODUCTION_DOMAINS)

# Allow local loopback addresses only during local development or unit testing
if DEBUG:
    for local_host in ["localhost", "127.0.0.1", "[::1]", "0.0.0.0", "testserver"]:
        if local_host not in ALLOWED_HOSTS:
            ALLOWED_HOSTS.append(local_host)


# ==============================================================================
# 3. APPLICATION DEFINITION & MIDDLEWARE
# ==============================================================================

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "corsheaders",
    "rest_framework",
    "tournaments.apps.TournamentsConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    *(
        ["whitenoise.middleware.WhiteNoiseMiddleware"]
        if importlib.util.find_spec("whitenoise") is not None
        else []
    ),
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"


# ==============================================================================
# 4. EXPLICIT, PERSISTENT DATABASE CONFIGURATION
# ==============================================================================

# Explicitly configure database: no silent fallback between engines
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
DB_ENGINE = os.environ.get("DB_ENGINE", "").strip().lower()
USE_MYSQL = os.environ.get("USE_MYSQL", "").strip().lower() in ("true", "1", "yes")

if DATABASE_URL:
    parsed_db = urllib.parse.urlparse(DATABASE_URL)
    scheme = parsed_db.scheme.lower()
    if scheme in ("postgres", "postgresql"):
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.postgresql",
                "NAME": parsed_db.path.lstrip("/"),
                "USER": parsed_db.username or "",
                "PASSWORD": parsed_db.password or "",
                "HOST": parsed_db.hostname or "127.0.0.1",
                "PORT": str(parsed_db.port or 5432),
                "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "300")),
            }
        }
    elif scheme == "mysql":
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.mysql",
                "NAME": parsed_db.path.lstrip("/"),
                "USER": parsed_db.username or "",
                "PASSWORD": parsed_db.password or "",
                "HOST": parsed_db.hostname or "127.0.0.1",
                "PORT": str(parsed_db.port or 3306),
                "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "300")),
                "OPTIONS": {
                    "charset": "utf8mb4",
                    "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
                },
            }
        }
    elif scheme == "sqlite":
        sqlite_file = parsed_db.path.lstrip("/") or "db.sqlite3"
        DATABASES = {
            "default": {
                "ENGINE": "django.db.backends.sqlite3",
                "NAME": BASE_DIR / sqlite_file,
                "CONN_MAX_AGE": 0,
            }
        }
    else:
        raise ImproperlyConfigured(f"Unsupported DATABASE_URL scheme: {scheme}")

elif DB_ENGINE == "mysql" or USE_MYSQL:
    mysql_db = os.environ.get("MYSQL_DATABASE") or os.environ.get("DB_NAME", "ruirutitans")
    mysql_user = os.environ.get("MYSQL_USER") or os.environ.get("DB_USER", "titans_user")
    mysql_password = os.environ.get("MYSQL_PASSWORD") or os.environ.get("DB_PASSWORD", "")
    mysql_host = os.environ.get("MYSQL_HOST") or os.environ.get("DB_HOST", "127.0.0.1")
    mysql_port = str(os.environ.get("MYSQL_PORT") or os.environ.get("DB_PORT", "3306"))

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.mysql",
            "NAME": mysql_db,
            "USER": mysql_user,
            "PASSWORD": mysql_password,
            "HOST": mysql_host,
            "PORT": mysql_port,
            "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "300")),
            "OPTIONS": {
                "charset": "utf8mb4",
                "init_command": "SET sql_mode='STRICT_TRANS_TABLES'",
            },
        }
    }

elif DB_ENGINE in ("postgres", "postgresql"):
    pg_db = os.environ.get("POSTGRES_DB") or os.environ.get("DB_NAME", "ruirutitans")
    pg_user = os.environ.get("POSTGRES_USER") or os.environ.get("DB_USER", "titans_user")
    pg_password = os.environ.get("POSTGRES_PASSWORD") or os.environ.get("DB_PASSWORD", "")
    pg_host = os.environ.get("POSTGRES_HOST") or os.environ.get("DB_HOST", "127.0.0.1")
    pg_port = str(os.environ.get("POSTGRES_PORT") or os.environ.get("DB_PORT", "5432"))

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": pg_db,
            "USER": pg_user,
            "PASSWORD": pg_password,
            "HOST": pg_host,
            "PORT": pg_port,
            "CONN_MAX_AGE": int(os.environ.get("DB_CONN_MAX_AGE", "300")),
        }
    }

else:
    # Explicit persistent SQLite configuration
    sqlite_custom_path = os.environ.get("SQLITE_PATH", "").strip()
    if sqlite_custom_path:
        sqlite_file_path = Path(sqlite_custom_path)
        if not sqlite_file_path.is_absolute():
            sqlite_file_path = BASE_DIR / sqlite_file_path
    else:
        sqlite_file_path = BASE_DIR / "db.sqlite3"

    sqlite_file_path.parent.mkdir(parents=True, exist_ok=True)

    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": sqlite_file_path,
            "CONN_MAX_AGE": 0,
        }
    }


# ==============================================================================
# 5. PASSWORD HASHERS & VALIDATION (PRODUCTION SECURITY)
# ==============================================================================

# Strong, standard cryptographic password hashers.
# PBKDF2 is primary; MD5 is only retained as last-resort legacy fallback.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# Optimize PBKDF2 iterations during automated test runs per Django documentation
if "test" in sys.argv:
    from django.contrib.auth.hashers import PBKDF2PasswordHasher
    PBKDF2PasswordHasher.iterations = 1

# Standard Django production password validators
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.NumericPasswordValidator",
    },
]


# ==============================================================================
# 6. CORS & CSRF CONFIGURATION
# ==============================================================================

# SECURITY: Do not allow all origins when credentials are enabled
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = True

# Restrict CORS to specified domain and subdomains (*.ruirutitans.com)
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^https://([a-zA-Z0-9-]+\.)?ruirutitans\.com$",
]

env_cors = os.environ.get("CORS_ALLOWED_ORIGINS", "").strip()
if env_cors:
    CORS_ALLOWED_ORIGINS = [o.strip() for o in env_cors.split(",") if o.strip()]
else:
    CORS_ALLOWED_ORIGINS = [
        "https://ruirutitans.com",
        "https://www.ruirutitans.com",
    ]
    if DEBUG:
        CORS_ALLOWED_ORIGINS.extend([
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ])

# Trusted CSRF origins for secure form submission and API writes
env_csrf = os.environ.get("CSRF_TRUSTED_ORIGINS", "").strip()
if env_csrf:
    CSRF_TRUSTED_ORIGINS = [o.strip() for o in env_csrf.split(",") if o.strip()]
else:
    CSRF_TRUSTED_ORIGINS = [
        "https://ruirutitans.com",
        "https://*.ruirutitans.com",
    ]
    if DEBUG:
        CSRF_TRUSTED_ORIGINS.extend([
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ])


# ==============================================================================
# 7. SECURITY HEADERS & SSL SETTINGS
# ==============================================================================

SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

if not DEBUG:
    # SSL/HTTPS enforcement
    SECURE_SSL_REDIRECT = os.environ.get("SECURE_SSL_REDIRECT", "True").strip().lower() in ("true", "1", "yes")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True

    # Exempt internal Kubernetes container health/readiness probe paths from HTTPS redirection.
    # This prevents probes from receiving a 301 redirect if invoked without X-Forwarded-Proto,
    # ensuring genuine 200/503 health assessment without disabling HTTPS enforcement globally.
    SECURE_REDIRECT_EXEMPT = [
        r"^api/health/?$",
    ]

    # HTTP Strict Transport Security (HSTS)
    SECURE_HSTS_SECONDS = int(os.environ.get("SECURE_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = (
        os.environ.get("SECURE_HSTS_INCLUDE_SUBDOMAINS", "True").strip().lower() in ("true", "1", "yes")
    )
    SECURE_HSTS_PRELOAD = (
        os.environ.get("SECURE_HSTS_PRELOAD", "True").strip().lower() in ("true", "1", "yes")
    )

    # Security Headers
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
    X_FRAME_OPTIONS = "DENY"

    # Reverse proxy support (Traefik / Cloudflare)
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
else:
    SECURE_SSL_REDIRECT = False
    SESSION_COOKIE_SECURE = False
    CSRF_COOKIE_SECURE = False
    X_FRAME_OPTIONS = "SAMEORIGIN"
    SECURE_REDIRECT_EXEMPT = []

# Trusted proxy CIDRs allowed to supply X-Forwarded-For / CF-Connecting-IP headers.
# Do not assume external CIDRs without explicit configuration; only trust forwarded IP headers
# when REMOTE_ADDR belongs to an explicitly configured proxy CIDR (e.g. K3s Traefik pod network).
_trusted_proxy_raw = os.environ.get("TRUSTED_PROXY_CIDRS", "").strip()
TRUSTED_PROXY_CIDRS = [c.strip() for c in _trusted_proxy_raw.split(",") if c.strip()]


# ==============================================================================
# 8. STATIC, MEDIA, CACHE, LOGGING & REST FRAMEWORK
# ==============================================================================

# Shared cache backend so authentication rate limits are enforced across all Gunicorn worker processes.
# Uses FileBasedCache on persistent storage (/app/data/cache in K3s) to avoid SQLite write-lock contention.
if "test" in sys.argv:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
            "LOCATION": "ruirutitans-test-cache",
        }
    }
else:
    _cache_dir_raw = os.environ.get("DJANGO_CACHE_DIR", "").strip()
    if _cache_dir_raw:
        _cache_dir = Path(_cache_dir_raw)
    elif os.environ.get("SQLITE_PATH", "").strip():
        _cache_dir = Path(os.environ.get("SQLITE_PATH").strip()).resolve().parent / "cache"
    else:
        _cache_dir = BASE_DIR / "data" / "cache"
    try:
        _cache_dir.mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
            "LOCATION": str(_cache_dir),
            "TIMEOUT": 300,
            "OPTIONS": {"MAX_ENTRIES": 5000},
        }
    }

STATIC_URL = "/static/"
STATICFILES_DIRS = [BASE_DIR / "static"]
STATIC_ROOT = BASE_DIR / "staticfiles"

if importlib.util.find_spec("whitenoise") is not None:
    STORAGES = {
        "default": {
            "BACKEND": "django.core.files.storage.FileSystemStorage",
        },
        "staticfiles": {
            "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
        },
    }

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

# Allow up to 50 MB request bodies and file uploads for high-resolution carousel and jersey photos
DATA_UPLOAD_MAX_MEMORY_SIZE = int(os.environ.get("DATA_UPLOAD_MAX_MEMORY_SIZE", str(50 * 1024 * 1024)))
FILE_UPLOAD_MAX_MEMORY_SIZE = int(os.environ.get("FILE_UPLOAD_MAX_MEMORY_SIZE", str(50 * 1024 * 1024)))

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {
        "require_debug_false": {
            "()": "django.utils.log.RequireDebugFalse",
        },
    },
    "formatters": {
        "production": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "production",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
            "propagate": False,
        },
        "django.request": {
            "handlers": ["console"],
            "level": "ERROR",
            "propagate": False,
        },
        "django.security": {
            "handlers": ["console"],
            "level": "WARNING",
            "propagate": False,
        },
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "tournaments.authentication.TitansCMSAuthentication",
        "tournaments.authentication.TitansPlayerAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.FormParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "EXCEPTION_HANDLER": "tournaments.exceptions.custom_exception_handler",
}
