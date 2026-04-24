// Feature: question-pool-live-qna, Property 8: Upvote deduplication and accurate count

import * as fc from 'fast-check';
import { UpvoteManager } from '../../src/upvote-manager';
import { DuplicateUpvoteError, UpvoteEligibilityError, Question, Session } from '../../src/types';

const openSession: Session = {
  id: 'session-1',
  joinCode: 'ABC123',
  title: 'Test Session',
  hostId: 'host-1',
  status: 'open',
  anonymousAllowed: true,
  createdAt: new Date(),
  startedAt: new Date(),
};

function makeQuestion(status: Question['status']): Question {
  return {
    id: 'question-' + Math.random().toString(36).slice(2),
    sessionId: 'session-1',
    participantId: 'participant-1',
    text: 'Test question?',
    status,
    upvoteCount: 0,
    submittedAt: new Date(),
    lastModifiedAt: new Date(),
  };
}

// **Validates: Requirements 4.2, 4.3, 4.4**
describe('Property 8: Upvote deduplication and accurate count', () => {
  it('upvote count equals distinct participants; duplicate upvote throws DuplicateUpvoteError', () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 1, maxLength: 10 }),
        (participantIds) => {
          const manager = new UpvoteManager();
          const question = makeQuestion('approved');

          // Upvote once per distinct participant
          const distinct = [...new Set(participantIds)];
          for (const pid of distinct) {
            manager.upvote(question, pid, openSession);
          }

          // upvoteCount must equal number of distinct participants
          if (question.upvoteCount !== distinct.length) return false;
          if (manager.getUpvoteCount(question.id) !== distinct.length) return false;

          // Duplicate upvote from first participant must throw DuplicateUpvoteError
          let threw = false;
          try {
            manager.upvote(question, distinct[0], openSession);
          } catch (e) {
            if (e instanceof DuplicateUpvoteError) threw = true;
          }
          if (!threw) return false;

          // Count must not have changed after duplicate attempt
          if (question.upvoteCount !== distinct.length) return false;

          return true;
        }
      ),
      { numRuns: 25 }
    );
  });
});

// Feature: question-pool-live-qna, Property 9: Upvote eligibility guard

// **Validates: Requirements 4.1, 4.5**
describe('Property 9: Upvote eligibility guard', () => {
  it('ineligible statuses (pending, rejected, answered) must throw UpvoteEligibilityError', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Question['status']>('pending', 'rejected', 'answered'),
        (status) => {
          const manager = new UpvoteManager();
          const question = makeQuestion(status);

          let threw = false;
          try {
            manager.upvote(question, 'participant-1', openSession);
          } catch (e) {
            if (e instanceof UpvoteEligibilityError) threw = true;
          }

          return threw;
        }
      ),
      { numRuns: 25 }
    );
  });

  it('eligible statuses (approved, pinned) in open session must allow first upvote', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Question['status']>('approved', 'pinned'),
        (status) => {
          const manager = new UpvoteManager();
          const question = makeQuestion(status);

          try {
            manager.upvote(question, 'participant-1', openSession);
          } catch {
            return false;
          }

          return question.upvoteCount === 1;
        }
      ),
      { numRuns: 25 }
    );
  });
});
