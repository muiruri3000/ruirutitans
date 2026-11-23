from rest_framework import permissions
from .authentication import PlayerUser


VIEW_PERMISSION_MAP = {
    # Players management
    "AdminPlayerRegisterAPIView": "manage_players",
    "AdminPlayerResetPasswordAPIView": "manage_players",
    "AdminPlayerToggleStatusAPIView": "manage_players",
    "AdminPlayerReleaseNumberAPIView": "manage_players",
    "AdminPlayerUpdatePositionAPIView": "manage_players",
    "AdminPlayerUpdateUsernameAPIView": "manage_players",
    # Teams & Competitions
    "CategoryListCreateAPIView": "manage_teams",
    "CategoryDetailAPIView": "manage_teams",
    "CategoryToggleArchiveAPIView": "manage_teams",
    "ResetSeasonAPIView": "manage_teams",
    "ReloadCanonicalScheduleAPIView": "manage_teams",
    "TeamBalancerAPIView": "manage_teams",
    # Fixtures & Match reports
    "FixtureReportAPIView": "manage_fixtures",
    # Duty Roster
    "DutyRosterAPIView": "manage_duty_roster",
    # Transfers & Bans
    "TransferListCreateAPIView": "manage_transfers",
    "TransferActionAPIView": "manage_transfers",
    "TransferToggleWindowAPIView": "manage_transfers",
    "TransferDirectAPIView": "manage_transfers",
    "TransferFreeAgentCreateAPIView": "manage_transfers",
    "PlayerBanListCreateAPIView": "manage_transfers",
    "PlayerBanLiftAPIView": "manage_transfers",
    # Voting & MVP
    "VotingAdminToggleAPIView": "manage_voting",
    "VotingFormationUpdateAPIView": "manage_voting",
    "WeeklyMVPAPIView": "manage_voting",
    # Homepage
    "HighlightListCreateAPIView": "manage_homepage",
    "HighlightDeleteAPIView": "manage_homepage",
    "VisitorCommentAPIView": "manage_homepage",
    "VisitorCommentDetailAPIView": "manage_homepage",
    "HomepageImageUploadAPIView": "manage_homepage",
    # Users & Roles
    "CMSUsersAPIView": "manage_users",
    "GroupRolesAPIView": "manage_users",
    "GroupRoleDetailAPIView": "manage_users",
    "GroupRoleMembersAPIView": "manage_users",
}


def get_view_required_permission(view, request=None):
    """
    Infers the granular permission key required for a given view or URL path.
    """
    view_class = getattr(view, "__class__", None)
    class_name = getattr(view_class, "__name__", "")
    if class_name in VIEW_PERMISSION_MAP:
        return VIEW_PERMISSION_MAP[class_name]

    if request:
        raw_req = getattr(request, "_request", request)
        path = getattr(raw_req, "path", getattr(request, "path", ""))
        if "/api/admin/players/" in path:
            return "manage_players"
        if "/duty-roster/" in path:
            return "manage_duty_roster"
        if "/tactics/" in path:
            return "manage_tactics"
        if "/fixtures/" in path or "/match-report/" in path:
            return "manage_fixtures"
        if "/transfers/" in path or "/bans/" in path:
            return "manage_transfers"
        if "/voting/" in path or "/mvp/" in path:
            return "manage_voting"
        if "/homepage/" in path or "/highlights/" in path or "/comments/" in path:
            return "manage_homepage"
        if "/cms-users/" in path or "/group-roles/" in path:
            return "manage_users"

    return None


class IsCMSAdmin(permissions.BasePermission):
    """
    Allows access to authenticated CMS / Admin managers (staff or superuser)
    or to authenticated Club Players who hold the required function/permission
    inherently from their assigned Group Roles.
    """

    def has_permission(self, request, view):
        if getattr(request, "cms_user", None):
            return True
        if request.user and request.user.is_authenticated:
            if getattr(request.user, "is_staff", False) or getattr(request.user, "is_superuser", False):
                return True

        # Check if authenticated player has inherited required permissions from group role(s)
        player = getattr(request, "player", None)
        if not player and request.user and request.user.is_authenticated:
            player = getattr(request.user, "player", None)

        if player and getattr(player, "is_active", True) and not getattr(player, "must_change_password", False):
            player_perms = player.get_effective_permissions()
            required_perm = getattr(view, "required_permission", None)
            if required_perm:
                return bool(player_perms.get(required_perm, False))

            mapped_perm = get_view_required_permission(view, request)
            if mapped_perm:
                return bool(player_perms.get(mapped_perm, False))

            # If StateAPIView (writing to tournament state), require at least one functional management permission
            view_class = getattr(view, "__class__", None)
            if getattr(view_class, "__name__", "") == "StateAPIView":
                return bool(
                    player_perms.get("manage_fixtures")
                    or player_perms.get("manage_duty_roster")
                    or player_perms.get("manage_tactics")
                    or player_perms.get("manage_teams")
                    or player_perms.get("manage_players")
                    or player_perms.get("manage_transfers")
                    or player_perms.get("manage_homepage")
                    or player_perms.get("manage_voting")
                )

            # Fallback: if player has at least one administrative capability
            return any(player_perms.values())

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
    Write access (POST, PUT, PATCH, DELETE) strictly requires CMS Administrator
    or a Player user with the required function/permission inherited from their Group Role.
    """

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return IsCMSAdmin().has_permission(request, view)
