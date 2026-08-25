export type PromptEstimate = {
  tokens: number;
  compactText: string;
  compactTokens: number;
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

export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return 0;
  }
  return Math.ceil(trimmed.length / 4);
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

export function coachPrompt(text: string): PromptEstimate {
  const tokens = estimateTokens(text);
  const compactText = compactPrompt(text);
  const compactTokens = estimateTokens(compactText);
  const notes: string[] = [
    "Estimate is about 4 characters per token. The provider bill can differ.",
  ];
  if (compactTokens < tokens) {
    notes.unshift(`Same intent in about ${compactTokens} tokens instead of ${tokens}.`);
  } else {
    notes.unshift("This prompt is already compact.");
  }
  if (tokens > 2000) {
    notes.push("This is a large prompt. Attach files with tools instead of pasting whole modules.");
  }
  return {
    tokens,
    compactText,
    compactTokens,
    savedTokens: Math.max(0, tokens - compactTokens),
    notes,
  };
}
