"""Domain exceptions for Ruiru Titans internal MCP server boundary."""


class MCPAuthenticationError(Exception):
    """Raised when an internal MCP actor token is missing, malformed, or invalid."""


class MCPAuthorizationError(Exception):
    """Raised when an authenticated actor lacks required active staff permissions."""


class MCPScopeInjectionError(Exception):
    """Raised when a caller attempts to supply or override scope parameters."""
