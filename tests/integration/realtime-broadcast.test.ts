/**
 * Integration tests for real-time broadcast timing.
 *
 * Verifies that WebSocket push events reach all subscribers within 2 seconds
 * for approve, upvote, pin, and answer actions.
 *
 * Requirements: 6.1, 6.2, 6.3, 5.5
 */

import { createServer } from "http";
import { WebSocket } from "ws";
import { attachWebSocketServer } from "../../src/websocket-server";
import { RealTimeBroadcaster } from "../../src/realtime-broadcaster";
import { SessionManager } from "../../src/session-manager";
import { QuestionManager } from "../../src/question-manager";
import { UpvoteManager } from "../../src/upvote-manager";
import { createApp } from "../../src/api/app";
import { AddressInfo } from "net";

const BROADCAST_TIMEOUT_MS = 2000;

/** Helper: connect a WebSocket client to the server and join a session. */
function connectClient(
  port: number,
  joinCode: string
): Promise<{ ws: WebSocket; messages: unknown[] }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);
    const messages: unknown[] = [];

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join", joinCode }));
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
      // Resolve after the initial session_state is received
      if (msg.type === "session_state") {
        resolve({ ws, messages });
      }
    });

    ws.on("error", reject);
    setTimeout(() => reject(new Error("Connection timeout")), 5000);
  });
}

/** Helper: wait for a specific event type to appear in the messages array. */
function waitForEvent(
  messages: unknown[],
  eventType: string,
  timeoutMs = BROADCAST_TIMEOUT_MS
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;

    const check = () => {
      const found = (messages as Array<{ type: string }>).find(
        (m) => m.type === eventType
      );
      if (found) {
        resolve(found);
        return;
      }
      if (Date.now() >= deadline) {
        reject(
          new Error(
            `Timed out waiting for event '${eventType}' after ${timeoutMs}ms`
          )
        );
        return;
      }
      setTimeout(check, 20);
    };

    check();
  });
}

