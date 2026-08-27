import { createServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { PairingDesk, type PairRole } from "@purser-sh/integrations";

type Room = {
  runner?: WebSocket;
  phone?: WebSocket;
};

const rooms = new Map<string, Room>();
const desk = new PairingDesk();

function isPairRole(value: string): value is PairRole {
  return value === "runner" || value === "phone";
}

function isPairMessage(value: unknown): value is { type: "pair"; code: string; role: string } {
  if (value === null || typeof value !== "object") {
    return false;
  }
  if (!("type" in value) || value.type !== "pair") {
    return false;
  }
  if (!("code" in value) || !("role" in value)) {
    return false;
  }
  return typeof value.code === "string" && typeof value.role === "string";
}

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

export function startRelay(host: string, port: number): ReturnType<typeof createServer> {
  const httpServer = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "purser-relay" }));
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on("connection", (ws, req) => {
    let code: string | null = null;
    const source = req.socket.remoteAddress ?? "unknown";
    ws.on("message", (data) => {
      const text = typeof data === "string" ? data : data.toString();
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return;
      }
      if (isPairMessage(parsed)) {
        if (!isPairRole(parsed.role)) {
          ws.send(JSON.stringify({ type: "pair_error", reason: "invalid role" }));
          return;
        }
        const result = desk.pair(parsed.code, parsed.role, source);
        if (!result.ok) {
          ws.send(JSON.stringify({ type: "pair_error", reason: result.reason }));
          return;
        }
        code = result.code;
        const room = rooms.get(result.code) ?? {};
        if (parsed.role === "runner") {
          room.runner = ws;
        } else {
          room.phone = ws;
        }
        rooms.set(result.code, room);
        if (!result.complete) {
          return;
        }
        const payload = JSON.stringify({ type: "pair_ok", code: result.code });
        if (room.runner !== undefined && room.runner.readyState === WebSocket.OPEN) {
          room.runner.send(payload);
        }
        if (room.phone !== undefined && room.phone.readyState === WebSocket.OPEN) {
          room.phone.send(payload);
        }
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

  httpServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        [
          `Port ${port} is already in use.`,
          `Free it with: lsof -ti:${port} | xargs -r kill`,
          `Or start the relay elsewhere: PURSER_RELAY_PORT=${port + 1} bun run --filter @purser-sh/relay dev`,
        ].join("\n"),
      );
      process.exit(1);
    }
    console.error(error.message);
    process.exit(1);
  });
  httpServer.listen(port, host);
  return httpServer;
}

const PORT = Number(process.env.PURSER_RELAY_PORT ?? 7430);
const HOST = process.env.PURSER_RELAY_HOST ?? "127.0.0.1";

if (import.meta.main) {
  startRelay(HOST, PORT);
  console.log(`Purser relay on ws://${HOST}:${PORT}`);
  console.log("Forwards frames; does not store them. After pairing, phone and companion seal payloads with HKDF(code) so the relay carries ciphertext.");
}
