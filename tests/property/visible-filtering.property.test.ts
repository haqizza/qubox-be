// Feature: question-pool-live-qna, Property 10: Visible question filtering

import * as fc from 'fast-check';
import { QuestionManager } from '../../src/question-manager';
import { Session, QuestionStatus } from '../../src/types';

const openSession: Session = {
  id: 'session-vis',
  joinCode: 'VIS123',
  title: 'Visible Filtering Test',
  hostId: 'host-1',
  status: 'open',
  anonymousAllowed: false,
  createdAt: new Date(),
  startedAt: new Date(),
};

// **Validates: Requirements 5.1, 5.4**
describe('Property 10: Visible question filtering', () => {
  it('getVisibleQuestions returns only approved or pinned questions', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.constantFrom<QuestionStatus>('pending', 'approved', 'rejected', 'answered', 'pinned'),
          { minLength: 1, maxLength: 10 }
        ),
        (statuses) => {
          const manager = new QuestionManager();
          const moderatorId = 'mod-1';

          // Submit one question per desired status (all start as pending)
          const questionIds: string[] = [];
          for (let i = 0; i < statuses.length; i++) {
            const q = manager.submitQuestion(
              openSession.id,
              `participant-${i}`,
              `Question ${i + 1}`,
              openSession
            );
            questionIds.push(q.id);
          }

          // Apply moderation to reach the desired status
          for (let i = 0; i < statuses.length; i++) {
            const id = questionIds[i];
            const target = statuses[i];

            switch (target) {
              case 'pending':
                // no action needed — already pending
                break;
              case 'approved':
                manager.approveQuestion(id, moderatorId);
                break;
              case 'rejected':
                manager.rejectQuestion(id, moderatorId);
                break;
              case 'pinned':
                manager.pinQuestion(id, moderatorId);
                break;
              case 'answered':
                // approved → answered
                manager.approveQuestion(id, moderatorId);
                manager.markAnswered(id, moderatorId);
                break;
            }
          }

          // Verify visible questions contain only approved or pinned
          const visible = manager.getVisibleQuestions(openSession.id);
          return visible.every(
            (q) => q.status === 'approved' || q.status === 'pinned'
          );
        }
      ),
      { numRuns: 25 }
    );
  });
});
