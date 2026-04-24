// Feature: question-pool-live-qna, Property 6: Moderation status transitions

import * as fc from 'fast-check';
import { QuestionManager } from '../../src/question-manager';
import { ReconfirmationRequired, TransitionError, Session } from '../../src/types';

const openSession: Session = {
  id: 'session-1',
  joinCode: 'ABC123',
  title: 'T',
  hostId: 'h',
  status: 'open',
  anonymousAllowed: false,
  createdAt: new Date(),
  startedAt: new Date(),
};

// **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
describe('Property 6: Moderation status transitions', () => {
  it('pending question: approve → approved, reject → rejected', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (moderatorId) => {
          const manager = new QuestionManager();
          const question = manager.submitQuestion('session-1', 'participant-1', 'Test question', openSession);
          
          // Test approve
          const approved = manager.approveQuestion(question.id, moderatorId);
          if (approved.status !== 'approved') return false;
          
          // Test reject on a new pending question
          const manager2 = new QuestionManager();
          const question2 = manager2.submitQuestion('session-1', 'participant-1', 'Test question 2', openSession);
          const rejected = manager2.rejectQuestion(question2.id, moderatorId);
          if (rejected.status !== 'rejected') return false;
          
          return true;
        }
      ),
      { numRuns: 25 }
    );
  });

  it('any question: pin → pinned', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (moderatorId) => {
          const manager = new QuestionManager();
          const question = manager.submitQuestion('session-1', 'participant-1', 'Test question', openSession);
          
          // Pin from pending
          const pinned = manager.pinQuestion(question.id, moderatorId);
          if (pinned.status !== 'pinned') return false;
          
          return true;
        }
      ),
      { numRuns: 25 }
    );
  });

  it('approved or pinned question: markAnswered → answered', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (moderatorId) => {
          // Test from approved
          const manager1 = new QuestionManager();
          const question1 = manager1.submitQuestion('session-1', 'participant-1', 'Test question 1', openSession);
          manager1.approveQuestion(question1.id, moderatorId);
          const answered1 = manager1.markAnswered(question1.id, moderatorId);
          if (answered1.status !== 'answered') return false;
          
          // Test from pinned
          const manager2 = new QuestionManager();
          const question2 = manager2.submitQuestion('session-1', 'participant-1', 'Test question 2', openSession);
          manager2.pinQuestion(question2.id, moderatorId);
          const answered2 = manager2.markAnswered(question2.id, moderatorId);
          if (answered2.status !== 'answered') return false;
          
          return true;
        }
      ),
      { numRuns: 25 }
    );
  });
});

// Feature: question-pool-live-qna, Property 7: Moderation audit trail

// **Validates: Requirements 3.6**
describe('Property 7: Moderation audit trail', () => {
  it('any status change by moderator must record moderatorId and non-null timestamp', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        (moderatorId) => {
          const manager = new QuestionManager();
          const question = manager.submitQuestion('session-1', 'participant-1', 'Test question', openSession);
          
          // Perform a status change (approve)
          manager.approveQuestion(question.id, moderatorId);
          
          // Check moderation events
          const events = manager.moderationEvents.get(question.id);
          if (!events || events.length === 0) return false;
          
          const event = events[0];
          if (event.moderatorId !== moderatorId) return false;
          if (event.timestamp === null || event.timestamp === undefined) return false;
          
          return true;
        }
      ),
      { numRuns: 25 }
    );
  });
});
