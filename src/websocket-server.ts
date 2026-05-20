import { WebSocketServer, WebSocket } from "ws";
import { IncomingMessage, Server } from "http";
import { v4 as uuidv4 } from "uuid";
import { RealTimeBroadcaster } from "./realtime-broadcaster";
import { QuestionManager } from "./question-manager";
import { SessionManager } from "./session-manager";

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

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const connectionId = uuidv4();
    const clientIp = req.socket.remoteAddress ?? "unknown";
    let sessionId: string | null = null;

    console.log(`[${new Date().toISOString()}] WS  CONNECT   conn=${connectionId} ip=${clientIp}`);

    ws.on("message", (raw) => {
      let msg: unknown;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        console.warn(`[${new Date().toISOString()}] WS  MESSAGE   conn=${connectionId} ERROR invalid JSON`);
        ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      const msgType = (msg as Record<string, unknown>)?.type;

      // Handle request_session_state — works both before and after joining.
      // If the connection hasn't joined yet, a joinCode must be provided so the
      // server can subscribe the connection to the right session room first.
      if (msgType === "request_session_state") {
        const msgObj = msg as Record<string, unknown>;

        if (!sessionId) {
          // Not yet joined — require a joinCode to subscribe
          const joinCode = msgObj.joinCode as string | undefined;
          if (!joinCode) {
            ws.send(JSON.stringify({ type: "error", message: "joinCode required" }));
            return;
          }
          let session;
          try {
            session = sessionManager.resolveSession(joinCode);
          } catch {
            ws.send(JSON.stringify({ type: "error", message: "Session not found" }));
            return;
          }
          sessionId = session.id;
          broadcaster.subscribe(sessionId, connectionId, ws);
          console.log(`[${new Date().toISOString()}] WS  JOIN      conn=${connectionId} sessionId=${sessionId} joinCode=${joinCode} (via request_session_state)`);

          // Send catch-up status event if session is already open or closed
          if (session.status === "open") {
            console.log(`[${new Date().toISOString()}] WS  SEND      conn=${connectionId} type=session_started (catch-up)`);
            ws.send(JSON.stringify({ type: "session_started", session }));
          } else if (session.status === "closed") {
            console.log(`[${new Date().toISOString()}] WS  SEND      conn=${connectionId} type=session_closed (catch-up)`);
            ws.send(JSON.stringify({ type: "session_closed" }));
          }
        }

        const visibleQuestions = questionManager.getVisibleQuestions(sessionId);
        console.log(`[${new Date().toISOString()}] WS  SEND      conn=${connectionId} type=session_state questions=${visibleQuestions.length} (on-demand)`);
        ws.send(JSON.stringify({ type: "session_state", questions: visibleQuestions }));
        return;
      }

      // If already joined, ignore duplicate join attempts silently
      if (sessionId !== null) {
        console.warn(`[${new Date().toISOString()}] WS  MESSAGE   conn=${connectionId} ignoring message type=${String(msgType)} (already joined)`);
        return;
      }

      if (!isJoinMessage(msg)) {
        console.warn(`[${new Date().toISOString()}] WS  MESSAGE   conn=${connectionId} ERROR expected join message`);
        ws.send(JSON.stringify({ type: "error", message: "Expected join message" }));
        return;
      }

      // Resolve the session from the join code or session ID
      let session;
      try {
        session = sessionManager.resolveSession(msg.joinCode);
      } catch {
        console.warn(`[${new Date().toISOString()}] WS  MESSAGE   conn=${connectionId} ERROR session not found joinCode=${msg.joinCode}`);
        ws.send(JSON.stringify({ type: "error", message: "Session not found" }));
        return;
      }

      sessionId = session.id;
      console.log(`[${new Date().toISOString()}] WS  JOIN      conn=${connectionId} sessionId=${sessionId} joinCode=${msg.joinCode}`);

      // Subscribe this connection to the session room
      broadcaster.subscribe(sessionId, connectionId, ws);

      // Deliver current state immediately — covers both first-join and reconnection (Req 6.4)
      const visibleQuestions = questionManager.getVisibleQuestions(sessionId);
      console.log(`[${new Date().toISOString()}] WS  SEND      conn=${connectionId} type=session_state questions=${visibleQuestions.length}`);
      ws.send(JSON.stringify({ type: "session_state", questions: visibleQuestions }));

      // If the session is already open or closed, notify the client immediately so
      // it doesn't miss the transition that happened before it subscribed.
      if (session.status === "open") {
        console.log(`[${new Date().toISOString()}] WS  SEND      conn=${connectionId} type=session_started (catch-up)`);
        ws.send(JSON.stringify({ type: "session_started", session }));
      } else if (session.status === "closed") {
        console.log(`[${new Date().toISOString()}] WS  SEND      conn=${connectionId} type=session_closed (catch-up)`);
        ws.send(JSON.stringify({ type: "session_closed" }));
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`[${new Date().toISOString()}] WS  DISCONNECT conn=${connectionId} sessionId=${sessionId ?? "none"} code=${code} reason=${reason.toString() || "none"}`);
      broadcaster.unsubscribe(connectionId);
    });

    ws.on("error", (err) => {
      console.error(`[${new Date().toISOString()}] WS  ERROR     conn=${connectionId} sessionId=${sessionId ?? "none"} ${err.message}`);
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
