// Feature: question-pool-live-qna, Property 11: Question ordering invariant

import * as fc from 'fast-check';
import { orderQuestions } from '../../src/order-engine';
import { Question } from '../../src/types';

// **Validates: Requirements 5.2, 5.3**

const questionArb = fc.record<Question>({
  id: fc.uuid(),
  sessionId: fc.constant('session-1'),
  participantId: fc.constant('participant-1'),
  text: fc.constant('A question'),
  status: fc.constantFrom('approved', 'pinned' as const),
  upvoteCount: fc.nat({ max: 100 }),
  submittedAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
  lastModifiedAt: fc.constant(new Date('2024-01-01')),
});

describe('Property 11: Question ordering invariant', () => {
  it('all pinned questions appear before all approved questions', () => {
    fc.assert(
      fc.property(fc.array(questionArb), (questions) => {
        const ordered = orderQuestions(questions);

        // Find the index of the last pinned and first approved in the result
        const lastPinnedIndex = ordered.map(q => q.status).lastIndexOf('pinned');
        const firstApprovedIndex = ordered.map(q => q.status).indexOf('approved');

        // If both exist, last pinned must come before first approved
        if (lastPinnedIndex !== -1 && firstApprovedIndex !== -1) {
          return lastPinnedIndex < firstApprovedIndex;
        }
        return true;
      }),
      { numRuns: 25 }
    );
  });

  it('approved questions are sorted by upvote count descending', () => {
    fc.assert(
      fc.property(fc.array(questionArb), (questions) => {
        const ordered = orderQuestions(questions);
        const approvedOnly = ordered.filter(q => q.status === 'approved');

        for (let i = 0; i < approvedOnly.length - 1; i++) {
          if (approvedOnly[i].upvoteCount < approvedOnly[i + 1].upvoteCount) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 25 }
    );
  });

  it('approved questions with equal upvote counts are sorted by submittedAt ascending', () => {
    fc.assert(
      fc.property(fc.array(questionArb), (questions) => {
        const ordered = orderQuestions(questions);
        const approvedOnly = ordered.filter(q => q.status === 'approved');

        for (let i = 0; i < approvedOnly.length - 1; i++) {
          const a = approvedOnly[i];
          const b = approvedOnly[i + 1];
          if (a.upvoteCount === b.upvoteCount) {
            if (a.submittedAt.getTime() > b.submittedAt.getTime()) {
              return false;
            }
          }
        }
        return true;
      }),
      { numRuns: 25 }
    );
  });
});
