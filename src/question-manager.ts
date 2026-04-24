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

export class QuestionManager {
  private questions: Map<string, Question> = new Map(); // keyed by questionId
  public moderationEvents: Map<string, ModerationEvent[]> = new Map(); // keyed by questionId
  private broadcaster: RealTimeBroadcaster | null = null;

  /**
   * Inject a RealTimeBroadcaster so moderation actions can push events to
   * connected clients. Kept optional so existing unit tests need no changes.
   */
  setBroadcaster(broadcaster: RealTimeBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  submitQuestion(
    sessionId: string,
    participantId: string,
    text: string,
    session: Session
  ): Question {
    if (session.status !== "open") {
      throw new SessionClosedError();
    }

    if (text.length < 1 || text.length > 300) {
      throw new ValidationError(
        "Question text must be between 1 and 300 characters",
        "text"
      );
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

    this.questions.set(question.id, question);
    return question;
  }

  getQuestionById(questionId: string): Question {
    return this.getQuestion(questionId);
  }

  private getQuestion(questionId: string): Question {
    const question = this.questions.get(questionId);
    if (!question) {
      throw new NotFoundError(`Question not found: ${questionId}`);
    }
    return question;
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
    const events = this.moderationEvents.get(question.id) ?? [];
    events.push(event);
    this.moderationEvents.set(question.id, events);
  }

  approveQuestion(questionId: string, moderatorId: string): Question {
    const question = this.getQuestion(questionId);
    if (question.status !== "pending") {
      throw new ReconfirmationRequired(question.status);
    }
    const fromStatus = question.status;
    question.status = "approved";
    question.lastModifiedAt = new Date();
    question.lastModifiedBy = moderatorId;
    this.recordModerationEvent(question, fromStatus, "approved", moderatorId);
    this.broadcaster?.broadcast(question.sessionId, { type: "question_approved", question: { ...question } });
    return question;
  }

  rejectQuestion(questionId: string, moderatorId: string): Question {
    const question = this.getQuestion(questionId);
    if (question.status !== "pending") {
      throw new ReconfirmationRequired(question.status);
    }
    const fromStatus = question.status;
    question.status = "rejected";
    question.lastModifiedAt = new Date();
    question.lastModifiedBy = moderatorId;
    this.recordModerationEvent(question, fromStatus, "rejected", moderatorId);
    return question;
  }

  pinQuestion(questionId: string, moderatorId: string): Question {
    const question = this.getQuestion(questionId);
    const fromStatus = question.status;
    question.status = "pinned";
    question.lastModifiedAt = new Date();
    question.lastModifiedBy = moderatorId;
    this.recordModerationEvent(question, fromStatus, "pinned", moderatorId);
    this.broadcaster?.broadcast(question.sessionId, { type: "question_pinned", question: { ...question } });
    return question;
  }

  markAnswered(questionId: string, moderatorId: string): Question {
    const question = this.getQuestion(questionId);
    if (question.status !== "approved" && question.status !== "pinned") {
      throw new TransitionError(
        `Cannot mark answered from status '${question.status}'; must be 'approved' or 'pinned'`
      );
    }
    const fromStatus = question.status;
    question.status = "answered";
    question.lastModifiedAt = new Date();
    question.lastModifiedBy = moderatorId;
    this.recordModerationEvent(question, fromStatus, "answered", moderatorId);
    this.broadcaster?.broadcast(question.sessionId, { type: "question_answered", question: { ...question } });
    return question;
  }

  getVisibleQuestions(sessionId: string): Question[] {
    const filtered = Array.from(this.questions.values()).filter(
      (q) => q.sessionId === sessionId && (q.status === "approved" || q.status === "pinned")
    );
    return orderQuestions(filtered);
  }
}

export const questionManager = new QuestionManager();
