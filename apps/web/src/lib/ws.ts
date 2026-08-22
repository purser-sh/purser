import { PROTOCOL_VERSION, parseServerMessage, type ClientMessage, type ServerMessage } from "@agentdeck/protocol";

export type Bootstrap = {
  wsUrl: string;
  token: string;
  allowedRoots: string[];
  pair?: { role: "phone" | "runner"; code: string };
};

export async function fetchBootstrap(): Promise<Bootstrap> {
  const response = await fetch("/__agentdeck/config");
  if (!response.ok) {
    throw new Error("Runner is not running. Start it with bun run dev.");
  }
  const body = (await response.json()) as Partial<Bootstrap>;
  return {
    wsUrl: body.wsUrl ?? "ws://127.0.0.1:7420",
    token: body.token ?? "",
    allowedRoots: body.allowedRoots ?? [],
  };
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
    const frame = { id, type, payload } as ClientMessage;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (this.ws === undefined || this.ws.readyState !== WebSocket.OPEN) {
        this.pending.delete(id);
        reject(new Error("not connected"));
        return;
      }
      this.ws.send(JSON.stringify(frame));
    });
  }

  private open(): void {
    this.onStatus("connecting");
    const ws = new WebSocket(this.bootstrap.wsUrl);
    this.ws = ws;
    ws.addEventListener("open", () => {
      if (this.bootstrap.pair !== undefined) {
        ws.send(JSON.stringify({ type: "pair", role: this.bootstrap.pair.role, code: this.bootstrap.pair.code }));
      }
      void this.request("hello", {
        token: this.bootstrap.token,
        clientVersion: "0.1.0",
        protocolVersion: PROTOCOL_VERSION,
      })
        .then(() => {
          this.attempt = 0;
          this.onStatus("ready");
        })
        .catch((error: unknown) => {
          this.onStatus("error", error instanceof Error ? error.message : "hello failed");
        });
    });
    ws.addEventListener("message", (event) => {
      let parsed: ServerMessage;
      try {
        parsed = parseServerMessage(JSON.parse(String(event.data)));
      } catch {
        return;
      }
      const waiter = this.pending.get(parsed.id);
      if (waiter) {
        this.pending.delete(parsed.id);
        if (parsed.type === "error") {
          waiter.reject(new Error(parsed.payload.message));
        } else {
          waiter.resolve(parsed);
        }
      }
      this.onMessage(parsed);
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
}
