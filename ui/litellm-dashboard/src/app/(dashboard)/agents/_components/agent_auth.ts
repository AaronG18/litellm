import { AUTH_TYPE, AUTH_TYPE_ITEMS } from "@/components/mcp_tools/types";
import type { AgentFormValues, AgentRequestPayload, StaticHeaderFormValue } from "./AgentFormKit";

export const REDACTED_SECRET = "REDACTED_BY_LITELM";

export const AGENT_AUTH_TYPE_ITEMS = AUTH_TYPE_ITEMS.filter(
  (item) => item.value === AUTH_TYPE.NONE || item.value === AUTH_TYPE.BEARER_TOKEN,
);

export interface AgentAuthSupport {
  bearer: boolean;
  headers: boolean;
}

export const agentAuthSupport = (agentType: string, usesA2AFormFields?: boolean | null): AgentAuthSupport => {
  const bearer = agentType === "a2a" || agentType === "langgraph";
  return { bearer, headers: bearer || Boolean(usesA2AFormFields) };
};

interface SavedAgentAuth {
  litellm_params?: Record<string, unknown> | null;
  static_headers?: Record<string, string> | null;
  extra_headers?: string[] | null;
}

export const agentAuthFormValues = (agent: SavedAgentAuth): AgentFormValues => {
  const apiKey = agent.litellm_params?.api_key;
  const savedKey = typeof apiKey === "string" ? apiKey : "";
  return {
    auth_type: savedKey ? AUTH_TYPE.BEARER_TOKEN : AUTH_TYPE.NONE,
    api_key: savedKey,
    static_headers: Object.entries(agent.static_headers ?? {}).map(([header, value]) => ({ header, value })),
    extra_headers: agent.extra_headers ?? [],
  };
};

const staticHeaderMap = (rows: StaticHeaderFormValue[] | undefined): Record<string, string> =>
  Object.fromEntries(
    (rows ?? []).flatMap(({ header, value }) => {
      const name = header?.trim();
      return name ? [[name, value ?? ""]] : [];
    }),
  );

const bearerKey = (values: AgentFormValues): string | undefined =>
  values.auth_type === AUTH_TYPE.BEARER_TOKEN && values.api_key ? values.api_key : undefined;

const sameHeaders = (a: Record<string, string>, b: Record<string, string>): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

/** Adds only the auth fields the admin changed, since PATCH replaces litellm_params as a whole. */
export const withAgentAuth = (
  payload: AgentRequestPayload,
  values: AgentFormValues,
  support: AgentAuthSupport,
  saved: SavedAgentAuth = {},
): AgentRequestPayload => {
  const before = agentAuthFormValues(saved);
  const apiKey = bearerKey(values) ?? null;
  const staticHeaders = staticHeaderMap(values.static_headers);
  const extraHeaders = values.extra_headers ?? [];
  const keyChanged = support.bearer && apiKey !== (bearerKey(before) ?? null);
  const staticChanged = support.headers && !sameHeaders(staticHeaders, staticHeaderMap(before.static_headers));
  const extraChanged = support.headers && JSON.stringify(extraHeaders) !== JSON.stringify(before.extra_headers);
  return {
    ...payload,
    ...(keyChanged ? { litellm_params: { ...(payload.litellm_params ?? saved.litellm_params), api_key: apiKey } } : {}),
    ...(staticChanged ? { static_headers: staticHeaders } : {}),
    ...(extraChanged ? { extra_headers: extraHeaders } : {}),
  };
};

export interface DiscoveryAuth {
  api_key?: string;
  static_headers?: Record<string, string>;
  agent_id?: string;
}

export const discoveryAuth = (
  values: AgentFormValues,
  support: AgentAuthSupport,
  savedAgentId?: string,
): DiscoveryAuth => {
  const apiKey = support.bearer ? bearerKey(values) : undefined;
  const staticHeaders = support.headers ? staticHeaderMap(values.static_headers) : {};
  return {
    ...(apiKey ? { api_key: apiKey } : {}),
    ...(Object.keys(staticHeaders).length > 0 ? { static_headers: staticHeaders } : {}),
    ...(apiKey === REDACTED_SECRET && savedAgentId ? { agent_id: savedAgentId } : {}),
  };
};

export const validateAuthValue = (value: unknown, values: AgentFormValues): true | string => {
  if (values.auth_type !== AUTH_TYPE.BEARER_TOKEN) return true;
  return typeof value === "string" && value.trim() ? true : "Please enter the token";
};
