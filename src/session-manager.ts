import { v4 as uuidv4 } from "uuid";
import { Session, NotFoundError, TransitionError } from "./types";
import { RealTimeBroadcaster } from "./realtime-broadcaster";

const JOIN_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const JOIN_CODE_LENGTH = 6;

function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];
  }
  return code;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map(); // keyed by sessionId
  private joinCodeIndex: Map<string, string> = new Map(); // joinCode → sessionId
  private broadcaster: RealTimeBroadcaster | null = null;

  /**
   * Inject a RealTimeBroadcaster so `session_closed` is pushed when a host
   * ends a session. Optional to keep existing unit tests unchanged.
   */
  setBroadcaster(broadcaster: RealTimeBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  createSession(
    title: string,
    description?: string,
    anonymousAllowed: boolean = false,
    hostId: string = ""
  ): Session {
    let joinCode: string;
    do {
      joinCode = generateJoinCode();
    } while (this.joinCodeIndex.has(joinCode));

    const session: Session = {
      id: uuidv4(),
      joinCode,
      title,
      description,
      hostId,
      status: "created",
      anonymousAllowed,
      createdAt: new Date(),
    };

    this.sessions.set(session.id, session);
    this.joinCodeIndex.set(joinCode, session.id);

    return session;
  }

  startSession(sessionId: string, hostId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError(`Session not found: ${sessionId}`);
    }
    if (session.status !== "created") {
      throw new TransitionError(
        `Cannot start session in status '${session.status}'. Expected 'created'.`
      );
    }

    const updated: Session = {
      ...session,
      status: "open",
      startedAt: new Date(),
    };
    this.sessions.set(sessionId, updated);
    return updated;
  }

  endSession(sessionId: string, hostId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError(`Session not found: ${sessionId}`);
    }
    if (session.status !== "open") {
      throw new TransitionError(
        `Cannot end session in status '${session.status}'. Expected 'open'.`
      );
    }

    const updated: Session = {
      ...session,
      status: "closed",
      endedAt: new Date(),
    };
    this.sessions.set(sessionId, updated);
    this.broadcaster?.broadcast(sessionId, { type: "session_closed" });
    return updated;
  }

  getSessionById(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError(`Session not found: ${sessionId}`);
    }
    return session;
  }

  getSession(joinCode: string): Session {
    const sessionId = this.joinCodeIndex.get(joinCode);
    if (!sessionId) {
      throw new NotFoundError(`Session not found for join code: ${joinCode}`);
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new NotFoundError(`Session not found for join code: ${joinCode}`);
    }
    return session;
  }
}

export const sessionManager = new SessionManager();
