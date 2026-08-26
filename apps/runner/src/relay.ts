import { WebSocket } from "ws";
import { deriveRelayKey, isSealedFrame, openSealed } from "@purser-sh/integrations";

export type RelayHandle = {
  url: string;
  code: string;
  ws: WebSocket;
  connected: boolean;
  sealKey?: CryptoKey;
};

export function connectRelay(input: {
  url: string;
  code: string;
  onOpen: (handle: RelayHandle) => void;
  onClose: (handle: RelayHandle) => void;
  onFrame: (raw: unknown) => void;
  onSealed: (handle: RelayHandle) => void;
}): RelayHandle {
  const ws = new WebSocket(input.url);
  const handle: RelayHandle = { url: input.url, code: input.code, ws, connected: false };
  ws.on("open", () => {
    handle.connected = true;
    void deriveRelayKey(input.code).then((key) => {
      handle.sealKey = key;
    });
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
    if (isPairOk(parsed)) {
      void ensureSealKey(handle, input.code).then(() => input.onSealed(handle));
      return;
    }
    if (isSealedFrame(parsed)) {
      const key = handle.sealKey;
      if (key === undefined) {
        return;
      }
      void openSealed(key, parsed).then((opened) => input.onFrame(opened));
      return;
    }
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

async function ensureSealKey(handle: RelayHandle, code: string): Promise<void> {
  if (handle.sealKey !== undefined) {
    return;
  }
  handle.sealKey = await deriveRelayKey(code);
}

function isPairOk(value: unknown): boolean {
  return value !== null && typeof value === "object" && "type" in value && value.type === "pair_ok";
}
