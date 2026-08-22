import { ClientMessageSchema, type ClientMessage } from "./client-messages.ts";
import { FrameEnvelopeSchema, type FrameEnvelope } from "./envelope.ts";
import { ServerMessageSchema, type ServerMessage } from "./server-messages.ts";

export class ProtocolError extends Error {
  readonly issues: readonly string[];

  constructor(message: string, issues: readonly string[]) {
    super(message);
    this.name = "ProtocolError";
    this.issues = issues;
  }
}

function issueMessages(error: { issues: readonly { message: string; path: PropertyKey[] }[] }): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path.length > 0 ? `${path}: ${issue.message}` : issue.message;
  });
}

export function parseEnvelope(raw: unknown): FrameEnvelope {
  const result = FrameEnvelopeSchema.safeParse(raw);
  if (!result.success) {
    throw new ProtocolError("Invalid frame envelope", issueMessages(result.error));
  }
  return result.data;
}

export function parseClientMessage(raw: unknown): ClientMessage {
  const result = ClientMessageSchema.safeParse(raw);
  if (!result.success) {
    throw new ProtocolError("Invalid client message", issueMessages(result.error));
  }
  return result.data;
}

export function parseServerMessage(raw: unknown): ServerMessage {
  const result = ServerMessageSchema.safeParse(raw);
  if (!result.success) {
    throw new ProtocolError("Invalid server message", issueMessages(result.error));
  }
  return result.data;
}
