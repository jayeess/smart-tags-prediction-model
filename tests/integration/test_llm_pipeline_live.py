"""Live integration tests for the LLM tag pipeline.

These tests make real Anthropic API calls.  They are SKIPPED unless the
ANTHROPIC_API_KEY environment variable is set, so they never run in CI.

Run locally with a valid key:

    ANTHROPIC_API_KEY=sk-ant-... python -m pytest tests/integration/ -v

Three fixed inputs cover the key behavioural scenarios.
"""
from __future__ import annotations

import os

import pytest

from ml_service.llm_tags import clear_cache, extract_tags_llm
from ml_service.tag_pipeline import run_pipeline

pytestmark = pytest.mark.skipif(
    not os.environ.get("ANTHROPIC_API_KEY"),
    reason="ANTHROPIC_API_KEY not set — skipping live LLM integration tests",
)


@pytest.fixture(autouse=True)
def no_cache():
    clear_cache()
    yield
    clear_cache()


# ---------------------------------------------------------------------------
# Input 1: empty note
# ---------------------------------------------------------------------------

class TestEmptyNote:
    def test_empty_note_returns_no_tags(self):
        result = extract_tags_llm("", locale="en")
        assert isinstance(result.tags, list)
        assert len(result.tags) == 0

    def test_empty_note_urgency_is_low(self):
        result = extract_tags_llm("", locale="en")
        assert result.urgency == "low"

    def test_empty_note_sentiment_is_neutral(self):
        result = extract_tags_llm("", locale="en")
        assert result.sentiment is not None
        assert result.sentiment.label == "neutral"


# ---------------------------------------------------------------------------
# Input 2: English — shellfish allergy + anniversary (high urgency expected)
# ---------------------------------------------------------------------------

ALLERGY_ANNIVERSARY_NOTE = (
    "It's our 10th anniversary. My wife has a severe shellfish allergy — "
    "she carries an EpiPen. Please inform the kitchen."
)


class TestAllergyAnniversaryNote:
    def test_anniversary_tag_extracted(self):
        result = extract_tags_llm(ALLERGY_ANNIVERSARY_NOTE, locale="en")
        tags = {t.tag.lower() for t in result.tags}
        assert any("anniversary" in tag for tag in tags), f"Got tags: {tags}"

    def test_shellfish_or_allergy_tag_extracted(self):
        result = extract_tags_llm(ALLERGY_ANNIVERSARY_NOTE, locale="en")
        tags = {t.tag.lower() for t in result.tags}
        assert any("shellfish" in tag or "allerg" in tag or "epipen" in tag for tag in tags), \
            f"Got tags: {tags}"

    def test_urgency_is_high(self):
        result = extract_tags_llm(ALLERGY_ANNIVERSARY_NOTE, locale="en")
        assert result.urgency == "high", f"Expected high urgency, got: {result.urgency}"

    def test_sentiment_is_positive_or_neutral(self):
        result = extract_tags_llm(ALLERGY_ANNIVERSARY_NOTE, locale="en")
        assert result.sentiment is not None
        assert result.sentiment.label in ("positive", "neutral"), \
            f"Unexpected sentiment: {result.sentiment.label}"

    def test_pipeline_llm_used(self):
        result = run_pipeline(ALLERGY_ANNIVERSARY_NOTE, locale="en")
        assert result.llm_used is True

    def test_pipeline_fallback_not_used_when_llm_succeeds(self):
        result = run_pipeline(ALLERGY_ANNIVERSARY_NOTE, locale="en")
        if result.llm_used:
            assert result.fallback_used is False


# ---------------------------------------------------------------------------
# Input 3: Arabic — birthday + quiet table
# ---------------------------------------------------------------------------

ARABIC_NOTE = "عيد ميلاد زوجتي، نريد طاولة هادئة بعيدة عن الموسيقى"


class TestArabicNote:
    def test_birthday_tag_extracted_in_english(self):
        result = extract_tags_llm(ARABIC_NOTE, locale="ar")
        tags = {t.tag.lower() for t in result.tags}
        assert any("birthday" in tag for tag in tags), f"Got tags: {tags}"

    def test_evidence_span_in_arabic(self):
        result = extract_tags_llm(ARABIC_NOTE, locale="ar")
        birthday_tags = [t for t in result.tags if "birthday" in t.tag.lower()]
        assert birthday_tags, "No birthday tag found"
        span = birthday_tags[0].evidence_span
        assert any(ord(c) > 0x0600 for c in span), \
            f"Expected Arabic characters in evidence_span, got: {span!r}"

    def test_at_least_one_tag_extracted(self):
        result = extract_tags_llm(ARABIC_NOTE, locale="ar")
        assert len(result.tags) >= 1, f"Expected ≥1 tag, got: {result.tags}"

    def test_sentiment_populated(self):
        result = extract_tags_llm(ARABIC_NOTE, locale="ar")
        assert result.sentiment is not None
        assert result.sentiment.label in ("positive", "neutral", "negative")

    def test_urgency_is_medium(self):
        result = extract_tags_llm(ARABIC_NOTE, locale="ar")
        assert result.urgency in ("low", "medium"), \
            f"Birthday should not be high urgency, got: {result.urgency}"
