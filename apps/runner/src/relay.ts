import { WebSocket } from "ws";

export type RelayHandle = {
  url: string;
  code: string;
  ws: WebSocket;
  connected: boolean;
};

export function connectRelay(input: {
  url: string;
  code: string;
  onOpen: (handle: RelayHandle) => void;
  onClose: (handle: RelayHandle) => void;
  onFrame: (raw: unknown) => void;
}): RelayHandle {
  const ws = new WebSocket(input.url);
  const handle: RelayHandle = { url: input.url, code: input.code, ws, connected: false };
  ws.on("open", () => {
    handle.connected = true;
    ws.send(JSON.stringify({ type: "pair", role: "runner", code: input.code }));
    input.onOpen(handle);
  });
  ws.on("message", (data) => {
    const text = typeof data === "string" ? data : data.toString();
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "type" in parsed &&
      ((parsed as { type: unknown }).type === "pair_ok" || (parsed as { type: unknown }).type === "pair")
    ) {
      return;
    }
    input.onFrame(parsed);
  });
  ws.on("close", () => {
    handle.connected = false;
    input.onClose(handle);
  });
  ws.on("error", () => {
    handle.connected = false;
    input.onClose(handle);
  });
  return handle;
}
