// Core domain types for Question Pool Live Q&A

export interface Session {
  id: string;                    // UUID
  joinCode: string;              // short unique code, e.g. "ABC123"
  title: string;
  description?: string;
  hostId: string;
  status: "created" | "open" | "closed";
  anonymousAllowed: boolean;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export type QuestionStatus = "pending" | "approved" | "rejected" | "answered" | "pinned";

export interface Question {
  id: string;                    // UUID
  sessionId: string;
  participantId: string;         // anonymous UUID or authenticated user ID
  text: string;                  // 1–300 characters
  status: QuestionStatus;
  upvoteCount: number;
  submittedAt: Date;
  lastModifiedAt: Date;
  lastModifiedBy?: string;       // moderator ID
}

export interface Upvote {
  questionId: string;
  participantId: string;
  sessionId: string;
  createdAt: Date;
}

export interface ModerationEvent {
  id: string;
  questionId: string;
  moderatorId: string;
  fromStatus: QuestionStatus;
  toStatus: QuestionStatus;
  timestamp: Date;
}

export type SessionEvent =
  | { type: "question_approved"; question: Question }
  | { type: "question_pinned"; question: Question }
  | { type: "question_answered"; question: Question }
  | { type: "upvote_updated"; questionId: string; upvoteCount: number }
  | { type: "session_closed" }
  | { type: "session_state"; questions: Question[] };

export interface JoinResult {
  session: Session;
  participantId: string;         // existing or newly assigned
  questions: Question[];         // current visible questions
}

// Error types

export class ValidationError extends Error {
  constructor(message: string, public readonly field?: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class SessionClosedError extends Error {
  constructor(message = "Session is closed") {
    super(message);
    this.name = "SessionClosedError";
  }
}

export class JoinError extends Error {
  constructor(message = "Session not found") {
    super(message);
    this.name = "JoinError";
  }
}

export class DuplicateUpvoteError extends Error {
  constructor(message = "Already upvoted") {
    super(message);
    this.name = "DuplicateUpvoteError";
  }
}

export class UpvoteEligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UpvoteEligibilityError";
  }
}

export class ReconfirmationRequired extends Error {
  constructor(public readonly currentStatus: QuestionStatus) {
    super(`Question is not in pending status (current: ${currentStatus})`);
    this.name = "ReconfirmationRequired";
  }
}

export class TransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransitionError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
