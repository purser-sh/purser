declare module "@anthropic-ai/claude-agent-sdk" {
  export function query(params: {
    prompt: string;
    options?: Record<string, unknown>;
  }): AsyncIterable<Record<string, unknown>> & { interrupt?: () => Promise<void> };
}
