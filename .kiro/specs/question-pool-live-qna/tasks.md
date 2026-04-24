# Implementation Plan: Question Pool Live Q&A

## Overview

Incremental implementation of the real-time Q&A platform: data models and validation first, then core business logic, then REST API, then WebSocket layer, then integration wiring. Each step builds on the previous and is validated before moving forward.

## Tasks

- [x] 1. Set up project structure, core types, and interfaces
  - Create directory structure matching the test organization in the design (`src/`, `tests/unit/`, `tests/property/`, `tests/integration/`)
  - Define all TypeScript interfaces and types: `Session`, `Question`, `QuestionStatus`, `Upvote`, `ModerationEvent`, `SessionEvent`, `JoinResult`
  - Set up testing framework (Jest + fast-check)
  - _Requirements: 1.1, 2.3, 3.6_

- [x] 2. Implement Order Engine
  - [x] 2.1 Implement `orderQuestions(questions: Question[]) → Question[]`
    - Pinned questions first, then approved sorted by upvotes DESC, ties broken by submittedAt ASC
    - Pure function with no side effects
    - _Requirements: 5.2, 5.3_

  - [x] 2.2 Write property test for question ordering invariant
    - **Property 11: Question ordering invariant**
    - **Validates: Requirements 5.2, 5.3**

  - [x] 2.3 Write unit tests for Order Engine
    - Test pinned-before-approved, descending upvotes, ascending timestamp tiebreak, empty list
    - _Requirements: 5.2, 5.3_

- [x] 3. Implement Session Manager
  - [x] 3.1 Implement `createSession`, `startSession`, `endSession`, `getSession`
    - Generate unique join codes on creation
    - Enforce status transitions: `created → open → closed`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Write property test for session creation round-trip
    - **Property 1: Session creation round-trip**
    - **Validates: Requirements 1.1, 1.4**

  - [x] 3.3 Write property test for join code uniqueness
    - **Property 3: Join code uniqueness**
    - **Validates: Requirements 1.4**

  - [x] 3.4 Write property test for session lifecycle state transitions
    - **Property 2: Session lifecycle state transitions**
    - **Validates: Requirements 1.2, 1.3, 1.6**

  - [x] 3.5 Write unit tests for Session Manager
    - Test happy-path create/start/end, invalid transitions, closed session rejects submissions
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6_

