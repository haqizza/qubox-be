import {
  Upvote,
  Question,
  Session,
  SessionClosedError,
  UpvoteEligibilityError,
  DuplicateUpvoteError,
} from "./types";
import { RealTimeBroadcaster } from "./realtime-broadcaster";
import db from "./db";

export class UpvoteManager {
  private broadcaster: RealTimeBroadcaster | null = null;

  setBroadcaster(broadcaster: RealTimeBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  upvote(question: Question, participantId: string, session: Session): Upvote {
    if (session.status !== "open") throw new SessionClosedError();

    if (question.status === "pending" || question.status === "rejected" || question.status === "answered") {
      throw new UpvoteEligibilityError(`Question is not eligible for upvoting (status: ${question.status})`);
    }

    const existing = db.prepare(
      "SELECT 1 FROM upvotes WHERE questionId = ? AND participantId = ?"
    ).get(question.id, participantId);
    if (existing) throw new DuplicateUpvoteError();

    const upvote: Upvote = {
      questionId: question.id,
      participantId,
      sessionId: session.id,
      createdAt: new Date(),
    };

    db.prepare(
      "INSERT INTO upvotes (questionId, participantId, sessionId, createdAt) VALUES (?, ?, ?, ?)"
    ).run(upvote.questionId, upvote.participantId, upvote.sessionId, upvote.createdAt.toISOString());

    // Increment upvote count atomically in DB and return new count
    db.prepare("UPDATE questions SET upvoteCount = upvoteCount + 1 WHERE id = ?").run(question.id);
    const row = db.prepare("SELECT upvoteCount FROM questions WHERE id = ?").get(question.id) as { upvoteCount: number };

    this.broadcaster?.broadcast(session.id, {
      type: "upvote_updated",
      questionId: question.id,
      upvoteCount: row.upvoteCount,
    });

    return upvote;
  }

  getUpvoteCount(questionId: string): number {
    const row = db.prepare("SELECT upvoteCount FROM questions WHERE id = ?").get(questionId) as { upvoteCount: number } | undefined;
    return row?.upvoteCount ?? 0;
  }
}

export const upvoteManager = new UpvoteManager();
