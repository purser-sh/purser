import { z } from "zod";
import { RemedySchema } from "./readiness.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function migrateLegacyUsage(value: unknown): unknown {
  if (!isRecord(value) || value.kind !== "usage") {
    return value;
  }
  if ("inputTokens" in value) {
    return value;
  }
  if (typeof value.tokensIn === "number" && typeof value.tokensOut === "number") {
    return {
      kind: "usage",
      inputTokens: value.tokensIn,
      outputTokens: value.tokensOut,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      source: "provider_usage",
    };
  }
  return value;
}

export const AgentEventSessionStartedSchema = z
  .object({
    kind: z.literal("session_started"),
    providerSessionId: z.string().min(1),
  })
  .strict();

export const AgentEventTextDeltaSchema = z
  .object({
    kind: z.literal("text_delta"),
    text: z.string(),
  })
  .strict();

export const AgentEventTextSchema = z
  .object({
    kind: z.literal("text"),
    text: z.string(),
  })
  .strict();

export const AgentEventThinkingSchema = z
  .object({
    kind: z.literal("thinking"),
    text: z.string(),
  })
  .strict();

export const AgentEventToolCallSchema = z
  .object({
    kind: z.literal("tool_call"),
    toolId: z.string().min(1),
    name: z.string().min(1),
    input: z.unknown(),
    summary: z.string().min(1),
  })
  .strict();

export const AgentEventToolResultSchema = z
  .object({
    kind: z.literal("tool_result"),
    toolId: z.string().min(1),
    ok: z.boolean(),
    output: z.unknown(),
    ms: z.number().nonnegative(),
  })
  .strict();

export const AgentEventFileDiffSchema = z
  .object({
    kind: z.literal("file_diff"),
    path: z.string().min(1),
    patch: z.string(),
    added: z.number().int().nonnegative(),
    removed: z.number().int().nonnegative(),
    /** True when the change is staged and not yet on disk (ask mode). */
    staged: z.boolean().optional(),
    /** Present on staged diffs; stripped before SQLite persist, kept in runner staging store. */
    newContent: z.string().optional(),
    oldContent: z.string().optional(),
    sizeDeltaWarning: z
      .object({
        severity: z.literal("high"),
        message: z.string(),
        priorBytes: z.number().int().nonnegative(),
        newBytes: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const AgentEventPermissionRequestSchema = z
  .object({
    kind: z.literal("permission_request"),
    requestId: z.string().min(1),
    action: z.string().min(1),
    detail: z.unknown(),
  })
  .strict();

export const AgentEventUsageSchema = z
  .object({
    kind: z.literal("usage"),
    inputTokens: z.number().int().nonnegative().nullable(),
    outputTokens: z.number().int().nonnegative().nullable(),
    cacheReadTokens: z.number().int().nonnegative().nullable(),
    cacheWriteTokens: z.number().int().nonnegative().nullable(),
    source: z.enum(["provider_usage", "estimated"]),
  })
  .strict();

export const AgentEventErrorSchema = z
  .object({
    kind: z.literal("error"),
    message: z.string().min(1),
    fatal: z.boolean(),
    /** Optional so error rows written before readiness landed still parse. */
    remedy: RemedySchema.nullable().optional(),
  })
  .strict();

export const AgentEventDoneSchema = z
  .object({
    kind: z.literal("done"),
    status: z.enum(["ok", "cancelled", "error"]),
    summary: z.string(),
  })
  .strict();

export const AgentEventSchema = z.preprocess(
  migrateLegacyUsage,
  z.discriminatedUnion("kind", [
    AgentEventSessionStartedSchema,
    AgentEventTextDeltaSchema,
    AgentEventTextSchema,
    AgentEventThinkingSchema,
    AgentEventToolCallSchema,
    AgentEventToolResultSchema,
    AgentEventFileDiffSchema,
    AgentEventPermissionRequestSchema,
    AgentEventUsageSchema,
    AgentEventErrorSchema,
    AgentEventDoneSchema,
  ]),
);

export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventKind = AgentEvent["kind"];
