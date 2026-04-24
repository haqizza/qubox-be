import { SessionManager } from "../../src/session-manager";
import { NotFoundError, TransitionError } from "../../src/types";

describe("SessionManager", () => {
  let manager: SessionManager;

  beforeEach(() => {
    manager = new SessionManager();
  });

  describe("createSession", () => {
    it("creates a session with the given title", () => {
      const session = manager.createSession("My Session");
      expect(session.title).toBe("My Session");
    });

    it("creates a session with optional description", () => {
      const session = manager.createSession("Title", "A description");
      expect(session.description).toBe("A description");
    });

    it("sets initial status to 'created'", () => {
      const session = manager.createSession("Title");
      expect(session.status).toBe("created");
    });

    it("assigns a non-empty join code", () => {
      const session = manager.createSession("Title");
      expect(session.joinCode).toMatch(/^[A-Z0-9]{6}$/);
    });

    it("assigns a unique UUID id", () => {
      const s1 = manager.createSession("A");
      const s2 = manager.createSession("B");
      expect(s1.id).not.toBe(s2.id);
    });

    it("assigns unique join codes across sessions", () => {
      const codes = new Set(
        Array.from({ length: 20 }, () => manager.createSession("T").joinCode)
      );
      expect(codes.size).toBe(20);
    });

    it("sets anonymousAllowed from parameter", () => {
      const s1 = manager.createSession("T", undefined, true);
      const s2 = manager.createSession("T", undefined, false);
      expect(s1.anonymousAllowed).toBe(true);
      expect(s2.anonymousAllowed).toBe(false);
    });

    it("defaults anonymousAllowed to false", () => {
      const session = manager.createSession("T");
      expect(session.anonymousAllowed).toBe(false);
    });

    it("sets createdAt to a Date", () => {
      const session = manager.createSession("T");
      expect(session.createdAt).toBeInstanceOf(Date);
    });
  });

  describe("startSession", () => {
    it("transitions status from created to open", () => {
      const session = manager.createSession("T");
      const started = manager.startSession(session.id, "host-1");
      expect(started.status).toBe("open");
    });

    it("sets startedAt", () => {
      const session = manager.createSession("T");
      const started = manager.startSession(session.id, "host-1");
      expect(started.startedAt).toBeInstanceOf(Date);
    });

    it("throws TransitionError if session is already open", () => {
      const session = manager.createSession("T");
      manager.startSession(session.id, "host-1");
      expect(() => manager.startSession(session.id, "host-1")).toThrow(TransitionError);
    });

    it("throws TransitionError if session is closed", () => {
      const session = manager.createSession("T");
      manager.startSession(session.id, "host-1");
      manager.endSession(session.id, "host-1");
      expect(() => manager.startSession(session.id, "host-1")).toThrow(TransitionError);
    });

    it("throws NotFoundError for unknown sessionId", () => {
      expect(() => manager.startSession("nonexistent", "host-1")).toThrow(NotFoundError);
    });
  });

  describe("endSession", () => {
    it("transitions status from open to closed", () => {
      const session = manager.createSession("T");
      manager.startSession(session.id, "host-1");
      const ended = manager.endSession(session.id, "host-1");
      expect(ended.status).toBe("closed");
    });

    it("sets endedAt", () => {
      const session = manager.createSession("T");
      manager.startSession(session.id, "host-1");
      const ended = manager.endSession(session.id, "host-1");
      expect(ended.endedAt).toBeInstanceOf(Date);
    });

    it("throws TransitionError if session is still in created state", () => {
      const session = manager.createSession("T");
      expect(() => manager.endSession(session.id, "host-1")).toThrow(TransitionError);
    });

    it("throws TransitionError if session is already closed", () => {
      const session = manager.createSession("T");
      manager.startSession(session.id, "host-1");
      manager.endSession(session.id, "host-1");
      expect(() => manager.endSession(session.id, "host-1")).toThrow(TransitionError);
    });

    it("throws NotFoundError for unknown sessionId", () => {
      expect(() => manager.endSession("nonexistent", "host-1")).toThrow(NotFoundError);
    });
  });

  describe("getSession", () => {
    it("returns the session by join code", () => {
      const session = manager.createSession("T");
      const found = manager.getSession(session.joinCode);
      expect(found.id).toBe(session.id);
    });

    it("throws NotFoundError for unknown join code", () => {
      expect(() => manager.getSession("XXXXXX")).toThrow(NotFoundError);
    });

    it("reflects updated status after start", () => {
      const session = manager.createSession("T");
      manager.startSession(session.id, "host-1");
      const found = manager.getSession(session.joinCode);
      expect(found.status).toBe("open");
    });

    it("reflects updated status after end", () => {
      const session = manager.createSession("T");
      manager.startSession(session.id, "host-1");
      manager.endSession(session.id, "host-1");
      const found = manager.getSession(session.joinCode);
      expect(found.status).toBe("closed");
    });
  });
});
