import { v4 as uuidv4 } from "uuid";
import { Session, NotFoundError, TransitionError } from "./types";
import { RealTimeBroadcaster } from "./realtime-broadcaster";
import db from "./db";

const JOIN_CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const JOIN_CODE_LENGTH = 6;

function generateJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) {
    code += JOIN_CODE_CHARS[Math.floor(Math.random() * JOIN_CODE_CHARS.length)];
  }
  return code;
}

function rowToSession(row: Record<string, unknown>): Session {
  return {
    id: row.id as string,
    joinCode: row.joinCode as string,
    title: row.title as string,
    description: (row.description as string) ?? undefined,
    hostId: row.hostId as string,
    status: row.status as Session["status"],
    anonymousAllowed: Boolean(row.anonymousAllowed),
    createdAt: new Date(row.createdAt as string),
    startedAt: row.startedAt ? new Date(row.startedAt as string) : undefined,
    endedAt: row.endedAt ? new Date(row.endedAt as string) : undefined,
  };
}

export class SessionManager {
  private broadcaster: RealTimeBroadcaster | null = null;

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
    } while (db.prepare("SELECT 1 FROM sessions WHERE joinCode = ?").get(joinCode));

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

    db.prepare(`
      INSERT INTO sessions (id, joinCode, title, description, hostId, status, anonymousAllowed, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      session.id,
      session.joinCode,
      session.title,
      session.description ?? null,
      session.hostId,
      session.status,
      session.anonymousAllowed ? 1 : 0,
      session.createdAt.toISOString()
    );

    return session;
  }

  startSession(sessionId: string, hostId: string): Session {
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundError(`Session not found: ${sessionId}`);

    const session = rowToSession(row);
    if (session.status !== "created") {
      throw new TransitionError(`Cannot start session in status '${session.status}'. Expected 'created'.`);
    }

    const startedAt = new Date();
    db.prepare("UPDATE sessions SET status = 'open', startedAt = ? WHERE id = ?")
      .run(startedAt.toISOString(), sessionId);

    const updated: Session = { ...session, status: "open", startedAt };
    this.broadcaster?.broadcast(sessionId, { type: "session_started", session: updated });
    return updated;
  }

  endSession(sessionId: string, hostId: string): Session {
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundError(`Session not found: ${sessionId}`);

    const session = rowToSession(row);
    if (session.status !== "open") {
      throw new TransitionError(`Cannot end session in status '${session.status}'. Expected 'open'.`);
    }

    const endedAt = new Date();
    db.prepare("UPDATE sessions SET status = 'closed', endedAt = ? WHERE id = ?")
      .run(endedAt.toISOString(), sessionId);

    const updated: Session = { ...session, status: "closed", endedAt };
    this.broadcaster?.broadcast(sessionId, { type: "session_closed" });
    return updated;
  }

  getSessionById(sessionId: string): Session {
    const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(sessionId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundError(`Session not found: ${sessionId}`);
    return rowToSession(row);
  }

  getSession(joinCode: string): Session {
    const row = db.prepare("SELECT * FROM sessions WHERE joinCode = ?").get(joinCode) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundError(`Session not found for join code: ${joinCode}`);
    return rowToSession(row);
  }

  resolveSession(joinCodeOrId: string): Session {
    // Try join code first, then session ID
    const row = db.prepare("SELECT * FROM sessions WHERE joinCode = ? OR id = ? LIMIT 1")
      .get(joinCodeOrId, joinCodeOrId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundError(`Session not found: ${joinCodeOrId}`);
    return rowToSession(row);
  }
}

export const sessionManager = new SessionManager();
