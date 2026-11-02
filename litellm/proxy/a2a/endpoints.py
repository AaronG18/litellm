"""
FastAPI routes for the A2A registration flow.

Today this exposes a single endpoint, ``POST /v1/a2a/discover``, used by the
LiteLLM UI when an admin registers a new A2A agent: the UI hands us the
upstream agent's base URL, we fetch its well-known card, and we return the
raw card so the UI can render the agent's skills/capabilities and let the
admin pick which ones to expose through the proxy. The actual merge into a
LiteLLM-fronted card happens when the agent is saved via ``POST /v1/agents``.
"""

from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Annotated, Final, TypeAlias

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import Field

from litellm._logging import verbose_proxy_logger
from litellm.constants import REDACTED_BY_LITELM_STRING
from litellm.litellm_core_utils.url_utils import SSRFError, assert_same_origin
from litellm.proxy._types import LitellmUserRoles, UserAPIKeyAuth
from litellm.proxy.a2a.discovery import (
    AGENT_CARD_WELL_KNOWN_PATHS,
    AgentCardDiscoveryError,
    DiscoveryMode,
    card_request_headers,
    fetch_well_known_card,
)
from litellm.proxy.auth.user_api_key_auth import user_api_key_auth
from litellm.proxy.common_utils.registry_read_through import get_agent_with_read_through
from litellm.types.agents import AgentResponse
from litellm.types.llms.base import LiteLLMBaseModel

router: Final = APIRouter()


class DiscoverAgentRequest(LiteLLMBaseModel):
    url: str = Field(
        ...,
        description=(
            "Base URL of the upstream agent. Behavior depends on "
            "``discovery_mode``: ``well_known_fallback`` (default) tries "
            f"{', '.join(AGENT_CARD_WELL_KNOWN_PATHS)} under this URL in "
            "order; ``langgraph_platform`` hits "
            "``/.well-known/agent-card.json?assistant_id=<id>`` instead."
        ),
    )
    discovery_mode: DiscoveryMode = Field(
        default=DiscoveryMode.WELL_KNOWN_FALLBACK,
        description=(
            "How to locate the upstream card. "
            "``well_known_fallback`` for pure A2A agents (try standard paths); "
            "``langgraph_platform`` for LangGraph Platform deployments where "
            "the card is shared across assistants and disambiguated by a "
            "query parameter."
        ),
    )
    params: dict[str, object] | None = Field(
        default=None,
        description=(
            "Mode-specific parameters. ``langgraph_platform`` requires "
            "``{'assistant_id': <id>}``. ``well_known_fallback`` ignores this."
        ),
    )
    api_key: str | None = Field(
        default=None,
        description=(
            "The agent's ``litellm_params.api_key``, sent as ``Authorization: Bearer <api_key>``. "
            f"``{REDACTED_BY_LITELM_STRING}`` reuses the key saved on ``agent_id``."
        ),
    )
    static_headers: Mapping[str, str] | None = Field(
        default=None,
        description="The agent's ``static_headers``, combined with ``api_key`` the way the agent's runtime does.",
    )
    agent_id: str | None = Field(
        default=None,
        description="Saved agent whose key fills in a redacted ``api_key``, only for a ``url`` on that agent's origin.",
    )


class DiscoverAgentResponse(LiteLLMBaseModel):
    url: str
    agent_card: dict[str, object]


@dataclass(frozen=True, slots=True)
class SavedKeyRefused:
    pass


SAVED_KEY_REFUSED_DETAIL: Final = (
    "Re-enter the API key to test this connection. A saved key is only sent to its own agent's URL"
)


AgentLookup: TypeAlias = Callable[[str], Awaitable[AgentResponse | None]]


def get_agent_lookup() -> AgentLookup:
    return get_agent_with_read_through


def _same_origin(url: str, saved_url: str) -> bool:
    try:
        assert_same_origin(url, saved_url)
    except SSRFError:
        return False
    return True


def _saved_urls(agent: AgentResponse) -> tuple[str, ...]:
    params: Final[Mapping[str, object]] = agent.litellm_params or {}
    card: Final[Mapping[str, object]] = agent.agent_card_params
    candidates: Final = (params.get("api_base"), card.get("url"))
    return tuple(url for url in candidates if isinstance(url, str) and url)


async def _discovery_api_key(request: DiscoverAgentRequest, lookup: AgentLookup) -> str | None | SavedKeyRefused:
    if request.api_key != REDACTED_BY_LITELM_STRING:
        return request.api_key
    agent: Final = await lookup(request.agent_id) if request.agent_id else None
    if agent is None:
        return SavedKeyRefused()
    saved_urls: Final = _saved_urls(agent)
    saved_key: Final = (agent.litellm_params or {}).get("api_key")
    sends_to_saved_origin: Final = any(_same_origin(request.url, url) for url in saved_urls)
    if not sends_to_saved_origin or not isinstance(saved_key, str) or not saved_key:
        return SavedKeyRefused()
    return saved_key


@router.post(
    "/v1/a2a/discover",
    tags=["[beta] A2A Agents"],
    dependencies=[Depends(user_api_key_auth)],
    response_model=DiscoverAgentResponse,
)
async def discover_agent_card(
    request: DiscoverAgentRequest,
    lookup: Annotated[AgentLookup, Depends(get_agent_lookup)],
    user_api_key_dict: UserAPIKeyAuth = Depends(user_api_key_auth),
) -> JSONResponse:
    """
    Fetch the upstream agent's well-known card so the UI can show the admin
    which skills/capabilities the agent exposes.

    Only proxy admins can call this — the UI uses it during agent registration,
    and we don't want arbitrary keys probing internal URLs.

    Example:
    ```bash
    curl -X POST "http://localhost:4000/v1/a2a/discover" \\
        -H "Authorization: Bearer <admin_key>" \\
        -H "Content-Type: application/json" \\
        -d '{"url": "https://upstream-agent.example.com"}'
    ```
    """
    if user_api_key_dict.user_role != LitellmUserRoles.PROXY_ADMIN:
        raise HTTPException(
            status_code=403,
            detail=(f"Only proxy admins can discover agent cards. Your role={user_api_key_dict.user_role}"),
        )

    api_key: Final = await _discovery_api_key(request, lookup)
    if isinstance(api_key, SavedKeyRefused):
        raise HTTPException(status_code=400, detail=SAVED_KEY_REFUSED_DETAIL)

    try:
        card: Final = await fetch_well_known_card(
            request.url,
            discovery_mode=request.discovery_mode,
            params=request.params,
            headers=dict(card_request_headers(api_key, request.static_headers or {}, request.discovery_mode)),
        )
    except AgentCardDiscoveryError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        verbose_proxy_logger.exception("Unexpected error during A2A discovery: %s", exc)
        raise HTTPException(status_code=500, detail=f"Discovery failed: {exc}")

    return JSONResponse(
        content={"url": request.url, "agent_card": card},
        media_type="application/json",
    )
