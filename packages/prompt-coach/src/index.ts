import {
  countTokens,
  worseTokenSource,
  type TokenCount,
  type TokenizerFamily,
} from "@agentdeck/pricing";

export type PromptEstimate = {
  tokens: TokenCount;
  compactText: string;
  compactTokens: TokenCount;
  savedTokens: number;
  notes: string[];
};

/** Longest first so "could you please" wins over "please". */
const FILLER_PHRASES = [
  "i would like you to",
  "i want you to",
  "could you please",
  "would you please",
  "can you please",
  "you know",
  "i mean",
  "could you",
  "would you",
  "can you",
  "kindly",
  "please",
  "actually",
  "basically",
  "simply",
  "really",
  "just",
  "okay",
  "ok",
] as const;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function estimateTokens(text: string, family: TokenizerFamily = "openai"): TokenCount {
  return countTokens(text, family);
}

function preserveCodeFences(text: string): { body: string; fences: string[] } {
  const fences: string[] = [];
  const body = text.replace(/```[\s\S]*?```/g, (block) => {
    const index = fences.length;
    fences.push(block);
    return `\n<<CODE_${index}>>\n`;
  });
  return { body, fences };
}

function restoreCodeFences(text: string, fences: string[]): string {
  return text.replace(/<<CODE_(\d+)>>/g, (_match, raw: string) => fences[Number(raw)] ?? "");
}

export function compactPrompt(text: string): string {
  const { body, fences } = preserveCodeFences(text);
  let compact = body;
  for (const phrase of FILLER_PHRASES) {
    compact = compact.replace(new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "gi"), " ");
  }
  compact = compact
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
  compact = restoreCodeFences(compact, fences).trim();
  return compact.length > 0 ? compact : text.trim();
}

export function coachPrompt(text: string, family: TokenizerFamily = "openai"): PromptEstimate {
  const tokens = estimateTokens(text, family);
  const compactText = compactPrompt(text);
  const compactTokens = estimateTokens(compactText, family);
  const source = worseTokenSource(tokens.source, compactTokens.source);
  const notes: string[] = [
    "This counts the prompt only. Most spend is the agent loop after Send — watch the run spend meter.",
  ];
  if (source === "exact") {
    notes.push(`Counted with ${tokens.tokenizer} (exact for ${family}).`);
  } else if (tokens.tokenizer === "heuristic") {
    notes.push(`Fell back to a character heuristic because the tokenizer failed. Provider family is ${family}.`);
  } else {
    notes.push(
      `Approximate: counted with ${tokens.tokenizer}; it does not match provider family ${family}. The provider bill can differ.`,
    );
  }
  if (compactTokens.value < tokens.value) {
    notes.unshift(`Same intent in about ${compactTokens.value} tokens instead of ${tokens.value}.`);
  } else {
    notes.unshift("This prompt is already compact.");
  }
  if (tokens.value > 2000) {
    notes.push("This is a large prompt. Attach files with tools instead of pasting whole modules.");
  }
  return {
    tokens,
    compactText,
    compactTokens,
    savedTokens: Math.max(0, tokens.value - compactTokens.value),
    notes,
  };
}
