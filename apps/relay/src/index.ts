import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";

type Room = {
  runner?: WebSocket;
  phone?: WebSocket;
};

const rooms = new Map<string, Room>();
const PORT = Number(process.env.AGENTDECK_RELAY_PORT ?? 7430);
const HOST = process.env.AGENTDECK_RELAY_HOST ?? "127.0.0.1";

function peerOf(room: Room, ws: WebSocket): WebSocket | undefined {
  if (room.runner === ws) return room.phone;
  if (room.phone === ws) return room.runner;
  return undefined;
}

function drop(ws: WebSocket): void {
  for (const [code, room] of rooms) {
    if (room.runner === ws) {
      room.runner = undefined;
    }
    if (room.phone === ws) {
      room.phone = undefined;
    }
    if (room.runner === undefined && room.phone === undefined) {
      rooms.delete(code);
    }
  }
}

const httpServer = createServer((_req, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "agentdeck-relay" }));
});

const wss = new WebSocketServer({ server: httpServer });
wss.on("connection", (ws) => {
  let code: string | null = null;
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
      (parsed as { type: unknown }).type === "pair" &&
      "code" in parsed &&
      "role" in parsed
    ) {
      const nextCode = String((parsed as { code: unknown }).code);
      const role = String((parsed as { role: unknown }).role);
      code = nextCode;
      const room = rooms.get(nextCode) ?? {};
      if (role === "runner") {
        room.runner = ws;
      } else {
        room.phone = ws;
      }
      rooms.set(nextCode, room);
      ws.send(JSON.stringify({ type: "pair_ok", code: nextCode }));
      return;
    }
    if (code === null) {
      return;
    }
    const room = rooms.get(code);
    if (room === undefined) {
      return;
    }
    const other = peerOf(room, ws);
    if (other !== undefined && other.readyState === WebSocket.OPEN) {
      other.send(text);
    }
  });
  ws.on("close", () => drop(ws));
});

httpServer.listen(PORT, HOST, () => {
  console.log(`AgentDeck relay on ws://${HOST}:${PORT}`);
  console.log("Stores nothing. Pair a runner and a phone with the same code.");
});