describe("Real-time broadcast timing integration tests", () => {
  let httpServer: ReturnType<typeof createServer>;
  let port: number;
  let broadcaster: RealTimeBroadcaster;
  let sessionMgr: SessionManager;
  let questionMgr: QuestionManager;
  let upvoteMgr: UpvoteManager;
  let clients: WebSocket[] = [];

  beforeEach((done) => {
    broadcaster = new RealTimeBroadcaster();
    sessionMgr = new SessionManager();
    questionMgr = new QuestionManager();
    upvoteMgr = new UpvoteManager();

    // Wire broadcaster into managers
    sessionMgr.setBroadcaster(broadcaster);
    questionMgr.setBroadcaster(broadcaster);
    upvoteMgr.setBroadcaster(broadcaster);

    const app = createApp();
    httpServer = createServer(app);
    attachWebSocketServer(httpServer, broadcaster, sessionMgr, questionMgr);

    httpServer.listen(0, () => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });
  });

  afterEach((done) => {
    clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
    });
    clients = [];
    httpServer.close(done);
  });

  it("broadcasts question_approved within 2 seconds (Req 6.1)", async () => {
    const created = sessionMgr.createSession("Broadcast Test", undefined, true, "host-1");
    const session = sessionMgr.startSession(created.id, "host-1");

    const { ws, messages } = await connectClient(port, session.joinCode);
    clients.push(ws);

    // Submit and approve a question via the manager directly
    const question = questionMgr.submitQuestion(
      session.id,
      "participant-1",
      "Will this be approved?",
      session
    );

    const start = Date.now();
    questionMgr.approveQuestion(question.id, "mod-1");

    const event = await waitForEvent(messages, "question_approved") as { type: string; question: { id: string } };
    const elapsed = Date.now() - start;

    expect(event.type).toBe("question_approved");
    expect(event.question.id).toBe(question.id);
    expect(elapsed).toBeLessThanOrEqual(BROADCAST_TIMEOUT_MS);
  });

  it("broadcasts upvote_updated within 2 seconds (Req 6.2)", async () => {
    const created = sessionMgr.createSession("Upvote Broadcast Test", undefined, true, "host-1");
    const session = sessionMgr.startSession(created.id, "host-1");

    const { ws, messages } = await connectClient(port, session.joinCode);
    clients.push(ws);

    const question = questionMgr.submitQuestion(
      session.id,
      "participant-1",
      "Upvote me!",
      session
    );
    questionMgr.approveQuestion(question.id, "mod-1");

    const start = Date.now();
    upvoteMgr.upvote(question, "participant-2", session);

    const event = await waitForEvent(messages, "upvote_updated") as { type: string; questionId: string; upvoteCount: number };
    const elapsed = Date.now() - start;

    expect(event.type).toBe("upvote_updated");
    expect(event.questionId).toBe(question.id);
    expect(event.upvoteCount).toBe(1);
    expect(elapsed).toBeLessThanOrEqual(BROADCAST_TIMEOUT_MS);
  });

  it("broadcasts question_pinned within 2 seconds (Req 6.3)", async () => {
    const created = sessionMgr.createSession("Pin Broadcast Test", undefined, true, "host-1");
    const session = sessionMgr.startSession(created.id, "host-1");

    const { ws, messages } = await connectClient(port, session.joinCode);
    clients.push(ws);

    const question = questionMgr.submitQuestion(
      session.id,
      "participant-1",
      "Pin this question!",
      session
    );

    const start = Date.now();
    questionMgr.pinQuestion(question.id, "mod-1");

    const event = await waitForEvent(messages, "question_pinned") as { type: string; question: { id: string } };
    const elapsed = Date.now() - start;

    expect(event.type).toBe("question_pinned");
    expect(event.question.id).toBe(question.id);
    expect(elapsed).toBeLessThanOrEqual(BROADCAST_TIMEOUT_MS);
  });

  it("broadcasts question_answered within 2 seconds (Req 6.3)", async () => {
    const created = sessionMgr.createSession("Answer Broadcast Test", undefined, true, "host-1");
    const session = sessionMgr.startSession(created.id, "host-1");

    const { ws, messages } = await connectClient(port, session.joinCode);
    clients.push(ws);

    const question = questionMgr.submitQuestion(
      session.id,
      "participant-1",
      "Answer this question!",
      session
    );
    questionMgr.approveQuestion(question.id, "mod-1");

    const start = Date.now();
    questionMgr.markAnswered(question.id, "mod-1");

    const event = await waitForEvent(messages, "question_answered") as { type: string; question: { id: string } };
    const elapsed = Date.now() - start;

    expect(event.type).toBe("question_answered");
    expect(event.question.id).toBe(question.id);
    expect(elapsed).toBeLessThanOrEqual(BROADCAST_TIMEOUT_MS);
  });

  it("broadcasts to multiple subscribers simultaneously (Req 6.1)", async () => {
    const created = sessionMgr.createSession("Multi-subscriber Test", undefined, true, "host-1");
    const session = sessionMgr.startSession(created.id, "host-1");

    // Connect two clients
    const client1 = await connectClient(port, session.joinCode);
    const client2 = await connectClient(port, session.joinCode);
    clients.push(client1.ws, client2.ws);

    const question = questionMgr.submitQuestion(
      session.id,
      "participant-1",
      "Multi-subscriber question",
      session
    );

    const start = Date.now();
    questionMgr.approveQuestion(question.id, "mod-1");

    const [event1, event2] = await Promise.all([
      waitForEvent(client1.messages, "question_approved"),
      waitForEvent(client2.messages, "question_approved"),
    ]);
    const elapsed = Date.now() - start;

    expect((event1 as { type: string }).type).toBe("question_approved");
    expect((event2 as { type: string }).type).toBe("question_approved");
    expect(elapsed).toBeLessThanOrEqual(BROADCAST_TIMEOUT_MS);
  });

  it("broadcasts session_closed when host ends session (Req 6.3)", async () => {
    const created = sessionMgr.createSession("Session Close Test", undefined, true, "host-1");
    const session = sessionMgr.startSession(created.id, "host-1");

    const { ws, messages } = await connectClient(port, session.joinCode);
    clients.push(ws);

    const start = Date.now();
    sessionMgr.endSession(session.id, "host-1");

    const event = await waitForEvent(messages, "session_closed");
    const elapsed = Date.now() - start;

    expect((event as { type: string }).type).toBe("session_closed");
    expect(elapsed).toBeLessThanOrEqual(BROADCAST_TIMEOUT_MS);
  });
});
