import { UpvoteManager } from "../../src/upvote-manager";
import { Question, Session, SessionClosedError, UpvoteEligibilityError, DuplicateUpvoteError } from "../../src/types";

function makeSession(status: Session["status"] = "open"): Session {
  return {
    id: "session-1",
    joinCode: "ABC123",
    title: "Test Session",
    hostId: "host-1",
    status,
    anonymousAllowed: true,
    createdAt: new Date(),
  };
}

function makeQuestion(status: Question["status"] = "approved"): Question {
  return {
    id: "q-1",
    sessionId: "session-1",
    participantId: "p-1",
    text: "Test question?",
    status,
    upvoteCount: 0,
    submittedAt: new Date(),
    lastModifiedAt: new Date(),
  };
}

describe("UpvoteManager", () => {
  let manager: UpvoteManager;

  beforeEach(() => {
    manager = new UpvoteManager();
  });

  describe("upvote", () => {
    it("succeeds for an approved question in an open session", () => {
      const session = makeSession("open");
      const question = makeQuestion("approved");
      const upvote = manager.upvote(question, "participant-1", session);
      expect(upvote.questionId).toBe(question.id);
      expect(upvote.participantId).toBe("participant-1");
      expect(upvote.sessionId).toBe(session.id);
      expect(upvote.createdAt).toBeInstanceOf(Date);
    });

    it("succeeds for a pinned question in an open session", () => {
      const session = makeSession("open");
      const question = makeQuestion("pinned");
      const upvote = manager.upvote(question, "participant-1", session);
      expect(upvote.questionId).toBe(question.id);
    });

    it("increments question.upvoteCount by 1", () => {
      const session = makeSession("open");
      const question = makeQuestion("approved");
      expect(question.upvoteCount).toBe(0);
      manager.upvote(question, "participant-1", session);
      expect(question.upvoteCount).toBe(1);
    });

    it("throws SessionClosedError when session is closed", () => {
      const session = makeSession("closed");
      const question = makeQuestion("approved");
      expect(() => manager.upvote(question, "participant-1", session)).toThrow(SessionClosedError);
    });

    it("throws SessionClosedError when session is in created state", () => {
      const session = makeSession("created");
      const question = makeQuestion("approved");
      expect(() => manager.upvote(question, "participant-1", session)).toThrow(SessionClosedError);
    });

    it("throws UpvoteEligibilityError for pending question", () => {
      const session = makeSession("open");
      const question = makeQuestion("pending");
      expect(() => manager.upvote(question, "participant-1", session)).toThrow(UpvoteEligibilityError);
    });

    it("throws UpvoteEligibilityError for rejected question", () => {
      const session = makeSession("open");
      const question = makeQuestion("rejected");
      expect(() => manager.upvote(question, "participant-1", session)).toThrow(UpvoteEligibilityError);
    });

    it("throws UpvoteEligibilityError for answered question", () => {
      const session = makeSession("open");
      const question = makeQuestion("answered");
      expect(() => manager.upvote(question, "participant-1", session)).toThrow(UpvoteEligibilityError);
    });

    it("throws DuplicateUpvoteError when same participant upvotes twice", () => {
      const session = makeSession("open");
      const question = makeQuestion("approved");
      manager.upvote(question, "participant-1", session);
      expect(() => manager.upvote(question, "participant-1", session)).toThrow(DuplicateUpvoteError);
    });

    it("allows different participants to upvote the same question", () => {
      const session = makeSession("open");
      const question = makeQuestion("approved");
      manager.upvote(question, "participant-1", session);
      manager.upvote(question, "participant-2", session);
      expect(question.upvoteCount).toBe(2);
    });
  });

  describe("getUpvoteCount", () => {
    it("returns 0 for a question with no upvotes", () => {
      expect(manager.getUpvoteCount("q-1")).toBe(0);
    });

    it("returns the correct count after upvotes", () => {
      const session = makeSession("open");
      const question = makeQuestion("approved");
      manager.upvote(question, "participant-1", session);
      manager.upvote(question, "participant-2", session);
      expect(manager.getUpvoteCount(question.id)).toBe(2);
    });

    it("counts are independent per question", () => {
      const session = makeSession("open");
      const q1 = { ...makeQuestion("approved"), id: "q-1" };
      const q2 = { ...makeQuestion("approved"), id: "q-2" };
      manager.upvote(q1, "participant-1", session);
      expect(manager.getUpvoteCount("q-1")).toBe(1);
      expect(manager.getUpvoteCount("q-2")).toBe(0);
    });
  });
});
