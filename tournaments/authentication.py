import logging
import secrets
from django.contrib.auth.models import User
from rest_framework.authentication import BaseAuthentication
from rest_framework import exceptions

from .models import Player
from .services import (
    verify_signed_token,
    get_cms_user_credential_fingerprint,
    get_player_credential_fingerprint,
)

logger = logging.getLogger(__name__)


class PlayerUser:
    """
    Lightweight user object representing an authenticated Player in DRF request.user.
    Satisfies Django's authentication interface expectations.
    """
    is_authenticated = True
    is_anonymous = False
    is_staff = False
    is_superuser = False

    def __init__(self, player, profile):
        self.player = player
        self.profile = profile or {}
        self.pk = player.pk
        self.id = player.id
        self.username = player.username or player.player_id

    def __str__(self):
        return f"PlayerUser({self.player.name} - {self.player.player_id})"

    def __repr__(self):
        return f"<PlayerUser: {self.username}>"

    def __eq__(self, other):
        if isinstance(other, PlayerUser):
            return self.pk == other.pk
        return False


class TitansCMSAuthentication(BaseAuthentication):
    """
    DRF Authentication class for CMS / Admin users.
    Accepts:
    1. X-Titans-CMS-Token header (signed token with salt 'titans-cms-auth')
    2. Authorization: Bearer <token> (if token signature validates with salt 'titans-cms-auth')
    3. Django session ('titans_cms' session dictionary or standard staff session)
    """

    def _authenticate_from_session(self, request, require_cv=False):
        if hasattr(request, "session"):
            session_cms = request.session.get("titans_cms")
            if session_cms and session_cms.get("role") == "cms":
                user = User.objects.filter(username__iexact=session_cms.get("username", "")).first()
                if user and (user.is_staff or user.is_superuser) and user.is_active:
                    sess_cv = session_cms.get("_cv")
                    expected_cv = get_cms_user_credential_fingerprint(user)
                    if require_cv:
                        cv_ok = bool(sess_cv and secrets.compare_digest(str(sess_cv), expected_cv))
                    else:
                        cv_ok = bool(not sess_cv or secrets.compare_digest(str(sess_cv), expected_cv))
                    if cv_ok:
                        request.cms_user = {k: v for k, v in session_cms.items() if k != "_cv"}
                        return (user, None)

        raw_req = getattr(request, "_request", request)
        django_user = getattr(raw_req, "user", None)
        if django_user and django_user.is_authenticated and (django_user.is_staff or django_user.is_superuser) and django_user.is_active:
            request.cms_user = {
                "role": "cms",
                "username": django_user.username,
                "email": getattr(django_user, "email", ""),
            }
            return (django_user, None)

        return None

    def authenticate(self, request):
        token = (request.headers.get("X-Titans-CMS-Token") or "").strip()
        if not token:
            auth_header = (request.headers.get("Authorization") or "").strip()
            if auth_header.startswith("Bearer "):
                candidate_token = auth_header[7:].strip()
                payload = verify_signed_token(candidate_token, salt="titans-cms-auth")
                if payload and payload.get("role") == "cms":
                    token = candidate_token

        raw_req = getattr(request, "_request", request)
        req_path = getattr(raw_req, "path", getattr(request, "path", ""))
        is_safe = getattr(raw_req, "method", request.method) in ("GET", "HEAD", "OPTIONS")
        is_safe_or_auth = is_safe or req_path.startswith("/api/auth/")

        if token:
            payload = verify_signed_token(token, salt="titans-cms-auth")
            if not payload or payload.get("role") != "cms":
                session_auth = self._authenticate_from_session(request, require_cv=True)
                if session_auth:
                    return session_auth
                if is_safe_or_auth:
                    return None
                raise exceptions.AuthenticationFailed("Invalid or expired CMS admin token. Please sign in again.")

            username = payload.get("username", "")
            user = User.objects.filter(username__iexact=username).first()

            if not user or not (user.is_staff or user.is_superuser):
                session_auth = self._authenticate_from_session(request, require_cv=True)
                if session_auth:
                    return session_auth
                if is_safe_or_auth:
                    return None
                raise exceptions.AuthenticationFailed("CMS admin account is invalid or lacks staff privileges.")

            if not user.is_active:
                if is_safe_or_auth:
                    return None
                raise exceptions.AuthenticationFailed("CMS admin account is disabled.")

            expected_cv = get_cms_user_credential_fingerprint(user)
            token_cv = payload.get("_cv")
            if not token_cv or not secrets.compare_digest(str(token_cv), expected_cv):
                session_auth = self._authenticate_from_session(request, require_cv=True)
                if session_auth:
                    return session_auth
                if is_safe_or_auth:
                    return None
                raise exceptions.AuthenticationFailed("CMS admin token has been revoked after a credential change. Please sign in again.")

            clean_payload = {k: v for k, v in payload.items() if k != "_cv"}
            request.cms_user = clean_payload
            return (user, token)

        return self._authenticate_from_session(request, require_cv=False)

    def authenticate_header(self, request):
        return 'Bearer realm="titans-cms"'


