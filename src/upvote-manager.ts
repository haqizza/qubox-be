import { v4 as uuidv4 } from "uuid";
import {
  Upvote,
  Question,
  Session,
  SessionClosedError,
  UpvoteEligibilityError,
  DuplicateUpvoteError,
} from "./types";
import { RealTimeBroadcaster } from "./realtime-broadcaster";

export class UpvoteManager {
  // Keyed by `${questionId}:${participantId}` for deduplication
  private upvoteKeys: Set<string> = new Set();
  // Keyed by questionId
  private upvotes: Map<string, Upvote[]> = new Map();
  private broadcaster: RealTimeBroadcaster | null = null;

  /**
   * Inject a RealTimeBroadcaster so successful upvotes push `upvote_updated`
   * events to connected clients. Optional to keep existing unit tests unchanged.
   */
  setBroadcaster(broadcaster: RealTimeBroadcaster): void {
    this.broadcaster = broadcaster;
  }

  upvote(question: Question, participantId: string, session: Session): Upvote {
    if (session.status !== "open") {
      throw new SessionClosedError();
    }

    if (
      question.status === "pending" ||
      question.status === "rejected" ||
      question.status === "answered"
    ) {
      throw new UpvoteEligibilityError(
        `Question is not eligible for upvoting (status: ${question.status})`
      );
    }

    const key = `${question.id}:${participantId}`;
    if (this.upvoteKeys.has(key)) {
      throw new DuplicateUpvoteError();
    }

    const upvote: Upvote = {
      questionId: question.id,
      participantId,
      sessionId: session.id,
      createdAt: new Date(),
    };

    this.upvoteKeys.add(key);

    const existing = this.upvotes.get(question.id) ?? [];
    existing.push(upvote);
    this.upvotes.set(question.id, existing);

    question.upvoteCount += 1;

    this.broadcaster?.broadcast(session.id, {
      type: "upvote_updated",
      questionId: question.id,
      upvoteCount: question.upvoteCount,
    });

    return upvote;
  }

  getUpvoteCount(questionId: string): number {
    return this.upvotes.get(questionId)?.length ?? 0;
  }
}

export const upvoteManager = new UpvoteManager();
