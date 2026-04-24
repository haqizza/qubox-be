import { v4 as uuidv4 } from "uuid";
import { JoinResult, JoinError, NotFoundError } from "./types";
import { SessionManager } from "./session-manager";
import { QuestionManager } from "./question-manager";

export class SessionJoinHandler {
  // Maps sessionId → Set of participantIds that have joined
  private participants: Map<string, Set<string>> = new Map();

  joinSession(
    joinCode: string,
    participantId: string | undefined,
    sessionMgr: SessionManager,
    questionMgr: QuestionManager
  ): JoinResult {
    // Validate join code
    let session;
    try {
      session = sessionMgr.getSession(joinCode);
    } catch (err) {
      if (err instanceof NotFoundError) {
        throw new JoinError("Session not found");
      }
      throw err;
    }

    // Resolve participantId
    let resolvedParticipantId: string;

    if (participantId !== undefined) {
      // Re-join case: use the provided participantId as-is
      resolvedParticipantId = participantId;
    } else if (session.anonymousAllowed) {
      // Anonymous join: assign a new UUID
      resolvedParticipantId = uuidv4();
    } else {
      throw new JoinError("Authentication required");
    }

    // Track participant in the session's set
    if (!this.participants.has(session.id)) {
      this.participants.set(session.id, new Set());
    }
    this.participants.get(session.id)!.add(resolvedParticipantId);

    // Fetch current visible questions
    const questions = questionMgr.getVisibleQuestions(session.id);

    return {
      session,
      participantId: resolvedParticipantId,
      questions,
    };
  }
}

export const sessionJoinHandler = new SessionJoinHandler();
