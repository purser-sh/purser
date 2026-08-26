import { PROTOCOL_VERSION, parseServerMessage, type ClientMessage, type ServerMessage } from "@purser-sh/protocol";
import { deriveRelayKey, isSealedFrame, openSealed, sealJson } from "@purser-sh/integrations/relay-seal";
import { parseBootstrap, readInjectedBootstrap, type Bootstrap } from "@/lib/bootstrap";

export type { Bootstrap } from "@/lib/bootstrap";

function errorFromConfigBody(body: unknown, fallback: string): string {
  if (body !== null && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  return fallback;
}

export async function fetchBootstrap(): Promise<Bootstrap> {
  const injected = readInjectedBootstrap(window);
  if (injected !== undefined) {
    return injected;
  }
  const response = await fetch("/__purser/config");
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      detail = errorFromConfigBody(await response.json(), detail);
    } catch {
      // Keep the status text when the body is not JSON.
    }
    throw new Error(`Could not read runner config (${detail}). Start both apps with bun run dev.`);
  }
  const parsed = parseBootstrap(await response.json());
  if (parsed === undefined) {
    throw new Error("Runner config was malformed. Restart with bun run dev.");
  }
  return parsed;
}

type Pending = {
  resolve: (message: ServerMessage) => void;
  reject: (error: Error) => void;
};

export class RunnerClient {
  private ws: WebSocket | undefined;
  private pending = new Map<string, Pending>();
  private closedByUs = false;
  private attempt = 0;
  private sealKey: CryptoKey | undefined;

  constructor(
    readonly bootstrap: Bootstrap,
    private readonly onMessage: (message: ServerMessage) => void,
    private readonly onStatus: (status: "connecting" | "ready" | "error", detail?: string) => void,
  ) {}

  connect(): void {
    this.closedByUs = false;
    this.open();
  }

  disconnect(): void {
    this.closedByUs = true;
    this.ws?.close();
  }

  request<T extends ClientMessage["type"]>(
    type: T,
    payload: Extract<ClientMessage, { type: T }>["payload"],
  ): Promise<ServerMessage> {
    const id = crypto.randomUUID();
    const frame = { id, type, payload };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      void this.sendJson(frame).catch((error: unknown) => {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("send failed"));
      });
    });
  }

  private async sendJson(value: unknown): Promise<void> {
    if (this.ws === undefined || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("not connected");
    }
    if (this.sealKey !== undefined) {
      const sealed = await sealJson(this.sealKey, value);
      this.ws.send(JSON.stringify(sealed));
      return;
    }
    this.ws.send(JSON.stringify(value));
  }

  private open(): void {
    this.onStatus("connecting");
    const ws = new WebSocket(this.bootstrap.wsUrl);
    this.ws = ws;
    this.sealKey = undefined;
    ws.addEventListener("open", () => {
      if (this.bootstrap.pair !== undefined) {
        ws.send(JSON.stringify({ type: "pair", role: this.bootstrap.pair.role, code: this.bootstrap.pair.code }));
        return;
      }
      void this.hello();
    });
    ws.addEventListener("message", (event) => {
      void this.onSocketMessage(String(event.data));
    });
    ws.addEventListener("close", () => {
      for (const [id, waiter] of this.pending) {
        waiter.reject(new Error("disconnected"));
        this.pending.delete(id);
      }
      if (!this.closedByUs) {
        this.onStatus("error", "disconnected");
        const delay = Math.min(8000, 400 * 2 ** this.attempt);
        this.attempt += 1;
        setTimeout(() => this.open(), delay);
      }
    });
  }

  private async onSocketMessage(text: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (isPairOk(parsed)) {
      if (this.bootstrap.pair !== undefined) {
        this.sealKey = await deriveRelayKey(this.bootstrap.pair.code);
        await this.hello();
      }
      return;
    }
    if (isSealedFrame(parsed)) {
      if (this.sealKey === undefined) {
        return;
      }
      parsed = await openSealed(this.sealKey, parsed);
    }
    let message: ServerMessage;
    try {
      message = parseServerMessage(parsed);
    } catch {
      return;
    }
    const waiter = this.pending.get(message.id);
    if (waiter) {
      this.pending.delete(message.id);
      if (message.type === "error") {
        waiter.reject(new Error(message.payload.message));
      } else {
        waiter.resolve(message);
      }
    }
    this.onMessage(message);
  }

  private async hello(): Promise<void> {
    try {
      await this.request("hello", {
        token: this.bootstrap.token,
        clientVersion: "0.1.0",
        protocolVersion: PROTOCOL_VERSION,
      });
      this.attempt = 0;
      this.onStatus("ready");
    } catch (error: unknown) {
      this.onStatus("error", error instanceof Error ? error.message : "hello failed");
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPairOk(value: unknown): boolean {
  return isRecord(value) && value.type === "pair_ok";
}