class TitansPlayerAuthentication(BaseAuthentication):
    """
    DRF Authentication class for registered Club Players.
    Accepts:
    1. X-Titans-Player-Token header (signed token with salt 'titans-player-auth')
    2. Authorization: Bearer <token> (if token signature validates with salt 'titans-player-auth')
    3. Django session ('titans_player' session dictionary)
    """

    def authenticate(self, request):
        if getattr(request, "cms_user", None):
            return None

        token = (request.headers.get("X-Titans-Player-Token") or "").strip()
        if not token:
            auth_header = (request.headers.get("Authorization") or "").strip()
            if auth_header.startswith("Bearer "):
                candidate_token = auth_header[7:].strip()
                payload = verify_signed_token(candidate_token, salt="titans-player-auth")
                if payload and payload.get("role") == "player":
                    token = candidate_token

        raw_req = getattr(request, "_request", request)
        req_path = getattr(raw_req, "path", getattr(request, "path", ""))
        is_safe_or_auth = (
            getattr(raw_req, "method", request.method) in ("GET", "HEAD", "OPTIONS")
            or req_path.startswith("/api/auth/")
            or req_path.startswith("/api/state/")
            or req_path.startswith("/api/homepage/")
        )

        if token:
            payload = verify_signed_token(token, salt="titans-player-auth")
            if not payload or payload.get("role") != "player":
                if is_safe_or_auth:
                    return None
                raise exceptions.AuthenticationFailed("Invalid or expired Player token.")

            player_id = payload.get("player_id") or payload.get("id")
            category_key = payload.get("category_key")
            qs = Player.objects.filter(player_id=player_id, is_unknown=False)
            if category_key:
                player = qs.filter(team__category__key=category_key).first() or qs.first()
            else:
                player = qs.first()

            if not player:
                if is_safe_or_auth:
                    return None
                raise exceptions.AuthenticationFailed("Player account associated with token not found.")

            if not getattr(player, "is_active", True):
                if is_safe_or_auth:
                    return None
                raise exceptions.AuthenticationFailed("Player account is currently disabled.")

            expected_cv = get_player_credential_fingerprint(player)
            token_cv = payload.get("_cv")
            if not token_cv or not secrets.compare_digest(str(token_cv), expected_cv):
                if is_safe_or_auth:
                    return None
                raise exceptions.AuthenticationFailed("Player token has been revoked after a password change or reset. Please sign in again.")

            clean_payload = {k: v for k, v in payload.items() if k != "_cv"}
            request.player = player
            request.player_profile = clean_payload
            return (PlayerUser(player, clean_payload), token)

        if hasattr(request, "session"):
            session_player = request.session.get("titans_player")
            if session_player and session_player.get("player_id"):
                player_id = session_player.get("player_id")
                category_key = session_player.get("category_key")
                qs = Player.objects.filter(player_id=player_id, is_unknown=False)
                if category_key:
                    player = qs.filter(team__category__key=category_key).first() or qs.first()
                else:
                    player = qs.first()

                if player and getattr(player, "is_active", True):
                    sess_cv = session_player.get("_cv")
                    if not sess_cv or secrets.compare_digest(str(sess_cv), get_player_credential_fingerprint(player)):
                        clean_sess = {k: v for k, v in session_player.items() if k != "_cv"}
                        request.player = player
                        request.player_profile = clean_sess
                        return (PlayerUser(player, clean_sess), None)

        return None

    def authenticate_header(self, request):
        return 'Bearer realm="titans-player"'
