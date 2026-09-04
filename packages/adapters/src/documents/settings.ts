import type { DocumentSettings } from "@purser-sh/protocol";

export const DEFAULT_DOCUMENT_TOKEN_THRESHOLD = 10_000;
export const DEFAULT_DOCUMENT_MAX_BYTES = 50 * 1024 * 1024;
export const DEFAULT_DOCUMENT_TIMEOUT_MS = 30_000;

export type { DocumentSettings };

export const DEFAULT_DOCUMENT_SETTINGS: DocumentSettings = {
  tokenThreshold: DEFAULT_DOCUMENT_TOKEN_THRESHOLD,
  maxFileBytes: DEFAULT_DOCUMENT_MAX_BYTES,
  convertTimeoutMs: DEFAULT_DOCUMENT_TIMEOUT_MS,
};

export function mergeDocumentSettings(patch: Partial<DocumentSettings> | undefined): DocumentSettings {
  return {
    tokenThreshold: patch?.tokenThreshold ?? DEFAULT_DOCUMENT_TOKEN_THRESHOLD,
    maxFileBytes: patch?.maxFileBytes ?? DEFAULT_DOCUMENT_MAX_BYTES,
    convertTimeoutMs: patch?.convertTimeoutMs ?? DEFAULT_DOCUMENT_TIMEOUT_MS,
  };
}
