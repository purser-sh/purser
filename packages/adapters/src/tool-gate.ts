import { z } from "zod";

export const TOOL_NAMES = [
  "read_file",
  "write_file",
  "apply_patch",
  "list_dir",
  "ripgrep_search",
  "run_bash",
  "web_search",
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

const ReadFileArgsSchema = z.object({ path: z.string() }).strict();
const WriteFileArgsSchema = z.object({ path: z.string(), content: z.string() }).strict();
const ApplyPatchArgsSchema = z.object({ patch: z.string() }).strict();
const ListDirArgsSchema = z.object({ path: z.string() }).strict();
const RipgrepSearchArgsSchema = z
  .object({ query: z.string(), glob: z.string().optional() })
  .strict();
const RunBashArgsSchema = z.object({ command: z.string() }).strict();
const WebSearchArgsSchema = z.object({ query: z.string() }).strict();

const TOOL_SCHEMAS: Record<ToolName, z.ZodType<unknown>> = {
  read_file: ReadFileArgsSchema,
  write_file: WriteFileArgsSchema,
  apply_patch: ApplyPatchArgsSchema,
  list_dir: ListDirArgsSchema,
  ripgrep_search: RipgrepSearchArgsSchema,
  run_bash: RunBashArgsSchema,
  web_search: WebSearchArgsSchema,
};

export type GateResult =
  | { ok: true; name: ToolName; args: unknown }
  | { ok: false; reason: string };

export type ReadFileArgs = z.infer<typeof ReadFileArgsSchema>;
export type WriteFileArgs = z.infer<typeof WriteFileArgsSchema>;
export type ApplyPatchArgs = z.infer<typeof ApplyPatchArgsSchema>;
export type ListDirArgs = z.infer<typeof ListDirArgsSchema>;
export type RipgrepSearchArgs = z.infer<typeof RipgrepSearchArgsSchema>;
export type RunBashArgs = z.infer<typeof RunBashArgsSchema>;
export type WebSearchArgs = z.infer<typeof WebSearchArgsSchema>;

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

function formatValidationError(error: z.ZodError): string {
  const parts = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "arguments";
    return `${path}: ${issue.message}`;
  });
  return parts.join("; ");
}

function parseRawArguments(rawArguments: string | unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (typeof rawArguments !== "string") {
    return { ok: true, value: rawArguments };
  }
  try {
    return { ok: true, value: JSON.parse(rawArguments) as unknown };
  } catch {
    return {
      ok: false,
      reason:
        "Invalid JSON in tool arguments. Arguments must be valid JSON — expressions, concatenation, and function calls are not allowed.",
    };
  }
}

/**
 * Single validation gate for every hosted tool call. Invalid input is rejected; nothing executes.
 */
export function gateToolCall(name: string, rawArguments: string | unknown, registered: ReadonlySet<string>): GateResult {
  if (!registered.has(name)) {
    return { ok: false, reason: `Unknown tool "${name}".` };
  }
  if (!isToolName(name)) {
    return { ok: false, reason: `Tool "${name}" is not registered for schema validation.` };
  }
  const parsed = parseRawArguments(rawArguments);
  if (!parsed.ok) {
    return parsed;
  }
  const validated = TOOL_SCHEMAS[name].safeParse(parsed.value);
  if (!validated.success) {
    return { ok: false, reason: formatValidationError(validated.error) };
  }
  return { ok: true, name, args: validated.data };
}

/** Message suitable for feeding back to the model on rejection. */
export function gateReasonForModel(result: Extract<GateResult, { ok: false }>): string {
  return `Tool call rejected: ${result.reason} Fix the arguments and retry with valid JSON.`;
}
