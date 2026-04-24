// Feature: question-pool-live-qna, Property 12: Reconnection delivers full state

import * as fc from "fast-check";
import { QuestionManager } from "../../src/question-manager";
import { RealTimeBroadcaster } from "../../src/realtime-broadcaster";
import { Session, QuestionStatus, Question } from "../../src/types";

// **Validates: Requirements 6.4**
describe("Property 12: Reconnection delivers full state", () => {
  it(
    "a reconnecting participant receives all currently visible questions in the correct order",
    () => {
      fc.assert(
        fc.property(
          // Generate a list of target statuses for questions in the session
          fc.array(
            fc.constantFrom<QuestionStatus>(
              "pending",
              "approved",
              "rejected",
              "answered",
              "pinned"
            ),
            { minLength: 0, maxLength: 10 }
          ),
          (statuses) => {
            const sessionId = "session-reconnect";
            const openSession: Session = {
              id: sessionId,
              joinCode: "RECON1",
              title: "Reconnection Test",
              hostId: "host-1",
              status: "open",
              anonymousAllowed: true,
              createdAt: new Date(),
              startedAt: new Date(),
            };

            const questionMgr = new QuestionManager();
            const broadcaster = new RealTimeBroadcaster();
            // No real WebSocket needed — we test the state snapshot directly

            // Submit and moderate questions to reach desired statuses
            const questionIds: string[] = [];
            for (let i = 0; i < statuses.length; i++) {
              const q = questionMgr.submitQuestion(
                sessionId,
                `participant-${i}`,
                `Question ${i + 1}`,
                openSession
              );
              questionIds.push(q.id);
            }

            for (let i = 0; i < statuses.length; i++) {
              const id = questionIds[i];
              const target = statuses[i];
              switch (target) {
                case "pending":
                  break;
                case "approved":
                  questionMgr.approveQuestion(id, "mod-1");
                  break;
                case "rejected":
                  questionMgr.rejectQuestion(id, "mod-1");
                  break;
                case "pinned":
                  questionMgr.pinQuestion(id, "mod-1");
                  break;
                case "answered":
                  questionMgr.approveQuestion(id, "mod-1");
                  questionMgr.markAnswered(id, "mod-1");
                  break;
              }
            }

            // Simulate what the WebSocket server does on reconnect:
            // fetch the current visible questions and capture what would be sent.
            const visibleQuestions = questionMgr.getVisibleQuestions(sessionId);

            // Property assertions:

            // 1. All returned questions are visible (approved or pinned)
            const allVisible = visibleQuestions.every(
              (q) => q.status === "approved" || q.status === "pinned"
            );
            if (!allVisible) return false;

            // 2. Count matches the number of approved/pinned questions we created
            const expectedCount = statuses.filter(
              (s) => s === "approved" || s === "pinned"
            ).length;
            if (visibleQuestions.length !== expectedCount) return false;

            // 3. Ordering invariant: pinned before approved
            const firstApprovedIdx = visibleQuestions.findIndex(
              (q) => q.status === "approved"
            );
            const lastPinnedIdx = visibleQuestions.reduce(
              (acc, q, idx) => (q.status === "pinned" ? idx : acc),
              -1
            );
            if (firstApprovedIdx !== -1 && lastPinnedIdx !== -1) {
              if (lastPinnedIdx > firstApprovedIdx) return false;
            }

            // 4. Among approved questions: sorted by upvoteCount DESC, then submittedAt ASC
            const approvedOnly = visibleQuestions.filter(
              (q) => q.status === "approved"
            );
            for (let i = 1; i < approvedOnly.length; i++) {
              const prev = approvedOnly[i - 1];
              const curr = approvedOnly[i];
              if (prev.upvoteCount < curr.upvoteCount) return false;
              if (
                prev.upvoteCount === curr.upvoteCount &&
                prev.submittedAt > curr.submittedAt
              )
                return false;
            }

            return true;
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
