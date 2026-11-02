"""Tests for the well-known card fetcher and the discovery endpoint."""

from collections.abc import Mapping
from typing import Final
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx
import respx
from fastapi import FastAPI
from fastapi.testclient import TestClient

import litellm
from litellm.constants import REDACTED_BY_LITELM_STRING
from litellm.proxy._types import LitellmUserRoles, UserAPIKeyAuth
from litellm.proxy.a2a.discovery import (
    AGENT_CARD_WELL_KNOWN_PATHS,
    AgentCardDiscoveryError,
    DiscoveryMode,
    card_request_headers,
    fetch_well_known_card,
)
from litellm.proxy.a2a.endpoints import AgentLookup, get_agent_lookup
from litellm.proxy.a2a.endpoints import router as a2a_router
from litellm.proxy.auth.user_api_key_auth import user_api_key_auth
from litellm.types.agents import AgentResponse


@pytest.fixture(autouse=True)
def _disable_url_validation_for_mocks(monkeypatch):
    """The fetch tests use placeholder hostnames (``upstream.example``,
    ``localhost:2024``) with mocked HTTP clients. ``async_safe_get`` would
    otherwise resolve those hostnames and either fail DNS or block on the
    SSRF guard. Disabling validation here lets the unit tests focus on
    fallback / parsing logic; SSRF behavior is covered in its own test."""
    monkeypatch.setattr(litellm, "user_url_validation", False)


# ---------------------------------------------------------------------------
# fetch_well_known_card
# ---------------------------------------------------------------------------


def _mock_response(status_code: int = 200, body=None, raise_json=False):
    response = MagicMock()
    response.status_code = status_code
    if raise_json:
        response.json = MagicMock(side_effect=ValueError("bad json"))
    else:
        response.json = MagicMock(return_value=body)
    return response


@pytest.mark.asyncio
async def test_fetch_uses_first_path_that_returns_200():
    body = {"name": "agent"}
    fake_client = MagicMock()
    fake_client.get = AsyncMock(return_value=_mock_response(200, body=body))

    with patch(
        "litellm.proxy.a2a.discovery.get_async_httpx_client", return_value=fake_client
    ):
        card = await fetch_well_known_card("https://upstream.example")

    assert card == body
    # First call should be to the canonical path.
    called_url = fake_client.get.call_args.args[0]
    assert called_url == f"https://upstream.example{AGENT_CARD_WELL_KNOWN_PATHS[0]}"


@pytest.mark.asyncio
async def test_fetch_falls_back_to_later_paths_on_404():
    body = {"name": "agent"}
    fake_client = MagicMock()
    fake_client.get = AsyncMock(
        side_effect=[
            _mock_response(404),
            _mock_response(404),
            _mock_response(200, body=body),
        ]
    )

    with patch(
        "litellm.proxy.a2a.discovery.get_async_httpx_client", return_value=fake_client
    ):
        card = await fetch_well_known_card("https://upstream.example")

    assert card == body
    assert fake_client.get.await_count == len(AGENT_CARD_WELL_KNOWN_PATHS)


@pytest.mark.asyncio
async def test_fetch_raises_when_all_paths_fail():
    fake_client = MagicMock()
    fake_client.get = AsyncMock(
        side_effect=[_mock_response(404) for _ in AGENT_CARD_WELL_KNOWN_PATHS]
    )

    with patch(
        "litellm.proxy.a2a.discovery.get_async_httpx_client", return_value=fake_client
    ):
        with pytest.raises(AgentCardDiscoveryError):
            await fetch_well_known_card("https://upstream.example")


@pytest.mark.asyncio
async def test_fetch_skips_path_that_returns_non_json_body():
    body = {"name": "agent"}
    fake_client = MagicMock()
    fake_client.get = AsyncMock(
        side_effect=[
            _mock_response(200, raise_json=True),
            _mock_response(200, body=body),
        ]
    )

    with patch(
        "litellm.proxy.a2a.discovery.get_async_httpx_client", return_value=fake_client
    ):
        card = await fetch_well_known_card("https://upstream.example")

    assert card == body


