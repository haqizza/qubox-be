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
  app.set("etag", false);
  app.use(express.json());

  // Log every incoming request
  app.use((req, res, next) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
    });
    next();
  });

  app.use("/", router);

  // Log errors and forward them
  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[${new Date().toISOString()}] ERROR ${req.method} ${req.originalUrl} → ${message}`);
    next(err);
  });

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
