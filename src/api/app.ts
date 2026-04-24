import express from "express";
import { createServer } from "http";
import router from "./router";
import { realTimeBroadcaster } from "../realtime-broadcaster";
import { sessionManager } from "../session-manager";
import { questionManager } from "../question-manager";
import { upvoteManager } from "../upvote-manager";
import { attachWebSocketServer } from "../websocket-server";

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  return app;
}

/**
 * Creates an HTTP server with the Express app and attaches the WebSocket server.
 * Also wires the broadcaster into the core managers so real-time events are emitted.
 */
export function createServer_() {
  // Wire broadcaster into managers
  sessionManager.setBroadcaster(realTimeBroadcaster);
  questionManager.setBroadcaster(realTimeBroadcaster);
  upvoteManager.setBroadcaster(realTimeBroadcaster);

  const app = createApp();
  const httpServer = createServer(app);
  attachWebSocketServer(httpServer, realTimeBroadcaster, sessionManager, questionManager);
  return httpServer;
}
