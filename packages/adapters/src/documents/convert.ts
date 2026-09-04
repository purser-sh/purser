import { statSync } from "node:fs";
import { countTokens, type TokenCount } from "@purser-sh/pricing";
import { resolveInRoot } from "../sandbox.ts";
import { cachePathForHash, hashFileContents, readCachedMarkdown, writeCachedMarkdown } from "./cache.ts";
import { convertBuiltin } from "./convert-builtin.ts";
import { convertWithMarkitdown, markitdownStatus } from "./convert-markitdown.ts";
import { builtinSupported, detectDocumentFormat, formatLabel, type DocumentFormat } from "./formats.ts";
import { DEFAULT_DOCUMENT_SETTINGS, type DocumentSettings } from "./settings.ts";

export type DocumentConvertResult =
  | {
      ok: true;
      markdown: string;
      format: DocumentFormat;
      tokenCount: TokenCount;
      fromCache: boolean;
      path: string;
    }
  | { ok: false; message: string; format: DocumentFormat; path: string };

export function unsupportedFormatMessage(format: DocumentFormat, path: string): string {
  const label = formatLabel(format);
  if (builtinSupported(format)) {
    return `Could not convert ${path} (${label}).`;
  }
  const status = markitdownStatus();
  if (!status.available) {
    return `Format ${label} for ${path} requires MarkItDown. ${status.detail} Install: ${status.installCommand}`;
  }
  return `Format ${label} for ${path} is not supported.`;
}

export async function convertDocument(input: {
  cwd: string;
  relativePath: string;
  modelId?: string | null;
  settings?: Partial<DocumentSettings>;
  home?: string;
}): Promise<DocumentConvertResult> {
  const settings = { ...DEFAULT_DOCUMENT_SETTINGS, ...input.settings };
  const format = detectDocumentFormat(input.relativePath);
  if (format === "unknown") {
    return { ok: false, message: unsupportedFormatMessage(format, input.relativePath), format, path: input.relativePath };
  }

  let absPath: string;
  try {
    absPath = resolveInRoot(input.cwd, input.relativePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : "path rejected";
    return { ok: false, message, format, path: input.relativePath };
  }

  let size: number;
  try {
    size = statSync(absPath).size;
  } catch {
    return { ok: false, message: `File not found: ${input.relativePath}`, format, path: input.relativePath };
  }
  if (size > settings.maxFileBytes) {
    return {
      ok: false,
      message: `File exceeds maximum size (${settings.maxFileBytes.toLocaleString("en-US")} bytes).`,
      format,
      path: input.relativePath,
    };
  }

  const hash = hashFileContents(absPath);
  const cached = readCachedMarkdown(hash, input.home);
  if (cached !== null) {
    return {
      ok: true,
      markdown: cached,
      format,
      tokenCount: countTokens(cached, input.modelId),
      fromCache: true,
      path: input.relativePath,
    };
  }

  let markdown: string;
  try {
    if (builtinSupported(format)) {
      markdown = await convertBuiltin(absPath, format);
    } else {
      const status = markitdownStatus();
      if (!status.available) {
        return {
          ok: false,
          message: unsupportedFormatMessage(format, input.relativePath),
          format,
          path: input.relativePath,
        };
      }
      const converted = convertWithMarkitdown(absPath, settings.convertTimeoutMs);
      if (!converted.ok) {
        return { ok: false, message: converted.message, format, path: input.relativePath };
      }
      markdown = converted.markdown;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "conversion failed";
    return { ok: false, message: `Could not convert ${input.relativePath}: ${message}`, format, path: input.relativePath };
  }

  writeCachedMarkdown(hash, markdown, input.home);
  void cachePathForHash(hash, input.home);

  return {
    ok: true,
    markdown,
    format,
    tokenCount: countTokens(markdown, input.modelId),
    fromCache: false,
    path: input.relativePath,
  };
}

export function truncateMarkdown(markdown: string, maxTokens: number, modelId?: string | null): { text: string; tokenCount: TokenCount } {
  const full = countTokens(markdown, modelId);
  if (full.value <= maxTokens) {
    return { text: markdown, tokenCount: full };
  }
  let low = 0;
  let high = markdown.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const slice = markdown.slice(0, mid);
    if (countTokens(slice, modelId).value <= maxTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  const text = `${markdown.slice(0, low)}\n\n…(truncated to ${maxTokens.toLocaleString("en-US")} tokens)`;
  return { text, tokenCount: countTokens(text, modelId) };
}