- [x] 4. Implement Question Manager
  - [x] 4.1 Implement `submitQuestion` with validation
    - Enforce 1–300 character limit, assign UUID and timestamp, set initial status to `pending`
    - Reject submissions to closed sessions
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 4.2 Write property test for question length validation
    - **Property 4: Question length validation**
    - **Validates: Requirements 2.1, 2.2**

  - [x] 4.3 Write property test for question ID uniqueness and initial status
    - **Property 5: Question ID uniqueness and initial status**
    - **Validates: Requirements 2.3, 2.5**

  - [x] 4.4 Implement moderation actions: `approveQuestion`, `rejectQuestion`, `pinQuestion`, `markAnswered`
    - Guard status transitions per the state machine in the design
    - Return `ReconfirmationRequired` (409) when approving/rejecting a non-pending question
    - Return `TransitionError` when marking answered from an ineligible status
    - Record `ModerationEvent` on every status change
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 4.5 Write property test for moderation status transitions
    - **Property 6: Moderation status transitions**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**

  - [x] 4.6 Write property test for moderation audit trail
    - **Property 7: Moderation audit trail**
    - **Validates: Requirements 3.6**

  - [x] 4.7 Implement `getVisibleQuestions`
    - Return only `approved` and `pinned` questions, ordered via Order Engine
    - _Requirements: 5.1, 5.4_

  - [x] 4.8 Write property test for visible question filtering
    - **Property 10: Visible question filtering**
    - **Validates: Requirements 5.1, 5.4**

  - [x] 4.9 Write unit tests for Question Manager
    - Test each status transition (happy path and error path), reconfirmation behavior, session-closed rejection, edge-case lengths (1, 300, 301 chars)
    - _Requirements: 2.1, 2.2, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. Implement Upvote Manager
  - [x] 5.1 Implement `upvote` and `getUpvoteCount`
    - Enforce per-participant per-question uniqueness (unique constraint on `(questionId, participantId)`)
    - Reject upvotes on `pending`, `rejected`, or `answered` questions
    - Reject upvotes in closed sessions
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 5.2 Write property test for upvote deduplication and accurate count
    - **Property 8: Upvote deduplication and accurate count**
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [x] 5.3 Write property test for upvote eligibility guard
    - **Property 9: Upvote eligibility guard**
    - **Validates: Requirements 4.1, 4.5**

  - [x] 5.4 Write unit tests for Upvote Manager
    - Test duplicate rejection, ineligible status rejection, accurate count after multiple upvotes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 6. Checkpoint — Ensure all unit and property tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement Session Join Handler
  - [x] 7.1 Implement `joinSession(joinCode, participantId?) → JoinResult | JoinError`
    - Validate join code; return 404 for invalid/expired codes
    - Assign anonymous UUID if `anonymousAllowed` and no `participantId` provided
    - Return existing `participantId` on re-join, preserving question and upvote associations
    - Return current visible questions in correct order as part of `JoinResult`
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [x] 7.2 Write property test for join code round-trip
    - **Property 13: Join code round-trip**
    - **Validates: Requirements 7.1, 7.2**

  - [x] 7.3 Write property test for anonymous participant identity assignment
    - **Property 14: Anonymous participant identity assignment**
    - **Validates: Requirements 7.3**

  - [x] 7.4 Write property test for re-join idempotence
    - **Property 15: Re-join idempotence**
    - **Validates: Requirements 7.4**

  - [x] 7.5 Write unit tests for Session Join Handler
    - Test valid join, invalid join code, anonymous ID assignment, re-join preserves data
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [x] 8. Implement REST API layer
  - [x] 8.1 Implement session endpoints: `POST /sessions`, `POST /sessions/:id/start`, `POST /sessions/:id/end`, `GET /sessions/:joinCode`
    - Wire to Session Manager and Session Join Handler
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 7.1, 7.2_

  - [x] 8.2 Implement question endpoints: `POST /sessions/:id/questions`, `GET /sessions/:id/questions`
    - Wire to Question Manager; enforce session-open guard
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 5.1, 5.4_

  - [x] 8.3 Implement moderation endpoints: `PATCH /questions/:id/approve`, `PATCH /questions/:id/reject`, `PATCH /questions/:id/pin`, `PATCH /questions/:id/answer`
    - Wire to Question Manager; return correct HTTP status codes per error handling table in design
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [x] 8.4 Implement upvote endpoint: `POST /questions/:id/upvote`
    - Wire to Upvote Manager; return 409 for duplicate, 422 for ineligible
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 8.5 Write unit tests for REST API layer
    - Test request validation, correct HTTP status codes for each error scenario
    - _Requirements: 2.1, 2.2, 3.5, 4.2, 4.5, 7.2_

- [x] 9. Implement Real-Time Broadcaster and WebSocket server
  - [x] 9.1 Implement `subscribe`, `unsubscribe`, and `broadcast` on Real-Time Broadcaster
    - Maintain per-session connection registry
    - On broadcast failure, retry once and log; send `session_state` on reconnect
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 9.2 Wire broadcaster into Question Manager and Upvote Manager
    - Emit `question_approved`, `question_pinned`, `question_answered` after moderation actions
    - Emit `upvote_updated` after a successful upvote
    - Emit `session_closed` when host ends session
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 9.3 Implement reconnection state delivery
    - On WebSocket reconnect, send `session_state` event with current visible questions in order
    - _Requirements: 6.4_

  - [x] 9.4 Write property test for reconnection delivers full state
    - **Property 12: Reconnection delivers full state**
    - **Validates: Requirements 6.4**

  - [x] 9.5 Write integration tests for real-time broadcast timing
    - Verify WebSocket push reaches all subscribers within 2 seconds for approve, upvote, pin, and answer events
    - Use a test WebSocket client
    - _Requirements: 6.1, 6.2, 6.3, 5.5_

  - [x] 9.6 Write integration test for reconnection state delivery
    - Simulate connection drop and restore; verify `session_state` contains all visible questions in correct order
    - _Requirements: 6.4_

- [x] 10. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use fast-check and must run a minimum of 100 iterations per the design
- Each property test must include a comment: `// Feature: question-pool-live-qna, Property N: <property_text>`
