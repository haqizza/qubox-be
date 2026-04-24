import { QuestionManager } from "../../src/question-manager";
import {
  Session,
  ValidationError,
  SessionClosedError,
  ReconfirmationRequired,
  TransitionError,
} from "../../src/types";

// Minimal open session used across tests
const openSession: Session = {
  id: "session-1",
  joinCode: "ABC123",
  title: "Test Session",
  hostId: "host-1",
  status: "open",
  anonymousAllowed: true,
  createdAt: new Date(),
};

const closedSession: Session = {
  ...openSession,
  status: "closed",
};

const MOD = "mod-1";
const PARTICIPANT = "participant-1";

function makeManager() {
  return new QuestionManager();
}

describe("QuestionManager", () => {
  // ─── submitQuestion ───────────────────────────────────────────────────────

  describe("submitQuestion", () => {
    it("accepts text of exactly 1 character", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "A", openSession);
      expect(q.text).toBe("A");
    });

    it("accepts text of exactly 300 characters", () => {
      const qm = makeManager();
      const text = "x".repeat(300);
      const q = qm.submitQuestion("session-1", PARTICIPANT, text, openSession);
      expect(q.text).toBe(text);
    });

    it("rejects text of 0 characters with ValidationError", () => {
      const qm = makeManager();
      expect(() =>
        qm.submitQuestion("session-1", PARTICIPANT, "", openSession)
      ).toThrow(ValidationError);
    });

    it("rejects text of 301 characters with ValidationError", () => {
      const qm = makeManager();
      const text = "x".repeat(301);
      expect(() =>
        qm.submitQuestion("session-1", PARTICIPANT, text, openSession)
      ).toThrow(ValidationError);
    });

    it("rejects submission to a closed session with SessionClosedError", () => {
      const qm = makeManager();
      expect(() =>
        qm.submitQuestion("session-1", PARTICIPANT, "Hello?", closedSession)
      ).toThrow(SessionClosedError);
    });

    it("sets initial status to pending", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Hello?", openSession);
      expect(q.status).toBe("pending");
    });

    it("assigns unique IDs to each question", () => {
      const qm = makeManager();
      const q1 = qm.submitQuestion("session-1", PARTICIPANT, "Q1", openSession);
      const q2 = qm.submitQuestion("session-1", PARTICIPANT, "Q2", openSession);
      expect(q1.id).not.toBe(q2.id);
    });
  });

  // ─── approveQuestion ──────────────────────────────────────────────────────

  describe("approveQuestion", () => {
    it("transitions pending → approved (happy path)", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      const approved = qm.approveQuestion(q.id, MOD);
      expect(approved.status).toBe("approved");
    });

    it("throws ReconfirmationRequired if question is already approved", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      qm.approveQuestion(q.id, MOD);
      expect(() => qm.approveQuestion(q.id, MOD)).toThrow(ReconfirmationRequired);
    });

    it("throws ReconfirmationRequired if question is rejected", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      qm.rejectQuestion(q.id, MOD);
      expect(() => qm.approveQuestion(q.id, MOD)).toThrow(ReconfirmationRequired);
    });
  });

  // ─── rejectQuestion ───────────────────────────────────────────────────────

  describe("rejectQuestion", () => {
    it("transitions pending → rejected (happy path)", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      const rejected = qm.rejectQuestion(q.id, MOD);
      expect(rejected.status).toBe("rejected");
    });

    it("throws ReconfirmationRequired if question is already rejected", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      qm.rejectQuestion(q.id, MOD);
      expect(() => qm.rejectQuestion(q.id, MOD)).toThrow(ReconfirmationRequired);
    });

    it("throws ReconfirmationRequired if question is approved", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      qm.approveQuestion(q.id, MOD);
      expect(() => qm.rejectQuestion(q.id, MOD)).toThrow(ReconfirmationRequired);
    });
  });

  // ─── pinQuestion ──────────────────────────────────────────────────────────

  describe("pinQuestion", () => {
    it("transitions pending → pinned", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      const pinned = qm.pinQuestion(q.id, MOD);
      expect(pinned.status).toBe("pinned");
    });

    it("transitions approved → pinned", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      qm.approveQuestion(q.id, MOD);
      const pinned = qm.pinQuestion(q.id, MOD);
      expect(pinned.status).toBe("pinned");
    });

    it("transitions rejected → pinned (override)", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      qm.rejectQuestion(q.id, MOD);
      const pinned = qm.pinQuestion(q.id, MOD);
      expect(pinned.status).toBe("pinned");
    });
  });

  // ─── markAnswered ─────────────────────────────────────────────────────────

  describe("markAnswered", () => {
    it("transitions approved → answered", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      qm.approveQuestion(q.id, MOD);
      const answered = qm.markAnswered(q.id, MOD);
      expect(answered.status).toBe("answered");
    });

    it("transitions pinned → answered", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      qm.pinQuestion(q.id, MOD);
      const answered = qm.markAnswered(q.id, MOD);
      expect(answered.status).toBe("answered");
    });

    it("throws TransitionError from pending", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      expect(() => qm.markAnswered(q.id, MOD)).toThrow(TransitionError);
    });

    it("throws TransitionError from rejected", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      qm.rejectQuestion(q.id, MOD);
      expect(() => qm.markAnswered(q.id, MOD)).toThrow(TransitionError);
    });
  });

  // ─── getVisibleQuestions ──────────────────────────────────────────────────

  describe("getVisibleQuestions", () => {
    it("returns only approved and pinned questions", () => {
      const qm = makeManager();
      const pending = qm.submitQuestion("session-1", PARTICIPANT, "Pending", openSession);
      const toApprove = qm.submitQuestion("session-1", PARTICIPANT, "Approve me", openSession);
      const toPin = qm.submitQuestion("session-1", PARTICIPANT, "Pin me", openSession);
      const toReject = qm.submitQuestion("session-1", PARTICIPANT, "Reject me", openSession);
      const toAnswer = qm.submitQuestion("session-1", PARTICIPANT, "Answer me", openSession);

      qm.approveQuestion(toApprove.id, MOD);
      qm.pinQuestion(toPin.id, MOD);
      qm.rejectQuestion(toReject.id, MOD);
      qm.approveQuestion(toAnswer.id, MOD);
      qm.markAnswered(toAnswer.id, MOD);

      const visible = qm.getVisibleQuestions("session-1");
      const ids = visible.map((q) => q.id);

      expect(ids).toContain(toApprove.id);
      expect(ids).toContain(toPin.id);
      expect(ids).not.toContain(pending.id);
      expect(ids).not.toContain(toReject.id);
      expect(ids).not.toContain(toAnswer.id);
    });

    it("excludes pending, rejected, and answered questions", () => {
      const qm = makeManager();
      const q = qm.submitQuestion("session-1", PARTICIPANT, "Q?", openSession);
      const visible = qm.getVisibleQuestions("session-1");
      expect(visible).toHaveLength(0);
    });

    it("returns pinned questions before approved questions", () => {
      const qm = makeManager();
      // Submit approved first, then pinned — order should still be pinned first
      const approved = qm.submitQuestion("session-1", PARTICIPANT, "Approved Q", openSession);
      const pinned = qm.submitQuestion("session-1", PARTICIPANT, "Pinned Q", openSession);

      qm.approveQuestion(approved.id, MOD);
      qm.pinQuestion(pinned.id, MOD);

      const visible = qm.getVisibleQuestions("session-1");
      expect(visible[0].id).toBe(pinned.id);
      expect(visible[1].id).toBe(approved.id);
    });
  });
});
