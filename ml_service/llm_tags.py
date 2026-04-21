"""LLM-based tag extraction using Anthropic Claude with tool use.

Calls Claude with the ``emit_tags`` tool to extract structured tags from
reservation notes. Results are cached in-process (FIFO, 1 000-entry cap).

Environment variables
---------------------
ANTHROPIC_API_KEY   Required for real calls; absent → raises LLMUnavailableError.
LLM_TAGS_REQUIRED   When "true", unavailability raises 503 instead of silently
                    returning an empty result (see tag_pipeline.py).
"""
from __future__ import annotations

import hashlib
import logging
import os
from collections import OrderedDict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

try:
    import anthropic
except ImportError:
    anthropic = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cost constants (claude-sonnet-4-6, 2025-04)
# ---------------------------------------------------------------------------
_COST_INPUT_PER_TOKEN = 3.00 / 1_000_000   # $3.00 / M input tokens
_COST_OUTPUT_PER_TOKEN = 15.00 / 1_000_000  # $15.00 / M output tokens

# ---------------------------------------------------------------------------
# In-process cache (FIFO eviction at 1 000 entries)
# ---------------------------------------------------------------------------
_CACHE_MAX = 1_000
_cache: OrderedDict[str, "LLMTagResult"] = OrderedDict()

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class ExtractedTag:
    tag: str
    category: str
    confidence: float
    evidence_span: str


@dataclass
class LLMSentiment:
    score: float
    label: str    # "positive" | "neutral" | "negative"
    rationale: str


@dataclass
class LLMTagResult:
    tags: list[ExtractedTag] = field(default_factory=list)
    urgency: str = "low"             # "low" | "medium" | "high"
    sentiment: Optional[LLMSentiment] = None
    cached: bool = False
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost_usd: float = 0.0


class LLMUnavailableError(RuntimeError):
    """Raised when the Anthropic API key is absent or the client fails to init."""


# ---------------------------------------------------------------------------
# Prompt loading
# ---------------------------------------------------------------------------

def _load_prompt(locale: str) -> str:
    prompt_path = Path(__file__).parent / "prompts" / "tag_extraction_v1.md"
    template = prompt_path.read_text(encoding="utf-8")
    if locale and locale.lower().startswith("ar"):
        locale_note = (
            "The note may be written in Arabic. Extract tags and translate them to English "
            "for the tag/category fields. Keep evidence_span in the original language."
        )
    else:
        locale_note = "The note is expected to be in English."
    return template.replace("{locale_note}", locale_note)


# ---------------------------------------------------------------------------
# Tool schema
# ---------------------------------------------------------------------------

_EMIT_TAGS_TOOL: dict = {
    "name": "emit_tags",
    "description": "Emit structured tags extracted from a reservation note.",
    "input_schema": {
        "type": "object",
        "required": ["tags", "urgency", "sentiment"],
        "properties": {
            "tags": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["tag", "category", "confidence", "evidence_span"],
                    "properties": {
                        "tag":           {"type": "string"},
                        "category":      {"type": "string"},
                        "confidence":    {"type": "number", "minimum": 0.0, "maximum": 1.0},
                        "evidence_span": {"type": "string"},
                    },
                },
            },
            "urgency": {
                "type": "string",
                "enum": ["low", "medium", "high"],
            },
            "sentiment": {
                "type": "object",
                "required": ["score", "label", "rationale"],
                "properties": {
                    "score":    {"type": "number", "minimum": 0.0, "maximum": 1.0},
                    "label":    {"type": "string", "enum": ["positive", "neutral", "negative"]},
                    "rationale": {"type": "string"},
                },
            },
        },
    },
}

# ---------------------------------------------------------------------------
# Cache helpers
# ---------------------------------------------------------------------------


def _cache_key(text: str, locale: str) -> str:
    payload = f"{locale}:{text}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _cache_get(key: str) -> Optional[LLMTagResult]:
    if key in _cache:
        _cache.move_to_end(key)
        result = _cache[key]
        return LLMTagResult(
            tags=result.tags,
            urgency=result.urgency,
            sentiment=result.sentiment,
            cached=True,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            estimated_cost_usd=result.estimated_cost_usd,
        )
    return None


def _cache_put(key: str, result: LLMTagResult) -> None:
    if key in _cache:
        _cache.move_to_end(key)
    _cache[key] = result
    if len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)  # FIFO: evict oldest


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def extract_tags_llm(text: str, locale: str = "en") -> LLMTagResult:
    """Extract tags from *text* using Claude's emit_tags tool.

    Args:
        text:   Raw reservation note (may be empty, English, or Arabic).
        locale: BCP-47 locale hint, e.g. "en", "ar".  Affects the system-
                prompt locale_note and the cache key.

    Returns:
        LLMTagResult.  On cache hit, ``cached=True``.

    Raises:
        LLMUnavailableError: ANTHROPIC_API_KEY absent or client init failed.
    """
    if anthropic is None:
        raise LLMUnavailableError("anthropic package is not installed.")

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        raise LLMUnavailableError(
            "ANTHROPIC_API_KEY is not set — LLM tag extraction unavailable."
        )

    normalized = (text or "").strip()
    key = _cache_key(normalized, locale)

    cached = _cache_get(key)
    if cached is not None:
        logger.debug("llm_tags: cache hit (key=%s…)", key[:12])
        return cached

    client = anthropic.Anthropic(api_key=api_key)
    system_prompt = _load_prompt(locale)

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=system_prompt,
        tools=[_EMIT_TAGS_TOOL],
        tool_choice={"type": "tool", "name": "emit_tags"},
        messages=[{"role": "user", "content": normalized or "(empty note)"}],
    )

    input_tokens = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
    cost = (
        input_tokens * _COST_INPUT_PER_TOKEN
        + output_tokens * _COST_OUTPUT_PER_TOKEN
    )

    logger.info(
        "llm_tags: %.0f in + %.0f out tokens → $%.5f",
        input_tokens,
        output_tokens,
        cost,
    )

    tool_input: dict = {}
    for block in response.content:
        if block.type == "tool_use" and block.name == "emit_tags":
            tool_input = block.input
            break

    tags = [
        ExtractedTag(
            tag=t["tag"],
            category=t["category"],
            confidence=float(t["confidence"]),
            evidence_span=t["evidence_span"],
        )
        for t in tool_input.get("tags", [])
    ]

    raw_sentiment = tool_input.get("sentiment", {})
    sentiment = LLMSentiment(
        score=float(raw_sentiment.get("score", 0.5)),
        label=raw_sentiment.get("label", "neutral"),
        rationale=raw_sentiment.get("rationale", ""),
    ) if raw_sentiment else None

    result = LLMTagResult(
        tags=tags,
        urgency=tool_input.get("urgency", "low"),
        sentiment=sentiment,
        cached=False,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        estimated_cost_usd=round(cost, 6),
    )

    _cache_put(key, result)
    return result


def clear_cache() -> None:
    """Clear the in-process LLM response cache (useful in tests)."""
    _cache.clear()
