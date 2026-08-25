export type CatalogRow = {
  providerId: string;
  model: string;
  inputPerMTokUsd: string;
  outputPerMTokUsd: string;
  cacheReadPerMTokUsd: string | null;
  cacheWritePerMTokUsd: string | null;
  asOf: "YYYY-MM-DD" | string;
  sourceUrl: string;
  longContextThresholdTokens?: number;
  longContext?: {
    inputPerMTokUsd: string;
    outputPerMTokUsd: string;
    cacheReadPerMTokUsd: string | null;
    cacheWritePerMTokUsd: string | null;
  };
};

const XAI = "https://docs.x.ai/developers/pricing";
const PERPLEXITY = "https://docs.perplexity.ai/getting-started/pricing";

/**
 * Built-in rows copied from official vendor pages on asOf.
 * OpenAI-compatible models are omitted: the public pricing page could not be
 * fetched in this tree, so they stay unpriced rather than guessed.
 */
export const BUILTIN_CATALOG: readonly CatalogRow[] = [
  {
    providerId: "grok",
    model: "grok-4.6",
    inputPerMTokUsd: "2.00",
    outputPerMTokUsd: "6.00",
    cacheReadPerMTokUsd: "0.50",
    cacheWritePerMTokUsd: null,
    asOf: "2026-08-25",
    sourceUrl: XAI,
    longContextThresholdTokens: 200_000,
    longContext: {
      inputPerMTokUsd: "4.00",
      outputPerMTokUsd: "12.00",
      cacheReadPerMTokUsd: "1.00",
      cacheWritePerMTokUsd: null,
    },
  },
  {
    providerId: "grok",
    model: "grok-4.5",
    inputPerMTokUsd: "2.00",
    outputPerMTokUsd: "6.00",
    cacheReadPerMTokUsd: "0.30",
    cacheWritePerMTokUsd: null,
    asOf: "2026-08-25",
    sourceUrl: XAI,
    longContextThresholdTokens: 200_000,
    longContext: {
      inputPerMTokUsd: "4.00",
      outputPerMTokUsd: "12.00",
      cacheReadPerMTokUsd: "0.60",
      cacheWritePerMTokUsd: null,
    },
  },
  {
    providerId: "grok",
    model: "grok-4.3",
    inputPerMTokUsd: "1.25",
    outputPerMTokUsd: "2.50",
    cacheReadPerMTokUsd: "0.20",
    cacheWritePerMTokUsd: null,
    asOf: "2026-08-25",
    sourceUrl: XAI,
    longContextThresholdTokens: 200_000,
    longContext: {
      inputPerMTokUsd: "2.50",
      outputPerMTokUsd: "5.00",
      cacheReadPerMTokUsd: "0.40",
      cacheWritePerMTokUsd: null,
    },
  },
  {
    providerId: "perplexity",
    model: "sonar",
    inputPerMTokUsd: "1.00",
    outputPerMTokUsd: "1.00",
    cacheReadPerMTokUsd: null,
    cacheWritePerMTokUsd: null,
    asOf: "2026-08-25",
    sourceUrl: PERPLEXITY,
  },
  {
    providerId: "perplexity",
    model: "sonar-pro",
    inputPerMTokUsd: "3.00",
    outputPerMTokUsd: "15.00",
    cacheReadPerMTokUsd: null,
    cacheWritePerMTokUsd: null,
    asOf: "2026-08-25",
    sourceUrl: PERPLEXITY,
  },
  {
    providerId: "perplexity",
    model: "sonar-reasoning-pro",
    inputPerMTokUsd: "2.00",
    outputPerMTokUsd: "8.00",
    cacheReadPerMTokUsd: null,
    cacheWritePerMTokUsd: null,
    asOf: "2026-08-25",
    sourceUrl: PERPLEXITY,
  },
];
