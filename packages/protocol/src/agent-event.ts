import { z } from "zod";

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
    tokensIn: z.number().nonnegative(),
    tokensOut: z.number().nonnegative(),
    costUsd: z.number().nonnegative().optional(),
  })
  .strict();

export const AgentEventErrorSchema = z
  .object({
    kind: z.literal("error"),
    message: z.string().min(1),
    fatal: z.boolean(),
  })
  .strict();

export const AgentEventDoneSchema = z
  .object({
    kind: z.literal("done"),
    status: z.enum(["ok", "cancelled", "error"]),
    summary: z.string(),
  })
  .strict();

export const AgentEventSchema = z.discriminatedUnion("kind", [
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
]);

export type AgentEvent = z.infer<typeof AgentEventSchema>;
export type AgentEventKind = AgentEvent["kind"];
