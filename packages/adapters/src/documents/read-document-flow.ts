import { formatTokenCount } from "@purser-sh/pricing";
import type { ReadDocumentArgs } from "../tool-gate.ts";
import type { DocumentApprovalRequest, DocumentDecision } from "../types.ts";
import { convertDocument, truncateMarkdown } from "./convert.ts";
import { formatLabel } from "./formats.ts";
import { DEFAULT_DOCUMENT_SETTINGS, type DocumentSettings } from "./settings.ts";

export type ReadDocumentFlowInput = {
  cwd: string;
  args: ReadDocumentArgs;
  modelId?: string | null;
  settings?: Partial<DocumentSettings>;
  home?: string;
  requestId: string;
  askDocument?: (request: DocumentApprovalRequest) => Promise<DocumentDecision>;
  checkDocumentBudget?: (tokens: number) => string | null;
  estimateDocumentCost?: (tokens: number) => string | null;
};

export type ReadDocumentFlowResult =
  | { ok: true; output: string; summary: string }
  | { ok: false; output: string; summary: string };

export async function runReadDocumentFlow(input: ReadDocumentFlowInput): Promise<ReadDocumentFlowResult> {
  const settings = { ...DEFAULT_DOCUMENT_SETTINGS, ...input.settings };
  const converted = await convertDocument({
    cwd: input.cwd,
    relativePath: input.args.path,
    modelId: input.modelId,
    settings,
    home: input.home,
  });
  if (!converted.ok) {
    return { ok: false, output: converted.message, summary: converted.message };
  }

  let markdown = converted.markdown;
  let tokens = converted.tokenCount.value;
  const tokenSource = converted.tokenCount.source;
  const format = formatLabel(converted.format);

  const budgetRefusal = input.checkDocumentBudget?.(tokens) ?? null;
  if (budgetRefusal !== null) {
    return {
      ok: false,
      output: budgetRefusal,
      summary: budgetRefusal,
    };
  }

  if (tokens > settings.tokenThreshold && input.askDocument !== undefined) {
    const decision = await input.askDocument({
      requestId: input.requestId,
      path: input.args.path,
      format,
      tokenCount: tokens,
      tokenSource,
      threshold: settings.tokenThreshold,
      costLabel: input.estimateDocumentCost?.(tokens) ?? null,
    });
    if (decision === "cancel") {
      const message = `User cancelled: ${input.args.path} (${formatTokenCount(converted.tokenCount)} tokens) was not added to context. Try a smaller file, a partial read, or ask about a specific section.`;
      return { ok: false, output: message, summary: "document read cancelled" };
    }
    if (decision === "add_partial") {
      const partial = truncateMarkdown(markdown, settings.tokenThreshold, input.modelId);
      markdown = partial.text;
      tokens = partial.tokenCount.value;
    }
  }

  const tokenLabel = formatTokenCount({ value: tokens, source: tokenSource, tokenizer: converted.tokenCount.tokenizer, providerFamily: converted.tokenCount.providerFamily });
  const summary = `${input.args.path} · ${format} · ${tokenLabel} tok`;
  return { ok: true, output: markdown, summary };
}
