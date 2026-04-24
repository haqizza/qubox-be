# QuBox BE

A real-time live Q&A question pool platform. Hosts create sessions, participants join and submit questions, moderators curate the pool, and everyone receives live updates over WebSocket.

> **Note:** All data is stored in-memory. Nothing persists across server restarts.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install dependencies

```bash
npm install
```

### Build

```bash
npm run build
```

### Start

```bash
npm start
```

The server listens on port `3000` by default. Override with the `PORT` environment variable:

```bash
PORT=8080 npm start
```

### Run tests

```bash
npm test                  # all tests
npm run test:unit         # unit tests only
npm run test:property     # property-based tests only
npm run test:integration  # integration tests only
```

---

## REST API

Base URL: `http://localhost:3000`

All request and response bodies are JSON.

### Sessions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sessions` | Create a new session |
| `POST` | `/sessions/:id/start` | Start a session (`created` → `open`) |
| `POST` | `/sessions/:id/end` | End a session (`open` → `closed`) |
| `GET` | `/sessions/:joinCode` | Join a session by join code |

#### POST /sessions

```json
{
  "title": "AMA: Product Roadmap Q3",
  "description": "Ask us anything.",
  "anonymousAllowed": true,
  "hostId": "host-uuid-001"
}
```

#### POST /sessions/:id/start / /end

```json
{ "hostId": "host-uuid-001" }
```

#### GET /sessions/:joinCode

Returns the session, a `participantId` (store this client-side), and the current visible questions.

---

### Questions

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/sessions/:id/questions` | Submit a question to an open session |
| `GET` | `/sessions/:id/questions` | Get visible (approved + pinned) questions |

#### POST /sessions/:id/questions

```json
{
  "participantId": "anon-uuid-abc123",
  "text": "What is the biggest challenge this quarter?"
}
```

Text must be 1–300 characters. Questions start in `pending` status.

---

### Moderation

| Method | Path | Description |
|--------|------|-------------|
| `PATCH` | `/questions/:id/approve` | Approve a pending question |
| `PATCH` | `/questions/:id/reject` | Reject a pending question |
| `PATCH` | `/questions/:id/pin` | Pin a question (appears at top) |
| `PATCH` | `/questions/:id/answer` | Mark a question as answered |

All moderation endpoints accept:

```json
{ "moderatorId": "mod-uuid-001" }
```

Approve and reject return `409` with `currentStatus` if the question is not in `pending` state — re-send to confirm.

---

### Upvotes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/questions/:id/upvote` | Upvote a question |

```json
{
  "participantId": "anon-uuid-abc123",
  "sessionId": "session-uuid-001"
}
```

Only `approved` and `pinned` questions in an open session are eligible. Each participant may upvote a question once.

---

## WebSocket Events

Connect to the same host/port as the HTTP server. All events are JSON.

| Event | Trigger |
|-------|---------|
| `question_approved` | A question is approved |
| `question_pinned` | A question is pinned |
| `question_answered` | A question is marked answered |
| `upvote_updated` | An upvote is recorded (includes new count) |
| `session_closed` | The host ends the session |
| `session_state` | Sent to a client on reconnection (full question list) |

---

## Question Status Flow

```
pending → approved → pinned
       ↘ rejected   ↓
                  answered
```

Pinning can happen from any status. Answering requires `approved` or `pinned`.

---

## Project Structure

```
├── src/
│   ├── api/
│   │   ├── app.ts               # Express app + HTTP server factory
│   │   └── router.ts            # REST route handlers
│   ├── index.ts                 # Entry point
│   ├── session-manager.ts       # Session lifecycle
│   ├── question-manager.ts      # Question submission and moderation
│   ├── upvote-manager.ts        # Upvote tracking and deduplication
│   ├── session-join-handler.ts  # Join logic and participant ID assignment
│   ├── order-engine.ts          # Question ordering (pinned first, then by upvotes)
│   ├── realtime-broadcaster.ts  # WebSocket event broadcasting
│   ├── websocket-server.ts      # WebSocket server setup
│   └── types.ts                 # Shared domain types and error classes
├── tests/
│   ├── unit/                    # Unit tests per module
│   ├── property/                # Property-based tests (fast-check)
│   └── integration/             # Integration tests
├── api-contract.json            # OpenAPI 3.1 spec
├── package.json
└── tsconfig.json
```