@pytest.mark.asyncio
async def test_fetch_skips_path_that_returns_non_object_json():
    fake_client = MagicMock()
    fake_client.get = AsyncMock(
        side_effect=[
            _mock_response(200, body=["not", "an", "object"]),
            _mock_response(200, body={"name": "agent"}),
            _mock_response(404),
        ]
    )

    with patch(
        "litellm.proxy.a2a.discovery.get_async_httpx_client", return_value=fake_client
    ):
        card = await fetch_well_known_card("https://upstream.example")

    assert card == {"name": "agent"}


@pytest.mark.asyncio
async def test_fetch_requires_base_url():
    with pytest.raises(AgentCardDiscoveryError):
        await fetch_well_known_card("")


# ---------------------------------------------------------------------------
# LangGraph Platform discovery mode
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_langgraph_mode_appends_assistant_id_query_param():
    """LangGraph serves one card endpoint; the assistant is selected via query string."""
    body = {"name": "support-agent"}
    fake_client = MagicMock()
    fake_client.get = AsyncMock(return_value=_mock_response(200, body=body))

    with patch(
        "litellm.proxy.a2a.discovery.get_async_httpx_client", return_value=fake_client
    ):
        card = await fetch_well_known_card(
            "http://localhost:2024",
            discovery_mode=DiscoveryMode.LANGGRAPH_PLATFORM,
            params={"assistant_id": "agent"},
        )

    assert card == body
    called_url = fake_client.get.call_args.args[0]
    # The canonical A2A path with the LangGraph query parameter — NOT a
    # per-assistant subpath like /agent/.well-known/agent-card.json.
    assert called_url == (
        "http://localhost:2024/.well-known/agent-card.json?assistant_id=agent"
    )


@pytest.mark.asyncio
async def test_langgraph_mode_requires_assistant_id():
    with pytest.raises(AgentCardDiscoveryError, match="assistant_id"):
        await fetch_well_known_card(
            "http://localhost:2024",
            discovery_mode=DiscoveryMode.LANGGRAPH_PLATFORM,
            params={},
        )


@pytest.mark.asyncio
async def test_langgraph_mode_falls_back_to_older_well_known_paths():
    """If an older LangGraph deployment serves /.well-known/agent.json, accept that too."""
    fake_client = MagicMock()
    fake_client.get = AsyncMock(
        side_effect=[
            _mock_response(404),
            _mock_response(200, body={"name": "support-agent"}),
        ]
    )

    with patch(
        "litellm.proxy.a2a.discovery.get_async_httpx_client", return_value=fake_client
    ):
        card = await fetch_well_known_card(
            "http://localhost:2024",
            discovery_mode=DiscoveryMode.LANGGRAPH_PLATFORM,
            params={"assistant_id": "agent"},
        )

    assert card == {"name": "support-agent"}
    # Both calls carry the assistant_id query param.
    for call in fake_client.get.await_args_list:
        assert "assistant_id=agent" in call.args[0]


# ---------------------------------------------------------------------------
# POST /v1/a2a/discover
# ---------------------------------------------------------------------------


def _client_for_role(role: LitellmUserRoles) -> TestClient:
    app = FastAPI()
    app.include_router(a2a_router)
    app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(
        user_id="u", user_role=role
    )
    return TestClient(app)


