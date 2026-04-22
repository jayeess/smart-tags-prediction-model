"""Endpoint tests for POST /api/v1/reservations/analyze-tags-v2.

All LLM and pipeline calls are mocked — no real network traffic.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from ml_service.llm_tags import LLMUnavailableError, clear_cache
from ml_service.tag_pipeline import PipelineTag, TagPipelineResult


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _pipeline_result(
    tags: list[dict] | None = None,
    urgency: str = "low",
    llm_used: bool = True,
    fallback_used: bool = False,
    llm_sentiment_score: float = 0.5,
) -> TagPipelineResult:
    from ml_service.llm_tags import LLMSentiment

    result = TagPipelineResult(
        urgency=urgency,
        llm_used=llm_used,
        fallback_used=fallback_used,
        llm_sentiment=LLMSentiment(
            score=llm_sentiment_score,
            label="neutral",
            rationale="test",
        ),
    )
    for t in (tags or []):
        result.tags.append(
            PipelineTag(
                tag=t["tag"],
                category=t.get("category", "occasion"),
                confidence=t.get("confidence", 0.9),
                source=t.get("source", "llm"),
                evidence_span=t.get("evidence_span", ""),
            )
        )
    return result


@pytest.fixture(autouse=True)
def clear_cache_fixture():
    clear_cache()
    yield
    clear_cache()


@pytest.fixture()
def client():
    from api.index import app
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------

class TestAnalyzeTagsV2HappyPath:
    def test_returns_200(self, client):
        with patch("api.index.run_pipeline", return_value=_pipeline_result(
            [{"tag": "birthday", "category": "occasion", "source": "llm"}]
        )):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": "birthday dinner"},
                headers={"X-Tenant-ID": "t1"},
            )
        assert resp.status_code == 200

    def test_birthday_tag_in_response(self, client):
        with patch("api.index.run_pipeline", return_value=_pipeline_result(
            [{"tag": "birthday", "category": "occasion", "source": "llm"}]
        )):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": "birthday dinner"},
                headers={"X-Tenant-ID": "t1"},
            )
        data = resp.json()
        tag_names = [t["tag"] for t in data["tags"]]
        assert "birthday" in tag_names

    def test_urgency_field_present(self, client):
        with patch("api.index.run_pipeline", return_value=_pipeline_result(urgency="high")):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": "epipen"},
                headers={"X-Tenant-ID": "t1"},
            )
        assert resp.json()["urgency"] == "high"

    def test_llm_used_flag_propagated(self, client):
        with patch("api.index.run_pipeline", return_value=_pipeline_result(llm_used=True)):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": "test"},
                headers={"X-Tenant-ID": "t1"},
            )
        assert resp.json()["llm_used"] is True

    def test_fallback_used_flag_propagated(self, client):
        with patch("api.index.run_pipeline", return_value=_pipeline_result(
            llm_used=False, fallback_used=True
        )):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": "birthday"},
                headers={"X-Tenant-ID": "t1"},
            )
        assert resp.json()["fallback_used"] is True

    def test_sentiment_shape(self, client):
        with patch("api.index.run_pipeline", return_value=_pipeline_result()):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": "great experience"},
                headers={"X-Tenant-ID": "t1"},
            )
        sentiment = resp.json()["sentiment"]
        assert "score" in sentiment
        assert "label" in sentiment
        assert "emoji" in sentiment

    def test_provenance_icon_present_in_each_tag(self, client):
        with patch("api.index.run_pipeline", return_value=_pipeline_result(
            [{"tag": "vegan", "category": "dietary", "source": "llm"}]
        )):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": "strictly vegan"},
                headers={"X-Tenant-ID": "t1"},
            )
        for tag in resp.json()["tags"]:
            assert "provenance_icon" in tag
            assert tag["provenance_icon"] != ""

    def test_empty_notes_returns_200(self, client):
        with patch("api.index.run_pipeline", return_value=_pipeline_result()):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": ""},
                headers={"X-Tenant-ID": "t1"},
            )
        assert resp.status_code == 200

    def test_default_tenant_id_accepted(self, client):
        with patch("api.index.run_pipeline", return_value=_pipeline_result()):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": "test"},
            )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 503 when LLM required
# ---------------------------------------------------------------------------

class TestAnalyzeTagsV2LLMRequired:
    def test_503_when_llm_required_and_unavailable(self, client, monkeypatch):
        monkeypatch.setenv("LLM_TAGS_REQUIRED", "true")
        with patch(
            "api.index.run_pipeline",
            side_effect=LLMUnavailableError("no key"),
        ):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": "test"},
                headers={"X-Tenant-ID": "t1"},
            )
        assert resp.status_code == 503

    def test_503_body_contains_detail(self, client, monkeypatch):
        monkeypatch.setenv("LLM_TAGS_REQUIRED", "true")
        with patch(
            "api.index.run_pipeline",
            side_effect=LLMUnavailableError("no key"),
        ):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": "test"},
                headers={"X-Tenant-ID": "t1"},
            )
        assert "detail" in resp.json()

    def test_200_when_llm_not_required_and_pipeline_falls_back(self, client, monkeypatch):
        monkeypatch.delenv("LLM_TAGS_REQUIRED", raising=False)
        with patch("api.index.run_pipeline", return_value=_pipeline_result(
            llm_used=False, fallback_used=True
        )):
            resp = client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={"notes": "birthday"},
                headers={"X-Tenant-ID": "t1"},
            )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Structured form fields forwarded
# ---------------------------------------------------------------------------

class TestAnalyzeTagsV2FormFields:
    def test_form_fields_forwarded_to_pipeline(self, client):
        call_kwargs: dict = {}

        def capture_pipeline(**kwargs):
            call_kwargs.update(kwargs)
            return _pipeline_result()

        with patch("api.index.run_pipeline", side_effect=capture_pipeline):
            client.post(
                "/api/v1/reservations/analyze-tags-v2",
                json={
                    "notes": "test",
                    "party_size": 6,
                    "children": 2,
                    "is_repeat_guest": True,
                    "previous_completions": 7,
                    "locale": "ar",
                },
                headers={"X-Tenant-ID": "t1"},
            )

        assert call_kwargs.get("party_size") == 6
        assert call_kwargs.get("children") == 2
        assert call_kwargs.get("is_repeat_guest") is True
        assert call_kwargs.get("previous_completions") == 7
        assert call_kwargs.get("locale") == "ar"
        assert call_kwargs.get("tenant_id") == "t1"


# ---------------------------------------------------------------------------
# v1 /analyze-tags uses the same pipeline (use_llm=False)
# ---------------------------------------------------------------------------

class TestAnalyzeTagsV1UsesPipeline:
    def test_v1_returns_200(self, client):
        resp = client.post(
            "/api/v1/reservations/analyze-tags",
            json={"special_request_text": "birthday dinner", "dietary_preferences": "", "customer_name": "Test"},
        )
        assert resp.status_code == 200

    def test_v1_birthday_tag_extracted(self, client):
        resp = client.post(
            "/api/v1/reservations/analyze-tags",
            json={"special_request_text": "birthday dinner", "dietary_preferences": "", "customer_name": "Test"},
        )
        data = resp.json()
        tag_names = [t["tag"].lower() for t in data["tags"]]
        assert any("birthday" in n for n in tag_names)

    def test_v1_response_shape_unchanged(self, client):
        resp = client.post(
            "/api/v1/reservations/analyze-tags",
            json={"special_request_text": "anniversary", "dietary_preferences": "", "customer_name": "Alice"},
        )
        data = resp.json()
        assert "customer_name" in data
        assert "tags" in data
        assert "sentiment" in data
        assert "confidence" in data
        assert "engine" in data
        for tag in data["tags"]:
            assert "tag" in tag
            assert "category" in tag
            assert "color" in tag

    def test_v1_engine_name_updated(self, client):
        resp = client.post(
            "/api/v1/reservations/analyze-tags",
            json={"special_request_text": "test", "dietary_preferences": "", "customer_name": "Test"},
        )
        assert resp.json()["engine"] == "fallback-regex-v1"

    def test_v1_no_llm_call_made(self, client):
        with patch("api.index.run_pipeline", wraps=__import__("ml_service.tag_pipeline", fromlist=["run_pipeline"]).run_pipeline) as mock_pipe:
            client.post(
                "/api/v1/reservations/analyze-tags",
                json={"special_request_text": "birthday", "dietary_preferences": "", "customer_name": "Test"},
            )
        call_kwargs = mock_pipe.call_args
        assert call_kwargs is not None
        assert call_kwargs.kwargs.get("use_llm") is False or (
            len(call_kwargs.args) >= 2 and call_kwargs.args[1] is False
        )
