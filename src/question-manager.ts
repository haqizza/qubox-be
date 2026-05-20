import { v4 as uuidv4 } from "uuid";
import {
  Question,
  Session,
  ValidationError,
  SessionClosedError,
  ModerationEvent,
  ReconfirmationRequired,
  TransitionError,
  NotFoundError,
} from "./types";
import { orderQuestions } from "./order-engine";
import { RealTimeBroadcaster } from "./realtime-broadcaster";
import db from "./db";

function rowToQuestion(row: Record<string, unknown>): Question {
  return {
    id: row.id as string,
    sessionId: row.sessionId as string,
    participantId: row.participantId as string,
    text: row.text as string,
    status: row.status as Question["status"],
    upvoteCount: row.upvoteCount as number,
    submittedAt: new Date(row.submittedAt as string),
    lastModifiedAt: new Date(row.lastModifiedAt as string),
    lastModifiedBy: (row.lastModifiedBy as string) ?? undefined,
  };
}

export class QuestionManager {
  // Keep moderation events in memory — they are audit-only and not queried by the API
  public moderationEvents: Map<string, ModerationEvent[]> = new Map();
  private broadcaster: RealTimeBroadcaster | null = null;

  setBroadcaster(broadcaster: RealTimeBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  submitQuestion(sessionId: string, participantId: string, text: string, session: Session): Question {
    if (session.status !== "open") throw new SessionClosedError();

    if (text.length < 1 || text.length > 300) {
      throw new ValidationError("Question text must be between 1 and 300 characters", "text");
    }

    const now = new Date();
    const question: Question = {
      id: uuidv4(),
      sessionId,
      participantId,
      text,
      status: "pending",
      upvoteCount: 0,
      submittedAt: now,
      lastModifiedAt: now,
    };

    db.prepare(`
      INSERT INTO questions (id, sessionId, participantId, text, status, upvoteCount, submittedAt, lastModifiedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      question.id, question.sessionId, question.participantId, question.text,
      question.status, question.upvoteCount,
      question.submittedAt.toISOString(), question.lastModifiedAt.toISOString()
    );

    this.broadcaster?.broadcast(sessionId, { type: "question_submitted", question: { ...question } });
    return question;
  }

  getQuestionById(questionId: string): Question {
    return this.getQuestion(questionId);
  }

  private getQuestion(questionId: string): Question {
    const row = db.prepare("SELECT * FROM questions WHERE id = ?").get(questionId) as Record<string, unknown> | undefined;
    if (!row) throw new NotFoundError(`Question not found: ${questionId}`);
    return rowToQuestion(row);
  }

  private recordModerationEvent(
    question: Question,
    fromStatus: Question["status"],
    toStatus: Question["status"],
    moderatorId: string
  ): void {
    const event: ModerationEvent = {
      id: uuidv4(),
      questionId: question.id,
      moderatorId,
      fromStatus,
      toStatus,
      timestamp: new Date(),
    };
    db.prepare(`
      INSERT INTO moderation_events (id, questionId, moderatorId, fromStatus, toStatus, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(event.id, event.questionId, event.moderatorId, event.fromStatus, event.toStatus, event.timestamp.toISOString());

    const events = this.moderationEvents.get(question.id) ?? [];
    events.push(event);
    this.moderationEvents.set(question.id, events);
  }

  approveQuestion(questionId: string, moderatorId: string): Question {
    const question = this.getQuestion(questionId);
    if (question.status !== "pending") throw new ReconfirmationRequired(question.status);

    const fromStatus = question.status;
    const now = new Date();
    db.prepare("UPDATE questions SET status = 'approved', lastModifiedAt = ?, lastModifiedBy = ? WHERE id = ?")
      .run(now.toISOString(), moderatorId, questionId);

    const updated = { ...question, status: "approved" as const, lastModifiedAt: now, lastModifiedBy: moderatorId };
    this.recordModerationEvent(updated, fromStatus, "approved", moderatorId);
    this.broadcaster?.broadcast(updated.sessionId, { type: "question_approved", question: updated });
    return updated;
  }

  rejectQuestion(questionId: string, moderatorId: string): Question {
    const question = this.getQuestion(questionId);
    if (question.status !== "pending") throw new ReconfirmationRequired(question.status);

    const fromStatus = question.status;
    const now = new Date();
    db.prepare("UPDATE questions SET status = 'rejected', lastModifiedAt = ?, lastModifiedBy = ? WHERE id = ?")
      .run(now.toISOString(), moderatorId, questionId);

    const updated = { ...question, status: "rejected" as const, lastModifiedAt: now, lastModifiedBy: moderatorId };
    this.recordModerationEvent(updated, fromStatus, "rejected", moderatorId);
    return updated;
  }

  pinQuestion(questionId: string, moderatorId: string): Question {
    const question = this.getQuestion(questionId);
    const fromStatus = question.status;
    const now = new Date();
    db.prepare("UPDATE questions SET status = 'pinned', lastModifiedAt = ?, lastModifiedBy = ? WHERE id = ?")
      .run(now.toISOString(), moderatorId, questionId);

    const updated = { ...question, status: "pinned" as const, lastModifiedAt: now, lastModifiedBy: moderatorId };
    this.recordModerationEvent(updated, fromStatus, "pinned", moderatorId);
    this.broadcaster?.broadcast(updated.sessionId, { type: "question_pinned", question: updated });
    return updated;
  }

  unpinQuestion(questionId: string, moderatorId: string): Question {
    const question = this.getQuestion(questionId);
    if (question.status !== "pinned") {
      throw new TransitionError(`Cannot unpin a question that is not pinned (current: '${question.status}')`);
    }

    const fromStatus = question.status;
    const now = new Date();
    db.prepare("UPDATE questions SET status = 'approved', lastModifiedAt = ?, lastModifiedBy = ? WHERE id = ?")
      .run(now.toISOString(), moderatorId, questionId);

    const updated = { ...question, status: "approved" as const, lastModifiedAt: now, lastModifiedBy: moderatorId };
    this.recordModerationEvent(updated, fromStatus, "approved", moderatorId);
    this.broadcaster?.broadcast(updated.sessionId, { type: "question_unpinned", question: updated });
    return updated;
  }

  markAnswered(questionId: string, moderatorId: string): Question {
    const question = this.getQuestion(questionId);
    if (question.status !== "approved" && question.status !== "pinned") {
      throw new TransitionError(`Cannot mark answered from status '${question.status}'; must be 'approved' or 'pinned'`);
    }

    const fromStatus = question.status;
    const now = new Date();
    db.prepare("UPDATE questions SET status = 'answered', lastModifiedAt = ?, lastModifiedBy = ? WHERE id = ?")
      .run(now.toISOString(), moderatorId, questionId);

    const updated = { ...question, status: "answered" as const, lastModifiedAt: now, lastModifiedBy: moderatorId };
    this.recordModerationEvent(updated, fromStatus, "answered", moderatorId);
    this.broadcaster?.broadcast(updated.sessionId, { type: "question_answered", question: updated });
    return updated;
  }

  getVisibleQuestions(sessionId: string): Question[] {
    const rows = db.prepare(
      "SELECT * FROM questions WHERE sessionId = ? AND status IN ('approved', 'pinned')"
    ).all(sessionId) as Record<string, unknown>[];
    return orderQuestions(rows.map(rowToQuestion));
  }

  getAllQuestions(sessionId: string): Question[] {
    const rows = db.prepare(
      "SELECT * FROM questions WHERE sessionId = ?"
    ).all(sessionId) as Record<string, unknown>[];
    // Return all questions ordered: pinned first, then approved by votes, then the rest by submission time
    const questions = rows.map(rowToQuestion);
    const ordered = orderQuestions(questions);
    const rest = questions
      .filter(q => q.status !== "pinned" && q.status !== "approved")
      .sort((a, b) => a.submittedAt.getTime() - b.submittedAt.getTime());
    return [...ordered, ...rest];
  }
}

export const questionManager = new QuestionManager();
