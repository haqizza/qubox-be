/**
 * Integration test for reconnection state delivery.
 *
 * Simulates a connection drop and restore, then verifies that the `session_state`
 * event delivered on reconnect contains all currently visible questions in the
 * correct order (pinned first, then approved by upvotes DESC, timestamp ASC).
 *
 * Requirements: 6.4
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
import { Question } from "../../src/types";

const TIMEOUT_MS = 3000;

/** Connect a WebSocket client and wait for the initial session_state message. */
function connectAndWaitForState(
  port: number,
  joinCode: string
): Promise<{ ws: WebSocket; sessionState: { type: string; questions: Question[] } }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);

    ws.on("open", () => {
      ws.send(JSON.stringify({ type: "join", joinCode }));
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString()) as { type: string; questions: Question[] };
      if (msg.type === "session_state") {
        resolve({ ws, sessionState: msg });
      }
    });

    ws.on("error", reject);
    setTimeout(() => reject(new Error("Connection timeout")), TIMEOUT_MS);
  });
}

describe("Reconnection state delivery integration tests", () => {
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

  it("delivers full current state on reconnect after connection drop (Req 6.4)", async () => {
    const created = sessionMgr.createSession("Reconnect Test", undefined, true, "host-1");
    const session = sessionMgr.startSession(created.id, "host-1");

    // Set up some questions before the first connection
    const q1 = questionMgr.submitQuestion(session.id, "p1", "First question", session);
    const q2 = questionMgr.submitQuestion(session.id, "p2", "Second question", session);
    const q3 = questionMgr.submitQuestion(session.id, "p3", "Third question (pending)", session);

    questionMgr.approveQuestion(q1.id, "mod-1");
    questionMgr.pinQuestion(q2.id, "mod-1");
    // q3 stays pending — should NOT appear in session_state

    // First connection — verify initial state
    const first = await connectAndWaitForState(port, session.joinCode);
    clients.push(first.ws);

    expect(first.sessionState.questions).toHaveLength(2);
    expect(first.sessionState.questions.every(
      (q) => q.status === "approved" || q.status === "pinned"
    )).toBe(true);

    // Simulate connection drop
    first.ws.close();
    await new Promise((r) => setTimeout(r, 100)); // let close propagate

    // While disconnected, add another approved question
    const q4 = questionMgr.submitQuestion(session.id, "p4", "Fourth question", session);
    questionMgr.approveQuestion(q4.id, "mod-1");

    // Reconnect — should receive updated state with 3 visible questions
    const second = await connectAndWaitForState(port, session.joinCode);
    clients.push(second.ws);

    const { questions } = second.sessionState;

    // All visible questions present
    expect(questions).toHaveLength(3);
    expect(questions.every((q) => q.status === "approved" || q.status === "pinned")).toBe(true);

    // Ordering: pinned before approved
    const pinnedIdx = questions.findIndex((q) => q.status === "pinned");
    const firstApprovedIdx = questions.findIndex((q) => q.status === "approved");
    if (pinnedIdx !== -1 && firstApprovedIdx !== -1) {
      expect(pinnedIdx).toBeLessThan(firstApprovedIdx);
    }

    // Among approved: sorted by upvoteCount DESC, then submittedAt ASC
    const approvedOnly = questions.filter((q) => q.status === "approved");
    for (let i = 1; i < approvedOnly.length; i++) {
      const prev = approvedOnly[i - 1];
      const curr = approvedOnly[i];
      if (prev.upvoteCount === curr.upvoteCount) {
        expect(prev.submittedAt <= curr.submittedAt).toBe(true);
      } else {
        expect(prev.upvoteCount).toBeGreaterThanOrEqual(curr.upvoteCount);
      }
    }
  });

  it("delivers correct order after upvotes change ranking (Req 6.4)", async () => {
    const created = sessionMgr.createSession("Order After Upvotes", undefined, true, "host-1");
    const session = sessionMgr.startSession(created.id, "host-1");

    const q1 = questionMgr.submitQuestion(session.id, "p1", "Low votes question", session);
    const q2 = questionMgr.submitQuestion(session.id, "p2", "High votes question", session);

    questionMgr.approveQuestion(q1.id, "mod-1");
    questionMgr.approveQuestion(q2.id, "mod-1");

    // Give q2 more upvotes
    upvoteMgr.upvote(q2, "voter-1", session);
    upvoteMgr.upvote(q2, "voter-2", session);
    upvoteMgr.upvote(q1, "voter-3", session);

    // Connect — should see q2 before q1 (higher upvotes)
    const { ws, sessionState } = await connectAndWaitForState(port, session.joinCode);
    clients.push(ws);

    const { questions } = sessionState;
    expect(questions).toHaveLength(2);
    expect(questions[0].id).toBe(q2.id); // 2 upvotes
    expect(questions[1].id).toBe(q1.id); // 1 upvote
  });

  it("session_state on reconnect contains only approved and pinned questions (Req 6.4)", async () => {
    const created = sessionMgr.createSession("Filter on Reconnect", undefined, true, "host-1");
    const session = sessionMgr.startSession(created.id, "host-1");

    const qPending = questionMgr.submitQuestion(session.id, "p1", "Pending Q", session);
    const qApproved = questionMgr.submitQuestion(session.id, "p2", "Approved Q", session);
    const qRejected = questionMgr.submitQuestion(session.id, "p3", "Rejected Q", session);
    const qPinned = questionMgr.submitQuestion(session.id, "p4", "Pinned Q", session);
    const qAnswered = questionMgr.submitQuestion(session.id, "p5", "Answered Q", session);

    questionMgr.approveQuestion(qApproved.id, "mod-1");
    questionMgr.rejectQuestion(qRejected.id, "mod-1");
    questionMgr.pinQuestion(qPinned.id, "mod-1");
    questionMgr.approveQuestion(qAnswered.id, "mod-1");
    questionMgr.markAnswered(qAnswered.id, "mod-1");

    const { ws, sessionState } = await connectAndWaitForState(port, session.joinCode);
    clients.push(ws);

    const ids = sessionState.questions.map((q) => q.id);
    expect(ids).toContain(qApproved.id);
    expect(ids).toContain(qPinned.id);
    expect(ids).not.toContain(qPending.id);
    expect(ids).not.toContain(qRejected.id);
    expect(ids).not.toContain(qAnswered.id);
  });
});
