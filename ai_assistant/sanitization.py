"""Input validation, untrusted tool-output sanitization, and factual grounding guardrails."""

from __future__ import annotations

import logging
import re
import unicodedata
from collections.abc import Mapping, Sequence
from typing import Any

from ai_assistant.exceptions import AIInputValidationError
from mcp_server.schemas import sanitize_untrusted_text

logger = logging.getLogger("ai_assistant.guardrails")

_PROMPT_INJECTION_RE = re.compile(
    r"(?i)("
    r"ignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions|"
    r"disregard\s+(?:all\s+)?(?:previous\s+)?(?:rules|instructions)|"
    r"system\s*override|"
    r"new\s+system\s+prompt\s*:|"
    r"reveal\s+.*(?:api[_\s-]*key|secret|password|token)|"
    r"bypass\s+(?:security|guardrails|safety)|"
    r"you\s+are\s+now\s+in\s+developer\s+mode|"
    r"jailbreak|"
    r"dan\s+mode"
    r")"
)

_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]")

SENSITIVE_KEYS = frozenset(
    {"password", "secret", "token", "api_key", "actor_token", "hash", "salt", "credential"}
)

_SCORE_RE = re.compile(r"\b(\d+)\s*[-–]\s*(\d+)\b")
_NUMERIC_CLAIM_RE = re.compile(r"\b(\d{1,4})\s*(?:goals?|points?|pts|wins?|clean\s+sheets?|yellow\s+cards?|red\s+cards?|matches?|games?)\b", re.IGNORECASE)


def validate_and_clean_user_message(raw_text: str, *, max_chars: int = 4000) -> str:
    """Validate user prompt against injection patterns, control characters, and length bounds."""
    if raw_text is None:
        raise AIInputValidationError("Prompt cannot be empty.")

    cleaned = unicodedata.normalize("NFKC", str(raw_text))
    cleaned = _CONTROL_CHAR_RE.sub(" ", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    if not cleaned:
        raise AIInputValidationError("Prompt cannot be empty or purely whitespace.")

    if len(cleaned) > max_chars:
        raise AIInputValidationError(f"Prompt length ({len(cleaned)}) exceeds limit of {max_chars} characters.")

    match = _PROMPT_INJECTION_RE.search(cleaned)
    if match:
        logger.warning("Prompt injection detected and blocked: '%s'", match.group(0))
        raise AIInputValidationError(
            "Your message contains instructions or keywords that violate AI security policies."
        )

    return cleaned


def sanitize_tool_payload(value: Any, *, _depth: int = 0) -> Any:
    """Recursively scrub sensitive keys and limit oversized strings in MCP tool payloads."""
    if _depth > 8:
        return "[TRUNCATED_DEPTH]"
    if isinstance(value, Mapping):
        sanitized = {}
        for k, v in value.items():
            k_lower = str(k).strip().lower()
            if any(s in k_lower for s in SENSITIVE_KEYS):
                sanitized[str(k)] = "[REDACTED]"
            else:
                sanitized[str(k)] = sanitize_tool_payload(v, _depth=_depth + 1)
        return sanitized
    if isinstance(value, (list, tuple)):
        return [sanitize_tool_payload(item, _depth=_depth + 1) for item in value]
    if isinstance(value, str):
        if len(value) > 2000:
            return value[:2000] + "...[TRUNCATED]"
        return value
    return value


def extract_numbers_from_payload(payload: Any) -> set[int]:
    """Extract all numbers from structured tool results for grounding verification."""
    numbers: set[int] = set()

    def _walk(item: Any, depth: int = 0) -> None:
        if depth > 8:
            return
        if isinstance(item, int):
            numbers.add(item)
        elif isinstance(item, float) and item.is_integer():
            numbers.add(int(item))
        elif isinstance(item, str):
            for m in re.findall(r"\b\d+\b", item):
                try:
                    numbers.add(int(m))
                except ValueError:
                    pass
        elif isinstance(item, Mapping):
            for v in item.values():
                _walk(v, depth + 1)
        elif isinstance(item, (list, tuple)):
            for v in item:
                _walk(v, depth + 1)

    _walk(payload)
    return numbers


def verify_factual_grounding(
    assistant_text: str,
    tool_payloads: Sequence[dict[str, Any]],
) -> tuple[bool, str, list[str]]:
    """Verify factual claims (scores, points, goals) in assistant output against tool results.

    Returns:
        (is_grounded, grounding_status, unverified_claims)
    """
    if not tool_payloads:
        # No tools were invoked; verify no hallucinated specific match score claims
        score_matches = _SCORE_RE.findall(assistant_text)
        if score_matches:
            claims = [f"{s[0]}-{s[1]}" for s in score_matches]
            return False, "unverified_claim", claims
        return True, "direct", []

    known_numbers: set[int] = set()
    for payload in tool_payloads:
        known_numbers.update(extract_numbers_from_payload(payload))

    unverified: list[str] = []

    # Verify score patterns (e.g. 2-1, 3-0)
    for home_s, away_s in _SCORE_RE.findall(assistant_text):
        h, a = int(home_s), int(away_s)
        # Small numbers 0-9 in scores should appear in match outcomes
        if h not in known_numbers and h > 0:
            unverified.append(f"Score {home_s}-{away_s}")
        elif a not in known_numbers and a > 0:
            unverified.append(f"Score {home_s}-{away_s}")

    # Verify specific goal/point claims (e.g. 15 goals, 24 points)
    for val in _NUMERIC_CLAIM_RE.findall(assistant_text):
        n = int(val)
        if n > 0 and n not in known_numbers:
            unverified.append(f"{n} metric")

    if unverified:
        logger.info("Grounding check found unverified claims: %s", unverified)
        return False, "unverified_claim", unverified

    return True, "grounded", []
