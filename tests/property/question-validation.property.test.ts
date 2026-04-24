// Feature: question-pool-live-qna, Property 4: Question length validation

import * as fc from 'fast-check';
import { QuestionManager } from '../../src/question-manager';
import { ValidationError, Session } from '../../src/types';

const openSession: Session = {
  id: 'session-1',
  joinCode: 'ABC123',
  title: 'Test Session',
  hostId: 'host-1',
  status: 'open',
  anonymousAllowed: false,
  createdAt: new Date(),
  startedAt: new Date(),
};

// **Validates: Requirements 2.1, 2.2**
describe('Property 4: Question length validation', () => {
  it('valid strings (length 1–300) succeed; invalid strings (length 0 or >300) throw ValidationError', () => {
    // Valid strings should succeed
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 300 }),
        (text) => {
          const manager = new QuestionManager();
          const question = manager.submitQuestion('session-1', 'participant-1', text, openSession);
          return question !== null && question !== undefined;
        }
      ),
      { numRuns: 25 }
    );

    // Invalid strings should throw ValidationError
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(''), fc.string({ minLength: 301, maxLength: 400 })),
        (text) => {
          const manager = new QuestionManager();
          try {
            manager.submitQuestion('session-1', 'participant-1', text, openSession);
            return false; // should have thrown
          } catch (err) {
            return err instanceof ValidationError;
          }
        }
      ),
      { numRuns: 25 }
    );
  });
});

// Feature: question-pool-live-qna, Property 5: Question ID uniqueness and initial status

// **Validates: Requirements 2.3, 2.5**
describe('Property 5: Question ID uniqueness and initial status', () => {
  it('all question IDs are pairwise distinct, timestamps are non-null, and initial status is pending', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (count) => {
          const manager = new QuestionManager();
          const questions = Array.from({ length: count }, (_, i) =>
            manager.submitQuestion('session-1', `participant-${i}`, `Question number ${i + 1}`, openSession)
          );

          const ids = questions.map(q => q.id);
          const uniqueIds = new Set(ids);
          if (uniqueIds.size !== ids.length) return false;

          for (const q of questions) {
            if (q.submittedAt === null || q.submittedAt === undefined) return false;
            if (q.lastModifiedAt === null || q.lastModifiedAt === undefined) return false;
            if (q.status !== 'pending') return false;
          }

          return true;
        }
      ),
      { numRuns: 25 }
    );
  });
});
