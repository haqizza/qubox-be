# Requirements Document

## Introduction

A live Q&A question pool application that allows audience members to submit questions during a live session, and enables hosts/moderators to manage, curate, and display those questions in real time. The system supports upvoting questions, moderating content, and surfacing the most relevant questions to the presenter.

## Glossary

- **Question_Pool**: The collection of submitted questions for a given live session
- **Session**: A bounded live Q&A event with a defined start and end
- **Participant**: An audience member who can submit and upvote questions
- **Moderator**: A user with elevated privileges who can approve, reject, pin, or dismiss questions
- **Host**: The presenter or session owner who manages the session lifecycle
- **Question**: A text-based query submitted by a Participant during a Session
- **Upvote**: A signal from a Participant indicating interest in a Question
- **Pin**: A Moderator action that elevates a Question to the top of the visible pool
- **Status**: The current state of a Question — one of: `pending`, `approved`, `rejected`, `answered`, `pinned`

---

## Requirements

### Requirement 1: Session Management

**User Story:** As a Host, I want to create and control a live Q&A session, so that I can manage when questions are accepted and when the session ends.

#### Acceptance Criteria

1. THE Host SHALL be able to create a Session with a title and optional description.
2. WHEN a Host starts a Session, THE Question_Pool SHALL transition to an open state and begin accepting questions.
3. WHEN a Host ends a Session, THE Question_Pool SHALL transition to a closed state and stop accepting new questions.
4. THE Session SHALL be assigned a unique, shareable join code upon creation.
5. IF a Participant attempts to access a closed Session, THEN THE Participant SHALL see a screen indicating the session is ended.
5. IF a Participant attempts to submit a Question to a closed Session, THEN THE Question_Pool SHALL reject the submission and return an error message indicating the session is closed.

---

### Requirement 2: Question Submission

**User Story:** As a Participant, I want to submit a question to the live session, so that the Host can address it during the Q&A.

#### Acceptance Criteria

1. WHILE a Session is open, THE Participant SHALL be able to submit a Question containing between 1 and 300 characters.
2. IF a Participant submits a Question with 0 characters or more than 300 characters, THEN THE Question_Pool SHALL reject the submission and return a validation error.
3. THE Question_Pool SHALL assign each submitted Question a unique identifier and a timestamp upon receipt.
4. WHERE anonymous submission is enabled for a Session, THE Question_Pool SHALL accept Questions without requiring Participant authentication.
5. WHEN a Question is submitted, THE Question_Pool SHALL set its initial Status to `pending`.

---

### Requirement 3: Question Moderation

**User Story:** As a Moderator, I want to review and curate submitted questions, so that only relevant and appropriate questions are visible to the audience.

#### Acceptance Criteria

1. THE Moderator SHALL be able to approve a Question, transitioning its Status from `pending` to `approved`.
2. THE Moderator SHALL be able to reject a Question, transitioning its Status from `pending` to `rejected`.
3. THE Moderator SHALL be able to pin a Question, transitioning its Status to `pinned` regardless of its current Status.
4. THE Moderator SHALL be able to mark a Question as answered, transitioning its Status to `answered`.
5. IF a Moderator attempts to approve or reject a Question that is not in `pending` status, THEN THE Question_Pool SHALL reconfirm the attemps.
6. WHEN a Question's Status changes, THE Question_Pool SHALL record the Moderator's identifier and the timestamp of the change.

---

### Requirement 4: Upvoting

**User Story:** As a Participant, I want to upvote questions I find interesting, so that the most relevant questions rise to the top.

#### Acceptance Criteria

1. WHILE a Session is open, THE Participant SHALL be able to upvote an `approved` or `pinned` Question.
2. THE Question_Pool SHALL allow each Participant to upvote a given Question at most once per Session.
3. IF a Participant attempts to upvote a Question they have already upvoted, THEN THE Question_Pool SHALL reject the action and return an error.
4. THE Question_Pool SHALL maintain an accurate upvote count for each Question at all times.
5. IF a Participant attempts to upvote a `pending`, `rejected`, or `answered` Question, THEN THE Question_Pool SHALL reject the action and return an error indicating the Question is not eligible for upvoting.

---

### Requirement 5: Question Display and Ordering

**User Story:** As a Host, I want to see questions ordered by relevance and votes, so that I can address the most important questions first.

#### Acceptance Criteria

1. THE Question_Pool SHALL display `approved` and `pinned` Questions to Participants.
2. THE Question_Pool SHALL display all Questions (including `pending`, `rejected`, `approved`, `pinned`, and `answered`) to the Host and Moderator via a dedicated endpoint.
3. THE Question_Pool SHALL order Questions by placing `pinned` Questions first, followed by `approved` Questions sorted by upvote count in descending order.
4. WHEN two `approved` Questions have equal upvote counts, THE Question_Pool SHALL order them by submission timestamp in ascending order.
5. THE Question_Pool SHALL display only `approved` and `pinned` Questions to Participants.
6. WHEN a Question's Status or upvote count changes, THE Question_Pool SHALL update the displayed order within 2 seconds.

---

### Requirement 6: Real-Time Updates

**User Story:** As a Participant, I want to see new questions and vote counts update in real time, so that I can engage with the live session without refreshing.

#### Acceptance Criteria

1. WHEN a new Question is approved, THE Question_Pool SHALL push the update to all connected Participants within 2 seconds.
2. WHEN an upvote is recorded, THE Question_Pool SHALL push the updated vote count to all connected Participants within 2 seconds.
3. WHEN a Question is pinned or answered, THE Question_Pool SHALL push the status change to all connected Participants within 2 seconds.
4. IF a Participant's connection is interrupted and then restored, THEN THE Question_Pool SHALL deliver the current state of all visible Questions upon reconnection.

---

### Requirement 7: Session Join

**User Story:** As a Participant, I want to join a live session using a code, so that I can submit and view questions without needing an account.

#### Acceptance Criteria

1. WHEN a Participant provides a valid join code, THE Question_Pool SHALL grant the Participant access to the associated Session.
2. IF a Participant provides an invalid or expired join code, THEN THE Question_Pool SHALL reject the request and return an error message.
3. WHERE anonymous participation is enabled, THE Question_Pool SHALL assign a Participant a session-scoped anonymous identifier upon joining.
4. THE Question_Pool SHALL allow a Participant to re-join an active Session using the same join code without losing their previously submitted Questions or upvotes.
