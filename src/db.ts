import Database, { Database as DatabaseType } from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data.db");

const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    joinCode TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    hostId TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'created',
    anonymousAllowed INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    startedAt TEXT,
    endedAt TEXT
  );

  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    sessionId TEXT NOT NULL,
    participantId TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    upvoteCount INTEGER NOT NULL DEFAULT 0,
    submittedAt TEXT NOT NULL,
    lastModifiedAt TEXT NOT NULL,
    lastModifiedBy TEXT,
    FOREIGN KEY (sessionId) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS upvotes (
    questionId TEXT NOT NULL,
    participantId TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    PRIMARY KEY (questionId, participantId),
    FOREIGN KEY (questionId) REFERENCES questions(id)
  );

  CREATE TABLE IF NOT EXISTS moderation_events (
    id TEXT PRIMARY KEY,
    questionId TEXT NOT NULL,
    moderatorId TEXT NOT NULL,
    fromStatus TEXT NOT NULL,
    toStatus TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (questionId) REFERENCES questions(id)
  );
`);

export default db;
