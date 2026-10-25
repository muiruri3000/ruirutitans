from rest_framework import permissions
from .authentication import PlayerUser


class IsCMSAdmin(permissions.BasePermission):
    """
    Allows access only to authenticated CMS / Admin managers (staff or superuser).
    """

    def has_permission(self, request, view):
        if getattr(request, "cms_user", None):
            return True
        if request.user and request.user.is_authenticated:
            return bool(getattr(request.user, "is_staff", False) or getattr(request.user, "is_superuser", False))
        return False


class IsPlayerUser(permissions.BasePermission):
    """
    Allows access only to authenticated club players who have completed initial password setup.
    Mutually exclusive with CMS managers.
    """

    def has_permission(self, request, view):
        if getattr(request, "cms_user", None):
            return False
        player_obj = getattr(request, "player", None)
        if request.user and request.user.is_authenticated:
            if getattr(request.user, "is_staff", False) or getattr(request.user, "is_superuser", False):
                return False
            if isinstance(request.user, PlayerUser) or hasattr(request.user, "player"):
                player_obj = getattr(request.user, "player", player_obj)
        if not player_obj:
            return False
        if getattr(player_obj, "must_change_password", False):
            return False
        return True


class IsPlayerSelfOrCMSAdmin(permissions.BasePermission):
    """
    Allows access to CMS Administrators or to the Player themselves.
    """

    def has_permission(self, request, view):
        is_cms = bool(
            getattr(request, "cms_user", None)
            or (request.user and request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser))
        )
        if is_cms:
            return True

        if request.user and request.user.is_authenticated:
            return isinstance(request.user, PlayerUser) or hasattr(request.user, "player")

        return bool(getattr(request, "player", None))


class ReadOnlyOrCMSAdmin(permissions.BasePermission):
    """
    Public read access (GET, HEAD, OPTIONS).
    Write access (POST, PUT, PATCH, DELETE) strictly requires CMS Administrator.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(
            getattr(request, "cms_user", None)
            or (request.user and request.user.is_authenticated and (request.user.is_staff or request.user.is_superuser))
        )