def test_discover_admin_returns_raw_card():
    client = _client_for_role(LitellmUserRoles.PROXY_ADMIN)
    with patch(
        "litellm.proxy.a2a.endpoints.fetch_well_known_card",
        new=AsyncMock(return_value={"name": "Upstream"}),
    ):
        resp = client.post("/v1/a2a/discover", json={"url": "https://upstream.example"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["url"] == "https://upstream.example"
    assert body["agent_card"] == {"name": "Upstream"}


def test_discover_non_admin_forbidden():
    client = _client_for_role(LitellmUserRoles.INTERNAL_USER)
    resp = client.post("/v1/a2a/discover", json={"url": "https://upstream.example"})
    assert resp.status_code == 403


def test_discover_returns_400_when_upstream_unreachable():
    client = _client_for_role(LitellmUserRoles.PROXY_ADMIN)
    with patch(
        "litellm.proxy.a2a.endpoints.fetch_well_known_card",
        new=AsyncMock(side_effect=AgentCardDiscoveryError("no luck")),
    ):
        resp = client.post("/v1/a2a/discover", json={"url": "https://upstream.example"})

    assert resp.status_code == 400
    assert "no luck" in resp.json()["detail"]


def test_discover_forwards_mode_and_params_to_fetcher():
    """The endpoint must hand discovery_mode + params to fetch_well_known_card."""
    client = _client_for_role(LitellmUserRoles.PROXY_ADMIN)
    fetch_stub = AsyncMock(return_value={"name": "support-agent"})
    with patch("litellm.proxy.a2a.endpoints.fetch_well_known_card", new=fetch_stub):
        resp = client.post(
            "/v1/a2a/discover",
            json={
                "url": "http://localhost:2024",
                "discovery_mode": "langgraph_platform",
                "params": {"assistant_id": "agent"},
            },
        )

    assert resp.status_code == 200
    # Pydantic deserializes the JSON string back into the DiscoveryMode enum.
    assert fetch_stub.await_args is not None
    kwargs = fetch_stub.await_args.kwargs
    assert kwargs["discovery_mode"] == DiscoveryMode.LANGGRAPH_PLATFORM
    assert kwargs["params"] == {"assistant_id": "agent"}


def test_discover_rejects_unknown_mode():
    """Pydantic should 422 on an enum value we don't recognize."""
    client = _client_for_role(LitellmUserRoles.PROXY_ADMIN)
    resp = client.post(
        "/v1/a2a/discover",
        json={"url": "http://localhost:2024", "discovery_mode": "bogus"},
    )
    assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Discovery authenticates like the saved agent
# ---------------------------------------------------------------------------

_UPSTREAM: Final = "https://upstream.example"
_CARD: Final = {"name": "upstream-agent"}
_SAVED_KEY: Final = "sk-saved-upstream-key"
_REFUSED: Final = "Re-enter the API key to test this connection. A saved key is only sent to its own agent's URL"


def _saved_agent(api_base: str | None, card_url: str = "", api_key: str | None = _SAVED_KEY) -> AgentResponse:
    return AgentResponse(
        agent_id="saved-agent",
        agent_name="saved-agent",
        litellm_params={"api_key": api_key, **({"api_base": api_base} if api_base else {})},
        agent_card_params={"url": card_url},
    )


def _lookup(*agents: AgentResponse) -> AgentLookup:
    by_id: Final = {agent.agent_id: agent for agent in agents}

    async def lookup(agent_id: str) -> AgentResponse | None:
        return by_id.get(agent_id)

    return lookup


def _admin_client(lookup: AgentLookup) -> TestClient:
    app: Final = FastAPI()
    app.include_router(a2a_router)
    app.dependency_overrides[user_api_key_auth] = lambda: UserAPIKeyAuth(
        user_id="u", user_role=LitellmUserRoles.PROXY_ADMIN
    )
    app.dependency_overrides[get_agent_lookup] = lambda: lookup
    return TestClient(app)


@pytest.mark.parametrize(
    ("api_key", "static_headers", "mode", "expected"),
    [
        ("sk-typed", {}, DiscoveryMode.WELL_KNOWN_FALLBACK, {"Authorization": "Bearer sk-typed"}),
        (
            "sk-typed",
            {"x-tenant": "t1"},
            DiscoveryMode.WELL_KNOWN_FALLBACK,
            {"Authorization": "Bearer sk-typed", "x-tenant": "t1"},
        ),
        (
            "sk-typed",
            {"authorization": "Basic dXNlcjpwdw=="},
            DiscoveryMode.WELL_KNOWN_FALLBACK,
            {"authorization": "Basic dXNlcjpwdw=="},
        ),
        (
            "sk-typed",
            {"authorization": "Basic dXNlcjpwdw==", "x-tenant": "t1"},
            DiscoveryMode.LANGGRAPH_PLATFORM,
            {"x-tenant": "t1", "Authorization": "Bearer sk-typed"},
        ),
        (
            None,
            {"authorization": "Basic dXNlcjpwdw=="},
            DiscoveryMode.LANGGRAPH_PLATFORM,
            {"authorization": "Basic dXNlcjpwdw=="},
        ),
        ("", {}, DiscoveryMode.WELL_KNOWN_FALLBACK, {}),
    ],
)
def test_card_request_headers_authenticate_like_the_agents_runtime(
    api_key: str | None, static_headers: Mapping[str, str], mode: DiscoveryMode, expected: Mapping[str, str]
) -> None:
    assert dict(card_request_headers(api_key, static_headers, mode)) == expected


@pytest.mark.usefixtures("httpx_transport")
@respx.mock
def test_discover_sends_the_typed_key_and_static_headers_upstream() -> None:
    route: Final = respx.get(f"{_UPSTREAM}/.well-known/agent-card.json").respond(200, json=_CARD)

    response: Final = _admin_client(_lookup()).post(
        "/v1/a2a/discover",
        json={"url": _UPSTREAM, "api_key": "sk-typed", "static_headers": {"x-tenant": "t1"}},
    )

    assert response.status_code == 200, response.text
    sent: Final = route.calls.last.request.headers
    assert (sent.get("authorization"), sent.get("x-tenant")) == ("Bearer sk-typed", "t1")


@pytest.mark.usefixtures("httpx_transport")
@respx.mock
def test_discover_without_credentials_sends_no_authorization() -> None:
    route: Final = respx.get(f"{_UPSTREAM}/.well-known/agent-card.json").respond(200, json=_CARD)

    response: Final = _admin_client(_lookup()).post("/v1/a2a/discover", json={"url": _UPSTREAM})

    assert response.status_code == 200, response.text
    assert route.calls.last.request.headers.get("authorization") is None


@pytest.mark.parametrize(
    "saved_agent",
    [
        _saved_agent(api_base=f"{_UPSTREAM}/lgp/deployment"),
        _saved_agent(api_base=None, card_url=f"{_UPSTREAM}/a2a"),
        _saved_agent(api_base=f"{_UPSTREAM}/lgp/deployment", card_url="https://upstream.example:443/a2a"),
        _saved_agent(api_base=_UPSTREAM, card_url="https://elsewhere.example/a2a"),
        _saved_agent(api_base="https://lg.internal:8443", card_url=f"{_UPSTREAM}/a2a"),
    ],
)
@pytest.mark.usefixtures("httpx_transport")
@respx.mock
def test_discover_reuses_the_saved_key_for_the_saved_agents_origin(saved_agent: AgentResponse) -> None:
    route: Final = respx.get(f"{_UPSTREAM}/lgp/deployment/.well-known/agent-card.json").respond(200, json=_CARD)

    response: Final = _admin_client(_lookup(saved_agent)).post(
        "/v1/a2a/discover",
        json={
            "url": f"{_UPSTREAM}/lgp/deployment",
            "api_key": REDACTED_BY_LITELM_STRING,
            "agent_id": "saved-agent",
        },
    )

    assert response.status_code == 200, response.text
    assert route.calls.last.request.headers.get("authorization") == f"Bearer {_SAVED_KEY}"


@pytest.mark.usefixtures("httpx_transport")
@respx.mock
def test_discover_sends_a_typed_key_even_when_the_agent_has_a_saved_one() -> None:
    route: Final = respx.get(f"{_UPSTREAM}/.well-known/agent-card.json").respond(200, json=_CARD)

    response: Final = _admin_client(_lookup(_saved_agent(api_base=_UPSTREAM))).post(
        "/v1/a2a/discover",
        json={"url": _UPSTREAM, "api_key": "sk-rotated", "agent_id": "saved-agent"},
    )

    assert response.status_code == 200, response.text
    assert route.calls.last.request.headers.get("authorization") == "Bearer sk-rotated"


@pytest.mark.parametrize(
    ("saved_agent", "request_url", "agent_id"),
    [
        (_saved_agent(api_base=_UPSTREAM), "https://elsewhere.example", "saved-agent"),
        (_saved_agent(api_base=_UPSTREAM), "https://upstream.example:8443", "saved-agent"),
        (_saved_agent(api_base=_UPSTREAM), "http://upstream.example", "saved-agent"),
        (_saved_agent(api_base=_UPSTREAM, card_url="https://elsewhere.example"), "https://third.example", "saved-agent"),
        (_saved_agent(api_base=_UPSTREAM), _UPSTREAM, "missing-agent"),
        (_saved_agent(api_base=_UPSTREAM), _UPSTREAM, None),
        (_saved_agent(api_base=_UPSTREAM, api_key=None), _UPSTREAM, "saved-agent"),
        (_saved_agent(api_base=_UPSTREAM, api_key=""), _UPSTREAM, "saved-agent"),
        (_saved_agent(api_base=None), _UPSTREAM, "saved-agent"),
        (_saved_agent(api_base="not a url"), "not a url", "saved-agent"),
    ],
)
@pytest.mark.usefixtures("httpx_transport")
def test_discover_refuses_a_redacted_key_it_cannot_send_to_the_saved_origin(
    saved_agent: AgentResponse, request_url: str, agent_id: str | None
) -> None:
    with respx.mock(assert_all_called=False) as router:
        upstream: Final = router.route().respond(200, json=_CARD)
        response: Final = _admin_client(_lookup(saved_agent)).post(
            "/v1/a2a/discover",
            json={"url": request_url, "api_key": REDACTED_BY_LITELM_STRING, "agent_id": agent_id},
        )

    assert (response.status_code, response.json()["detail"]) == (400, _REFUSED)
    assert upstream.call_count == 0


_LOCAL_AGENT: Final = "http://127.0.0.1:8123"
_OTHER_ORIGIN: Final = "http://127.0.0.1:8124"


@pytest.mark.parametrize("validate_urls", [True, False])
@pytest.mark.usefixtures("httpx_transport")
def test_discover_never_follows_a_redirect_with_the_agents_credentials(
    monkeypatch: pytest.MonkeyPatch, validate_urls: bool
) -> None:
    monkeypatch.setattr(litellm, "user_url_validation", validate_urls)
    monkeypatch.setattr(litellm, "user_url_allowed_hosts", ["127.0.0.1:8123", "127.0.0.1:8124"])
    with respx.mock(assert_all_called=False) as router:
        router.get(url__startswith=_LOCAL_AGENT).respond(302, headers={"Location": f"{_OTHER_ORIGIN}/card"})
        elsewhere: Final = router.get(url__startswith=_OTHER_ORIGIN).respond(200, json=_CARD)
        response: Final = _admin_client(_lookup()).post(
            "/v1/a2a/discover", json={"url": _LOCAL_AGENT, "static_headers": {"x-api-key": "secret"}}
        )

    assert (response.status_code, response.json()["detail"]) == (
        400,
        "http://127.0.0.1:8123/.well-known/agent-card.json answered HTTP 302 with a redirect, "
        "and discovery does not follow redirects while sending the agent's credentials",
    )
    assert elsewhere.call_count == 0


@pytest.mark.parametrize(
    ("upstream_error", "expected_reason"),
    [
        ("Illegal header value b'Bearer sk-leaky-key\\n'", "Illegal header value b'<redacted>\\n'"),
        ("token sk-leaky-key was rejected", "token <redacted> was rejected"),
    ],
)
@pytest.mark.usefixtures("httpx_transport")
def test_discover_keeps_the_agents_key_out_of_error_details(upstream_error: str, expected_reason: str) -> None:
    with respx.mock(assert_all_called=False) as router:
        router.route().mock(side_effect=httpx.ConnectError(upstream_error))
        response: Final = _admin_client(_lookup()).post(
            "/v1/a2a/discover", json={"url": _UPSTREAM, "api_key": "sk-leaky-key"}
        )

    assert (response.status_code, response.json()["detail"]) == (
        400,
        "Could not fetch agent card from https://upstream.example (mode=well_known_fallback). "
        f"Last error: https://upstream.example/agent.json: {expected_reason}",
    )


@pytest.mark.parametrize("validate_urls", [True, False])
@pytest.mark.usefixtures("httpx_transport")
def test_discover_still_follows_redirects_without_credentials(
    monkeypatch: pytest.MonkeyPatch, validate_urls: bool
) -> None:
    monkeypatch.setattr(litellm, "user_url_validation", validate_urls)
    monkeypatch.setattr(litellm, "user_url_allowed_hosts", ["127.0.0.1:8123", "127.0.0.1:8124"])
    with respx.mock(assert_all_called=False) as router:
        router.get(url__startswith=_LOCAL_AGENT).respond(302, headers={"Location": f"{_OTHER_ORIGIN}/card"})
        router.get(url__startswith=_OTHER_ORIGIN).respond(200, json=_CARD)
        response: Final = _admin_client(_lookup()).post("/v1/a2a/discover", json={"url": _LOCAL_AGENT})

    assert (response.status_code, response.json()["agent_card"]) == (200, _CARD)
