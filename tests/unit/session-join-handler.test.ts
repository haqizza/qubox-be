import { SessionJoinHandler } from "../../src/session-join-handler";
import { SessionManager } from "../../src/session-manager";
import { QuestionManager } from "../../src/question-manager";
import { JoinError } from "../../src/types";

function makeManagers() {
  return {
    sessionMgr: new SessionManager(),
    questionMgr: new QuestionManager(),
    handler: new SessionJoinHandler(),
  };
}

describe("SessionJoinHandler", () => {
  describe("valid join code", () => {
    it("returns the session and participantId on anonymous join", () => {
      const { sessionMgr, questionMgr, handler } = makeManagers();
      const session = sessionMgr.createSession("Test", undefined, true);

      const result = handler.joinSession(session.joinCode, undefined, sessionMgr, questionMgr);

      expect(result.session.id).toBe(session.id);
      expect(result.participantId).toBeTruthy();
      expect(typeof result.participantId).toBe("string");
    });

    it("returns empty questions array when no visible questions exist", () => {
      const { sessionMgr, questionMgr, handler } = makeManagers();
      const session = sessionMgr.createSession("Test", undefined, true);

      const result = handler.joinSession(session.joinCode, undefined, sessionMgr, questionMgr);

      expect(result.questions).toEqual([]);
    });

    it("returns visible questions in correct order", () => {
      const { sessionMgr, questionMgr, handler } = makeManagers();
      const session = sessionMgr.createSession("Test", undefined, true);
      const openSession = sessionMgr.startSession(session.id, "host");

      const q1 = questionMgr.submitQuestion(session.id, "p1", "Question 1", openSession);
      const q2 = questionMgr.submitQuestion(session.id, "p2", "Question 2", openSession);
      questionMgr.approveQuestion(q1.id, "mod");
      questionMgr.pinQuestion(q2.id, "mod");

      const result = handler.joinSession(session.joinCode, undefined, sessionMgr, questionMgr);

      expect(result.questions).toHaveLength(2);
      // pinned first
      expect(result.questions[0].status).toBe("pinned");
      expect(result.questions[1].status).toBe("approved");
    });
  });

  describe("invalid join code", () => {
    it("throws JoinError for unknown join code", () => {
      const { sessionMgr, questionMgr, handler } = makeManagers();

      expect(() =>
        handler.joinSession("BADCODE", undefined, sessionMgr, questionMgr)
      ).toThrow(JoinError);
    });

    it("JoinError message indicates session not found", () => {
      const { sessionMgr, questionMgr, handler } = makeManagers();

      expect(() =>
        handler.joinSession("XXXXXX", undefined, sessionMgr, questionMgr)
      ).toThrow("Session not found");
    });
  });

  describe("anonymous participation", () => {
    it("assigns a new UUID when anonymousAllowed and no participantId provided", () => {
      const { sessionMgr, questionMgr, handler } = makeManagers();
      const session = sessionMgr.createSession("Test", undefined, true);

      const result = handler.joinSession(session.joinCode, undefined, sessionMgr, questionMgr);

      // UUID format check
      expect(result.participantId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    it("assigns different UUIDs to different anonymous participants", () => {
      const { sessionMgr, questionMgr, handler } = makeManagers();
      const session = sessionMgr.createSession("Test", undefined, true);

      const r1 = handler.joinSession(session.joinCode, undefined, sessionMgr, questionMgr);
      const r2 = handler.joinSession(session.joinCode, undefined, sessionMgr, questionMgr);

      expect(r1.participantId).not.toBe(r2.participantId);
    });

    it("throws JoinError with 'Authentication required' when anonymousAllowed is false and no participantId", () => {
      const { sessionMgr, questionMgr, handler } = makeManagers();
      const session = sessionMgr.createSession("Test", undefined, false);

      expect(() =>
        handler.joinSession(session.joinCode, undefined, sessionMgr, questionMgr)
      ).toThrow("Authentication required");
    });
  });

  describe("re-join", () => {
    it("returns the same participantId when re-joining with an existing participantId", () => {
      const { sessionMgr, questionMgr, handler } = makeManagers();
      const session = sessionMgr.createSession("Test", undefined, true);

      const first = handler.joinSession(session.joinCode, undefined, sessionMgr, questionMgr);
      const rejoin = handler.joinSession(session.joinCode, first.participantId, sessionMgr, questionMgr);

      expect(rejoin.participantId).toBe(first.participantId);
    });

    it("re-join returns the same session", () => {
      const { sessionMgr, questionMgr, handler } = makeManagers();
      const session = sessionMgr.createSession("Test", undefined, true);

      const first = handler.joinSession(session.joinCode, undefined, sessionMgr, questionMgr);
      const rejoin = handler.joinSession(session.joinCode, first.participantId, sessionMgr, questionMgr);

      expect(rejoin.session.id).toBe(first.session.id);
    });

    it("re-join with explicit participantId works even when anonymousAllowed is false", () => {
      const { sessionMgr, questionMgr, handler } = makeManagers();
      const session = sessionMgr.createSession("Test", undefined, false);

      const result = handler.joinSession(session.joinCode, "user-123", sessionMgr, questionMgr);

      expect(result.participantId).toBe("user-123");
    });
  });
});
