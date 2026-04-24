// Feature: question-pool-live-qna, Property 13: Join code round-trip

import * as fc from 'fast-check';
import { SessionJoinHandler } from '../../src/session-join-handler';
import { SessionManager } from '../../src/session-manager';
import { QuestionManager } from '../../src/question-manager';
import { JoinError } from '../../src/types';

// **Validates: Requirements 7.1, 7.2**
describe('Property 13: Join code round-trip', () => {
  it('valid join code grants access to the exact session; invalid code is rejected with JoinError', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.string({ minLength: 1, maxLength: 10 }).filter(s => !/^[A-Z0-9]{6}$/.test(s)),
        (title, invalidCode) => {
          const sessionMgr = new SessionManager();
          const questionMgr = new QuestionManager();
          const joinHandler = new SessionJoinHandler();

          const session = sessionMgr.createSession(title, undefined, true);

          // Valid join code must return the exact session
          const result = joinHandler.joinSession(session.joinCode, undefined, sessionMgr, questionMgr);
          if (result.session.id !== session.id) return false;
          if (result.session.joinCode !== session.joinCode) return false;

          // Invalid join code must throw JoinError
          let threw = false;
          try {
            joinHandler.joinSession(invalidCode, undefined, sessionMgr, questionMgr);
          } catch (err) {
            if (err instanceof JoinError) {
              threw = true;
            }
          }

          return threw;
        }
      ),
      { numRuns: 25 }
    );
  });
});

// Feature: question-pool-live-qna, Property 14: Anonymous participant identity assignment

// **Validates: Requirements 7.3**
describe('Property 14: Anonymous participant identity assignment', () => {
  it('joining an anonymous-enabled session without credentials returns a non-null participant identifier', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        (title) => {
          const sessionMgr = new SessionManager();
          const questionMgr = new QuestionManager();
          const joinHandler = new SessionJoinHandler();

          const session = sessionMgr.createSession(title, undefined, true);

          const result = joinHandler.joinSession(session.joinCode, undefined, sessionMgr, questionMgr);

          return (
            result.participantId !== null &&
            result.participantId !== undefined &&
            typeof result.participantId === 'string' &&
            result.participantId.length > 0
          );
        }
      ),
      { numRuns: 25 }
    );
  });
});

// Feature: question-pool-live-qna, Property 15: Re-join idempotence

// **Validates: Requirements 7.4**
describe('Property 15: Re-join idempotence', () => {
  it('re-joining with the same join code and participantId returns the same participant identifier', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.uuid(),
        (title, participantId) => {
          const sessionMgr = new SessionManager();
          const questionMgr = new QuestionManager();
          const joinHandler = new SessionJoinHandler();

          const session = sessionMgr.createSession(title, undefined, true);

          // First join with explicit participantId
          const firstResult = joinHandler.joinSession(session.joinCode, participantId, sessionMgr, questionMgr);

          // Re-join with the same participantId
          const secondResult = joinHandler.joinSession(session.joinCode, participantId, sessionMgr, questionMgr);

          return firstResult.participantId === secondResult.participantId;
        }
      ),
      { numRuns: 25 }
    );
  });
});
