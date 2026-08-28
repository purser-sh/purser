/** Models we have seen call write_file / apply_patch reliably on Ollama. */
const OLLAMA_CODER_HINTS = ["coder", "codellama", "deepseek-coder", "starcoder", "codegemma"] as const;

const OLLAMA_INSTRUCT_HINTS = ["instruct", "-chat", ":chat"] as const;

export function isOllamaCoderModel(modelId: string): boolean {
  const id = modelId.toLowerCase();
  if (OLLAMA_INSTRUCT_HINTS.some((hint) => id.includes(hint))) {
    return false;
  }
  return OLLAMA_CODER_HINTS.some((hint) => id.includes(hint));
}

export function ollamaModelEditWarning(modelId: string | null): string | null {
  if (modelId === null || modelId.length === 0) {
    return null;
  }
  if (isOllamaCoderModel(modelId)) {
    return null;
  }
  return `${modelId} is not a coder-tuned model — file edits often fail. Try qwen2.5-coder:7b or larger.`;
}
