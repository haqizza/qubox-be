import { Router, Request, Response } from "express";
import { sessionManager } from "../session-manager";
import { questionManager } from "../question-manager";
import { upvoteManager } from "../upvote-manager";
import { sessionJoinHandler } from "../session-join-handler";
import {
  NotFoundError,
  TransitionError,
  ValidationError,
  SessionClosedError,
  ReconfirmationRequired,
  DuplicateUpvoteError,
  UpvoteEligibilityError,
  JoinError,
} from "../types";

const router = Router();

// POST /sessions
router.post("/sessions", (req: Request, res: Response) => {
  const { title, description, anonymousAllowed, hostId } = req.body;
  const session = sessionManager.createSession(title, description, anonymousAllowed, hostId);
  res.status(201).json(session);
});

// POST /sessions/:id/start
router.post("/sessions/:id/start", (req: Request, res: Response) => {
  const { hostId } = req.body;
  try {
    const session = sessionManager.startSession(req.params.id, hostId);
    res.status(200).json(session);
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof TransitionError) return res.status(409).json({ error: err.message });
    throw err;
  }
});

// POST /sessions/:id/end
router.post("/sessions/:id/end", (req: Request, res: Response) => {
  const { hostId } = req.body;
  try {
    const session = sessionManager.endSession(req.params.id, hostId);
    res.status(200).json(session);
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    if (err instanceof TransitionError) return res.status(409).json({ error: err.message });
    throw err;
  }
});

// GET /sessions/:joinCode
router.get("/sessions/:joinCode", (req: Request, res: Response) => {
  try {
    const result = sessionJoinHandler.joinSession(
      req.params.joinCode,
      undefined,
      sessionManager,
      questionManager
    );
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof JoinError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

// POST /sessions/:id/questions
router.post("/sessions/:id/questions", (req: Request, res: Response) => {
  const { participantId, text } = req.body;
  try {
    const session = sessionManager.getSessionById(req.params.id);
    const question = questionManager.submitQuestion(req.params.id, participantId, text, session);
    res.status(201).json(question);
  } catch (err) {
    if (err instanceof ValidationError) return res.status(400).json({ error: err.message, field: err.field });
    if (err instanceof SessionClosedError) return res.status(409).json({ error: err.message });
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

// GET /sessions/:id/questions
// Public view — returns only approved/pinned questions
router.get("/sessions/:id/questions", (req: Request, res: Response) => {
  try {
    const session = sessionManager.resolveSession(req.params.id);
    const questions = questionManager.getVisibleQuestions(session.id);
    res.status(200).json(questions);
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

// GET /sessions/:id/questions/all
// Host/moderator view — returns all questions including pending and rejected
router.get("/sessions/:id/questions/all", (req: Request, res: Response) => {
  try {
    const session = sessionManager.resolveSession(req.params.id);
    const questions = questionManager.getAllQuestions(session.id);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json(questions);
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

// PATCH /questions/:id/approve
router.patch("/questions/:id/approve", (req: Request, res: Response) => {
  const { moderatorId } = req.body;
  try {
    const question = questionManager.approveQuestion(req.params.id, moderatorId);
    res.status(200).json(question);
  } catch (err) {
    if (err instanceof ReconfirmationRequired) return res.status(409).json({ error: err.message, currentStatus: err.currentStatus });
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

// PATCH /questions/:id/reject
router.patch("/questions/:id/reject", (req: Request, res: Response) => {
  const { moderatorId } = req.body;
  try {
    const question = questionManager.rejectQuestion(req.params.id, moderatorId);
    res.status(200).json(question);
  } catch (err) {
    if (err instanceof ReconfirmationRequired) return res.status(409).json({ error: err.message, currentStatus: err.currentStatus });
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

// PATCH /questions/:id/pin
router.patch("/questions/:id/pin", (req: Request, res: Response) => {
  const { moderatorId } = req.body;
  try {
    const question = questionManager.pinQuestion(req.params.id, moderatorId);
    res.status(200).json(question);
  } catch (err) {
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

// PATCH /questions/:id/unpin
router.patch("/questions/:id/unpin", (req: Request, res: Response) => {
  const { moderatorId } = req.body;
  try {
    const question = questionManager.unpinQuestion(req.params.id, moderatorId);
    res.status(200).json(question);
  } catch (err) {
    if (err instanceof TransitionError) return res.status(409).json({ error: err.message });
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

// PATCH /questions/:id/answer
router.patch("/questions/:id/answer", (req: Request, res: Response) => {
  const { moderatorId } = req.body;
  try {
    const question = questionManager.markAnswered(req.params.id, moderatorId);
    res.status(200).json(question);
  } catch (err) {
    if (err instanceof TransitionError) return res.status(409).json({ error: err.message });
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

// POST /questions/:id/upvote
router.post("/questions/:id/upvote", (req: Request, res: Response) => {
  const { participantId, sessionId } = req.body;
  try {
    const question = questionManager.getQuestionById(req.params.id);
    const session = sessionManager.getSessionById(sessionId);
    const upvote = upvoteManager.upvote(question, participantId, session);
    res.status(201).json(upvote);
  } catch (err) {
    if (err instanceof DuplicateUpvoteError) return res.status(409).json({ error: err.message });
    if (err instanceof UpvoteEligibilityError) return res.status(422).json({ error: err.message });
    if (err instanceof NotFoundError) return res.status(404).json({ error: err.message });
    throw err;
  }
});

export default router;
