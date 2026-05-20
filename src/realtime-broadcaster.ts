import { WebSocket } from "ws";
import { SessionEvent, Question } from "./types";

export interface BroadcastConnection {
  connectionId: string;
  sessionId: string;
  ws: WebSocket;
}

/**
 * Real-Time Broadcaster maintains a per-session registry of WebSocket connections
 * and fans out SessionEvents to all subscribers in a session room.
 *
 * On broadcast failure the message is retried once. Clients that miss events
 * receive the full current state via a `session_state` event on reconnect.
 */
export class RealTimeBroadcaster {
  // sessionId → Map<connectionId, WebSocket>
  private sessions: Map<string, Map<string, WebSocket>> = new Map();
  // connectionId → sessionId (reverse index for fast unsubscribe)
  private connectionIndex: Map<string, string> = new Map();

  /**
   * Register a WebSocket connection as a subscriber for a session room.
   */
  subscribe(sessionId: string, connectionId: string, ws: WebSocket): void {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, new Map());
    }
    this.sessions.get(sessionId)!.set(connectionId, ws);
    this.connectionIndex.set(connectionId, sessionId);
  }

  /**
   * Remove a connection from its session room.
   */
  unsubscribe(connectionId: string): void {
    const sessionId = this.connectionIndex.get(connectionId);
    if (sessionId === undefined) return;

    const room = this.sessions.get(sessionId);
    if (room) {
      room.delete(connectionId);
      if (room.size === 0) {
        this.sessions.delete(sessionId);
      }
    }
    this.connectionIndex.delete(connectionId);
  }

  /**
   * Broadcast a SessionEvent to all subscribers in a session room.
   * On send failure, retries once. Failures after retry are logged.
   */
  broadcast(sessionId: string, event: SessionEvent): void {
    const room = this.sessions.get(sessionId);
    if (!room || room.size === 0) return;

    const payload = JSON.stringify(event);
    console.log(`[${new Date().toISOString()}] WS  BROADCAST sessionId=${sessionId} type=${event.type} recipients=${room.size}`);

    for (const [connectionId, ws] of room.entries()) {
      this.sendWithRetry(connectionId, ws, payload);
    }
  }

  /**
   * Send a pre-serialised payload to a single connection, retrying once on failure.
   */
  private sendWithRetry(connectionId: string, ws: WebSocket, payload: string): void {
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`[RealTimeBroadcaster] Connection ${connectionId} is not open; skipping.`);
      return;
    }

    ws.send(payload, (err) => {
      if (!err) return;

      console.warn(
        `[RealTimeBroadcaster] First send failed for connection ${connectionId}: ${err.message}. Retrying…`
      );

      // Retry once
      if (ws.readyState !== WebSocket.OPEN) {
        console.error(
          `[RealTimeBroadcaster] Retry skipped for connection ${connectionId}: socket no longer open.`
        );
        return;
      }

      ws.send(payload, (retryErr) => {
        if (retryErr) {
          console.error(
            `[RealTimeBroadcaster] Retry also failed for connection ${connectionId}: ${retryErr.message}`
          );
        }
      });
    });
  }

  /**
   * Send the full current visible-question state to a single reconnecting connection.
   * Used by the WebSocket server after a client reconnects.
   */
  sendSessionState(connectionId: string, questions: Question[]): void {
    const sessionId = this.connectionIndex.get(connectionId);
    if (sessionId === undefined) {
      console.warn(`[RealTimeBroadcaster] sendSessionState: unknown connectionId ${connectionId}`);
      return;
    }

    const room = this.sessions.get(sessionId);
    const ws = room?.get(connectionId);
    if (!ws) {
      console.warn(`[RealTimeBroadcaster] sendSessionState: no socket for connectionId ${connectionId}`);
      return;
    }

    const event: SessionEvent = { type: "session_state", questions };
    this.sendWithRetry(connectionId, ws, JSON.stringify(event));
  }

  /** Returns the number of active connections in a session room (useful for tests). */
  getConnectionCount(sessionId: string): number {
    return this.sessions.get(sessionId)?.size ?? 0;
  }

  /** Returns all session IDs that currently have at least one subscriber. */
  getActiveSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }
}

export const realTimeBroadcaster = new RealTimeBroadcaster();
