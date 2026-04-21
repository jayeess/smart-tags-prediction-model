"""Four-layer tag extraction pipeline.

Layer execution order
---------------------
1. structured_form  — tags derived from reservation form fields (always runs)
2. history          — tags from past-visit patterns (stub; TODO-PHASE-3)
3. llm              — Claude emit_tags tool call (skipped if API key absent)
4. fallback_regex   — safety-net regex for life-critical keywords (runs only
                      when LLM is unavailable or returns zero tags)

Merge rules
-----------
- structured_form and history tags are always included.
- LLM tags are primary; if LLM succeeds with ≥ 1 tag, fallback_regex is
  skipped entirely.
- Deduplication is by normalised tag name (lower-case, stripped).  The first
  occurrence wins; later duplicates from lower-priority layers are dropped.

Environment variables
---------------------
LLM_TAGS_REQUIRED   When "true", an LLM failure raises LLMUnavailableError
                    instead of silently falling through to fallback_regex.
                    Callers (API layer) should surface this as HTTP 503.
"""
from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field
from typing import Literal, Optional

from .llm_tags import LLMSentiment, LLMTagResult, LLMUnavailableError, extract_tags_llm

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

Source = Literal["structured_form", "history", "llm", "fallback_regex"]

_PROVENANCE_ICONS: dict[str, str] = {
    "structured_form": "\U0001F4DD",  # 📝
    "history":         "\U0001F4DC",  # 📜
    "llm":             "\U0001F916",  # 🤖
    "fallback_regex":  "⚠️", # ⚠️
}


@dataclass
class PipelineTag:
    tag: str
    category: str
    confidence: float
    source: Source
    provenance_icon: str = ""
    evidence_span: str = ""

    def __post_init__(self) -> None:
        if not self.provenance_icon:
            self.provenance_icon = _PROVENANCE_ICONS.get(self.source, "")


@dataclass
class TagPipelineResult:
    tags: list[PipelineTag] = field(default_factory=list)
    urgency: str = "low"
    llm_sentiment: Optional[LLMSentiment] = None
    llm_used: bool = False
    fallback_used: bool = False


# ---------------------------------------------------------------------------
# Layer 2: history (stub)
# ---------------------------------------------------------------------------

def history_derived_tags(
    tenant_id: str,
    phone_hash: Optional[str],
) -> list[PipelineTag]:
    # TODO-PHASE-3: query guest_visits and derive behavioural tags
    # (e.g. "loyal regular", "previous no-show") from visit history.
    return []


# ---------------------------------------------------------------------------
# Layer 4: fallback regex
# ---------------------------------------------------------------------------

# Safety-net patterns covering only high-urgency / high-value keywords.
# Intentionally minimal — the LLM handles nuanced extraction.
_FALLBACK_RULES: list[dict] = [
    {
        "pattern": re.compile(r"\b(anaphylaxis|epipen|epi-pen|epi pen)\b", re.I),
        "tag": "epipen / anaphylaxis",
        "category": "dietary",
        "confidence": 0.95,
    },
    {
        "pattern": re.compile(r"\ballerg(y|ic|ies)\b", re.I),
        "tag": "allergy",
        "category": "dietary",
        "confidence": 0.85,
    },
    {
        "pattern": re.compile(r"\bbirthday\b", re.I),
        "tag": "birthday",
        "category": "occasion",
        "confidence": 0.90,
    },
    {
        "pattern": re.compile(r"\banniversary\b", re.I),
        "tag": "anniversary",
        "category": "occasion",
        "confidence": 0.90,
    },
    {
        "pattern": re.compile(r"\bwheelchair\b", re.I),
        "tag": "wheelchair",
        "category": "accessibility",
        "confidence": 0.95,
    },
    {
        "pattern": re.compile(r"\bhigh\s*chair\b", re.I),
        "tag": "high chair",
        "category": "accessibility",
        "confidence": 0.90,
    },
]


def _fallback_regex_tags(text: str) -> list[PipelineTag]:
    results: list[PipelineTag] = []
    for rule in _FALLBACK_RULES:
        m = rule["pattern"].search(text)
        if m:
            results.append(
                PipelineTag(
                    tag=rule["tag"],
                    category=rule["category"],
                    confidence=rule["confidence"],
                    source="fallback_regex",
                    evidence_span=m.group(0),
                )
            )
    return results


# ---------------------------------------------------------------------------
# Layer 1: structured form
# ---------------------------------------------------------------------------

