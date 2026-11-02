import React from "react";
import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { AUTH_TYPE } from "@/components/mcp_tools/types";
import { PasswordInput } from "@/components/shared/PasswordInput";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldGroup, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AgentFormField, AgentFormValues, AgentTagsInput, labelWithHint } from "./AgentFormKit";
import { AGENT_AUTH_TYPE_ITEMS, AgentAuthSupport, validateAuthValue } from "./agent_auth";

const StaticHeadersFieldArray = () => {
  const { control } = useFormContext<AgentFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "static_headers" });

  return (
    <>
      {fields.map((item, index) => (
        <div key={item.id} className="flex items-start gap-2">
          <AgentFormField name={`static_headers.${index}.header`} rules={{ required: "Header name required" }}>
            {({ value, onChange, ref, ...control }) => (
              <Input
                {...control}
                ref={ref}
                className="w-55"
                placeholder="Header name (e.g. x-api-key)"
                value={typeof value === "string" ? value : ""}
                onChange={onChange}
              />
            )}
          </AgentFormField>
          <AgentFormField name={`static_headers.${index}.value`} rules={{ required: "Value required" }}>
            {({ value, onChange, ref, ...control }) => (
              <Input
                {...control}
                ref={ref}
                className="w-65"
                placeholder="Value"
                value={typeof value === "string" ? value : ""}
                onChange={onChange}
              />
            )}
          </AgentFormField>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove static header"
            className="text-destructive hover:text-destructive/80"
            onClick={() => remove(index)}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => append({})}>
        <Plus />
        Add Static Header
      </Button>
    </>
  );
};

const authTypeDescription = (authType: unknown, agentName: unknown): string =>
  authType === AUTH_TYPE.BEARER_TOKEN
    ? "Saved in LiteLLM and sent to the agent as Authorization: Bearer <token>."
    : `No token is saved here. Each caller can send its own in x-a2a-${
        typeof agentName === "string" && agentName ? agentName : "<agent-name>"
      }-authorization: Bearer <token>.`;

const AgentAuthSettings = ({ support }: { support: AgentAuthSupport }) => {
  const { control } = useFormContext<AgentFormValues>();
  const authType = useWatch({ control, name: "auth_type" });
  const agentName = useWatch({ control, name: "agent_name" });

  if (!support.bearer && !support.headers) return null;

  return (
    <Collapsible defaultOpen className="mb-4 rounded-md border border-border px-4">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-4 py-3 text-left">
        <span className="text-sm font-semibold text-foreground">Authentication settings</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent keepMounted>
        <FieldGroup className="pb-5">
          {support.bearer && (
            <AgentFormField
              name="auth_type"
              label="Authentication"
              defaultValue={AUTH_TYPE.NONE}
              description={authTypeDescription(authType, agentName)}
            >
              {({ value, onChange, ...control }) => (
                <Select
                  items={AGENT_AUTH_TYPE_ITEMS}
                  value={typeof value === "string" ? value : AUTH_TYPE.NONE}
                  onValueChange={(next) => next !== null && onChange(next)}
                >
                  <SelectTrigger id={control.id} aria-invalid={control["aria-invalid"]} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_AUTH_TYPE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </AgentFormField>
          )}

          {support.bearer && authType === AUTH_TYPE.BEARER_TOKEN && (
            <AgentFormField
              name="api_key"
              label={labelWithHint("Authentication Value", "The token LiteLLM sends to the agent")}
              rules={{ validate: validateAuthValue }}
            >
              {({ value, onChange, ref, ...control }) => (
                <PasswordInput
                  {...control}
                  ref={ref}
                  value={typeof value === "string" ? value : ""}
                  onChange={onChange}
                  placeholder="Token"
                />
              )}
            </AgentFormField>
          )}

          {support.headers && (
            <>
              <Field>
                <FieldTitle>
                  {labelWithHint(
                    "Static Headers",
                    "Headers always sent to the backend agent, regardless of the client request. Admin-configured, static wins on conflict.",
                  )}
                </FieldTitle>
                <div className="flex flex-col gap-2">
                  <StaticHeadersFieldArray />
                </div>
              </Field>

              <AgentFormField
                name="extra_headers"
                label={labelWithHint(
                  "Forward Client Headers",
                  "Header names to extract from the client's request and forward to the agent. Type a name and press Enter.",
                )}
              >
                {({ id, value, onChange }) => (
                  <AgentTagsInput
                    id={id}
                    value={Array.isArray(value) ? (value as string[]) : []}
                    onValueChange={onChange}
                    placeholder="e.g. x-api-key, Authorization"
                  />
                )}
              </AgentFormField>
            </>
          )}
        </FieldGroup>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default AgentAuthSettings;
