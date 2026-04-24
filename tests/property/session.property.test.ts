// Feature: question-pool-live-qna, Property 1: Session creation round-trip

import * as fc from 'fast-check';
import { SessionManager } from '../../src/session-manager';
import { TransitionError } from '../../src/types';

// **Validates: Requirements 1.1, 1.4**
describe('Property 1: Session creation round-trip', () => {
  it('created session title, description, and join code match inputs', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.option(fc.string({ maxLength: 200 })),
        (title, description) => {
          const manager = new SessionManager();
          const session = manager.createSession(title, description ?? undefined);

          return (
            session.title === title &&
            session.description === (description ?? undefined) &&
            typeof session.joinCode === 'string' &&
            session.joinCode.length > 0
          );
        }
      ),
      { numRuns: 25 }
    );
  });
});

// Feature: question-pool-live-qna, Property 3: Join code uniqueness

// **Validates: Requirements 1.4**
describe('Property 3: Join code uniqueness', () => {
  it('all join codes across independently created sessions are pairwise distinct', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        (n) => {
          const manager = new SessionManager();
          const sessions = Array.from({ length: n }, (_, i) =>
            manager.createSession(`Session ${i}`)
          );

          const codes = sessions.map(s => s.joinCode);
          const uniqueCodes = new Set(codes);
          return uniqueCodes.size === codes.length;
        }
      ),
      { numRuns: 25 }
    );
  });
});

// Feature: question-pool-live-qna, Property 2: Session lifecycle state transitions

// **Validates: Requirements 1.2, 1.3, 1.6**
describe('Property 2: Session lifecycle state transitions', () => {
  it('starting a session sets status to open, ending sets status to closed, and ending a closed session throws TransitionError', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        (title) => {
          const manager = new SessionManager();
          const session = manager.createSession(title);

          const opened = manager.startSession(session.id, 'host-1');
          if (opened.status !== 'open') return false;

          const closed = manager.endSession(session.id, 'host-1');
          if (closed.status !== 'closed') return false;

          // Ending a closed session must throw TransitionError
          let threw = false;
          try {
            manager.endSession(session.id, 'host-1');
          } catch (err) {
            if (err instanceof TransitionError) {
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