def _structured_form_tags(
    is_repeat_guest: bool,
    children: int,
    party_size: int,
    previous_completions: int,
) -> list[PipelineTag]:
    tags: list[PipelineTag] = []
    if is_repeat_guest:
        confidence = 0.99 if previous_completions >= 5 else 0.90
        label = "loyal regular" if previous_completions >= 5 else "returning guest"
        tags.append(
            PipelineTag(
                tag=label,
                category="vip",
                confidence=confidence,
                source="structured_form",
            )
        )
    if children > 0:
        tags.append(
            PipelineTag(
                tag="family with children",
                category="accessibility",
                confidence=0.95,
                source="structured_form",
            )
        )
    if party_size >= 8:
        tags.append(
            PipelineTag(
                tag="large group",
                category="operational",
                confidence=0.99,
                source="structured_form",
            )
        )
    return tags


# ---------------------------------------------------------------------------
# Deduplication
# ---------------------------------------------------------------------------

def _dedup(tags: list[PipelineTag]) -> list[PipelineTag]:
    seen: set[str] = set()
    out: list[PipelineTag] = []
    for t in tags:
        key = t.tag.lower().strip()
        if key not in seen:
            seen.add(key)
            out.append(t)
    return out


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def run_pipeline(
    notes: str,
    locale: str = "en",
    party_size: int = 0,
    children: int = 0,
    is_repeat_guest: bool = False,
    previous_completions: int = 0,
    tenant_id: str = "",
    phone_hash: Optional[str] = None,
) -> TagPipelineResult:
    """Run the four-layer tag pipeline and return a merged TagPipelineResult.

    Args:
        notes:               Free-text reservation note.
        locale:              BCP-47 locale hint for the LLM prompt ("en", "ar").
        party_size:          Total guest count (used by structured_form layer).
        children:            Children count (used by structured_form layer).
        is_repeat_guest:     Caller-supplied repeat flag.
        previous_completions: Completed visit count (used for loyal-regular tag).
        tenant_id:           Tenant for history lookup.
        phone_hash:          Hashed phone for history lookup (None → skip).

    Returns:
        TagPipelineResult with merged tags, urgency, llm_sentiment, and
        boolean flags for which layers fired.

    Raises:
        LLMUnavailableError: Only when LLM_TAGS_REQUIRED env var is "true"
                             and the LLM call fails.
    """
    result = TagPipelineResult()
    all_tags: list[PipelineTag] = []

    # -- Layer 1: structured form --
    form_tags = _structured_form_tags(
        is_repeat_guest=is_repeat_guest,
        children=children,
        party_size=party_size,
        previous_completions=previous_completions,
    )
    all_tags.extend(form_tags)

    # -- Layer 2: history (stub) --
    hist_tags = history_derived_tags(tenant_id=tenant_id, phone_hash=phone_hash)
    all_tags.extend(hist_tags)

    # -- Layer 3: LLM --
    llm_result: Optional[LLMTagResult] = None
    llm_failed = False

    try:
        llm_result = extract_tags_llm(text=notes, locale=locale)
        result.llm_used = True
        result.urgency = llm_result.urgency
        result.llm_sentiment = llm_result.sentiment
        for t in llm_result.tags:
            all_tags.append(
                PipelineTag(
                    tag=t.tag,
                    category=t.category,
                    confidence=t.confidence,
                    source="llm",
                    evidence_span=t.evidence_span,
                )
            )
    except LLMUnavailableError:
        llm_failed = True
        logger.info("tag_pipeline: LLM unavailable — checking LLM_TAGS_REQUIRED")
        if os.environ.get("LLM_TAGS_REQUIRED", "").lower() == "true":
            raise
    except Exception as exc:
        llm_failed = True
        logger.warning("tag_pipeline: LLM call failed (%s: %s)", type(exc).__name__, exc)
        if os.environ.get("LLM_TAGS_REQUIRED", "").lower() == "true":
            raise LLMUnavailableError(f"LLM call failed: {exc}") from exc

    # -- Layer 4: fallback regex --
    # Runs only when LLM failed or returned zero tags from the note.
    llm_tag_count = len(llm_result.tags) if llm_result else 0
    if llm_failed or llm_tag_count == 0:
        regex_tags = _fallback_regex_tags(notes)
        if regex_tags:
            result.fallback_used = True
            all_tags.extend(regex_tags)
            # Derive urgency from fallback tags if LLM didn't set it
            if not result.llm_used:
                high_urgency_cats = {"dietary"}
                for t in regex_tags:
                    if t.category in high_urgency_cats and "allerg" in t.tag.lower():
                        result.urgency = "medium"
                    if t.tag in ("epipen / anaphylaxis",):
                        result.urgency = "high"

    result.tags = _dedup(all_tags)
    return result
