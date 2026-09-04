import type { StoredEvent } from "@purser-sh/protocol";

export type LlmHistoryMessage = {
  role: "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
};

function toolArguments(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }
  try {
    return JSON.stringify(input);
  } catch {
    return "{}";
  }
}

function toolResultContent(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }
  try {
    return JSON.stringify(output);
  } catch {
    return String(output);
  }
}

/** Drop the current turn's user_message when it matches the live prompt. */
export function priorSessionEvents(events: StoredEvent[], currentPrompt: string): StoredEvent[] {
  if (events.length === 0) {
    return [];
  }
  const last = events[events.length - 1]!;
  if (last.payload.kind === "user_message" && last.payload.text === currentPrompt) {
    return events.slice(0, -1);
  }
  return events;
}

/** Convert persisted session events into OpenAI-shaped chat history. */
export function llmHistoryFromStoredEvents(events: StoredEvent[]): LlmHistoryMessage[] {
  const messages: LlmHistoryMessage[] = [];
  const resultsByToolId = new Map<string, string>();

  for (const event of events) {
    const payload = event.payload;
    if (payload.kind === "tool_result") {
      resultsByToolId.set(payload.toolId, toolResultContent(payload.output));
    }
  }

  for (let index = 0; index < events.length; index += 1) {
    const payload = events[index]!.payload;
    if (payload.kind === "user_message") {
      messages.push({ role: "user", content: payload.text });
      continue;
    }
    if (payload.kind === "text") {
      messages.push({ role: "assistant", content: payload.text });
      continue;
    }
    if (payload.kind === "tool_call") {
      const calls: Array<Extract<typeof payload, { kind: "tool_call" }>> = [payload];
      let cursor = index + 1;
      while (cursor < events.length && events[cursor]!.payload.kind === "tool_call") {
        calls.push(events[cursor]!.payload as Extract<typeof payload, { kind: "tool_call" }>);
        cursor += 1;
      }
      index = cursor - 1;
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: calls.map((call) => ({
          id: call.toolId,
          type: "function" as const,
          function: {
            name: call.name,
            arguments: toolArguments(call.input),
          },
        })),
      });
      for (const call of calls) {
        const content = resultsByToolId.get(call.toolId) ?? "(no result recorded)";
        messages.push({ role: "tool", tool_call_id: call.toolId, content });
      }
    }
  }

  return messages;
}
