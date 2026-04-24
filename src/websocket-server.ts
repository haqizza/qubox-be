import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { v4 as uuidv4 } from "uuid";
import { RealTimeBroadcaster } from "./realtime-broadcaster";
import { QuestionManager } from "./question-manager";
import { SessionManager } from "./session-manager";
import { JoinError } from "./types";

/**
 * Expected shape of the first message a client sends after connecting.
 * The client must identify which session it is joining and, optionally,
 * its own participantId (used to detect re-joins).
 *
 * { type: "join", joinCode: string, participantId?: string }
 */
interface JoinMessage {
  type: "join";
  joinCode: string;
  participantId?: string;
}

/**
 * Attaches a WebSocket server to an existing HTTP server.
 *
 * Protocol:
 *  1. Client connects and immediately sends a `join` message with a valid joinCode.
 *  2. Server subscribes the connection to the session room.
 *  3. Server sends a `session_state` event with the current visible questions
 *     (this covers both first-join and reconnection — Requirement 6.4).
 *  4. Subsequent state changes are pushed via the RealTimeBroadcaster.
 *  5. On disconnect the connection is unsubscribed from the room.
 */
export function attachWebSocketServer(
  httpServer: Server,
  broadcaster: RealTimeBroadcaster,
  sessionManager: SessionManager,
  questionManager: QuestionManager
): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    const connectionId = uuidv4();
    let sessionId: string | null = null;

    ws.on("message", (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      if (!isJoinMessage(msg)) {
        ws.send(JSON.stringify({ type: "error", message: "Expected join message" }));
        return;
      }

      // Resolve the session from the join code
      let session;
      try {
        session = sessionManager.getSession(msg.joinCode);
      } catch {
        ws.send(JSON.stringify({ type: "error", message: "Session not found" }));
        return;
      }

      sessionId = session.id;

      // Subscribe this connection to the session room
      broadcaster.subscribe(sessionId, connectionId, ws);

      // Deliver current state immediately — covers both first-join and reconnection (Req 6.4)
      const visibleQuestions = questionManager.getVisibleQuestions(sessionId);
      ws.send(JSON.stringify({ type: "session_state", questions: visibleQuestions }));
    });

    ws.on("close", () => {
      broadcaster.unsubscribe(connectionId);
    });

    ws.on("error", (err) => {
      console.error(`[WebSocketServer] Connection ${connectionId} error: ${err.message}`);
      broadcaster.unsubscribe(connectionId);
    });
  });

  return wss;
}

function isJoinMessage(msg: unknown): msg is JoinMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as Record<string, unknown>).type === "join" &&
    typeof (msg as Record<string, unknown>).joinCode === "string"
  );
}
