import request from "supertest";
import express from "express";
import router from "../../src/api/router";
import { SessionManager } from "../../src/session-manager";
import { QuestionManager } from "../../src/question-manager";
import { UpvoteManager } from "../../src/upvote-manager";
import { SessionJoinHandler } from "../../src/session-join-handler";

// Each test suite gets a fresh app with isolated manager instances
function buildApp() {
  const sessionMgr = new SessionManager();
  const questionMgr = new QuestionManager();
  const upvoteMgr = new UpvoteManager();
  const joinHandler = new SessionJoinHandler();

  const app = express();
  app.use(express.json());

  // Session endpoints
  app.post("/sessions", (req, res) => {
    const { title, description, anonymousAllowed, hostId } = req.body;
    const session = sessionMgr.createSession(title, description, anonymousAllowed, hostId);
    res.status(201).json(session);
  });

  app.post("/sessions/:id/start", (req, res) => {
    const { hostId } = req.body;
    try {
      const session = sessionMgr.startSession(req.params.id, hostId);
      res.status(200).json(session);
    } catch (err: any) {
      if (err.name === "NotFoundError") return res.status(404).json({ error: err.message });
      if (err.name === "TransitionError") return res.status(409).json({ error: err.message });
      throw err;
    }
  });

  app.post("/sessions/:id/end", (req, res) => {
    const { hostId } = req.body;
    try {
      const session = sessionMgr.endSession(req.params.id, hostId);
      res.status(200).json(session);
    } catch (err: any) {
      if (err.name === "NotFoundError") return res.status(404).json({ error: err.message });
      if (err.name === "TransitionError") return res.status(409).json({ error: err.message });
      throw err;
    }
  });

  app.get("/sessions/:joinCode", (req, res) => {
    try {
      const result = joinHandler.joinSession(req.params.joinCode, undefined, sessionMgr, questionMgr);
      res.status(200).json(result);
    } catch (err: any) {
      if (err.name === "JoinError") return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  app.post("/sessions/:id/questions", (req, res) => {
    const { participantId, text } = req.body;
    try {
      const session = sessionMgr.getSessionById(req.params.id);
      const question = questionMgr.submitQuestion(req.params.id, participantId, text, session);
      res.status(201).json(question);
    } catch (err: any) {
      if (err.name === "ValidationError") return res.status(400).json({ error: err.message, field: err.field });
      if (err.name === "SessionClosedError") return res.status(409).json({ error: err.message });
      if (err.name === "NotFoundError") return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  app.get("/sessions/:id/questions", (req, res) => {
    res.status(200).json(questionMgr.getVisibleQuestions(req.params.id));
  });

  app.patch("/questions/:id/approve", (req, res) => {
    const { moderatorId } = req.body;
    try {
      const question = questionMgr.approveQuestion(req.params.id, moderatorId);
      res.status(200).json(question);
    } catch (err: any) {
      if (err.name === "ReconfirmationRequired") return res.status(409).json({ error: err.message, currentStatus: err.currentStatus });
      if (err.name === "NotFoundError") return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  app.patch("/questions/:id/reject", (req, res) => {
    const { moderatorId } = req.body;
    try {
      const question = questionMgr.rejectQuestion(req.params.id, moderatorId);
      res.status(200).json(question);
    } catch (err: any) {
      if (err.name === "ReconfirmationRequired") return res.status(409).json({ error: err.message, currentStatus: err.currentStatus });
      if (err.name === "NotFoundError") return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  app.patch("/questions/:id/pin", (req, res) => {
    const { moderatorId } = req.body;
    try {
      const question = questionMgr.pinQuestion(req.params.id, moderatorId);
      res.status(200).json(question);
    } catch (err: any) {
      if (err.name === "NotFoundError") return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  app.patch("/questions/:id/answer", (req, res) => {
    const { moderatorId } = req.body;
    try {
      const question = questionMgr.markAnswered(req.params.id, moderatorId);
      res.status(200).json(question);
    } catch (err: any) {
      if (err.name === "TransitionError") return res.status(409).json({ error: err.message });
      if (err.name === "NotFoundError") return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  app.post("/questions/:id/upvote", (req, res) => {
    const { participantId, sessionId } = req.body;
    try {
      const question = questionMgr.getQuestionById(req.params.id);
      const session = sessionMgr.getSessionById(sessionId);
      const upvote = upvoteMgr.upvote(question, participantId, session);
      res.status(201).json(upvote);
    } catch (err: any) {
      if (err.name === "DuplicateUpvoteError") return res.status(409).json({ error: err.message });
      if (err.name === "UpvoteEligibilityError") return res.status(422).json({ error: err.message });
      if (err.name === "NotFoundError") return res.status(404).json({ error: err.message });
      throw err;
    }
  });

  return { app, sessionMgr, questionMgr, upvoteMgr };
}

describe("REST API", () => {
  describe("POST /sessions", () => {
    it("returns 201 with created session", async () => {
      const { app } = buildApp();
      const res = await request(app)
        .post("/sessions")
        .send({ title: "My Session", anonymousAllowed: true });
      expect(res.status).toBe(201);
      expect(res.body.title).toBe("My Session");
      expect(res.body.status).toBe("created");
      expect(res.body.joinCode).toBeTruthy();
    });
  });

  describe("POST /sessions/:id/start", () => {
    it("returns 200 with open session", async () => {
      const { app, sessionMgr } = buildApp();
      const session = sessionMgr.createSession("Test", undefined, true, "host1");
      const res = await request(app)
        .post(`/sessions/${session.id}/start`)
        .send({ hostId: "host1" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("open");
    });

    it("returns 409 on invalid transition (already open)", async () => {
      const { app, sessionMgr } = buildApp();
      const session = sessionMgr.createSession("Test", undefined, true, "host1");
      sessionMgr.startSession(session.id, "host1");
      const res = await request(app)
        .post(`/sessions/${session.id}/start`)
        .send({ hostId: "host1" });
      expect(res.status).toBe(409);
    });

    it("returns 404 for unknown session", async () => {
      const { app } = buildApp();
      const res = await request(app)
        .post("/sessions/nonexistent-id/start")
        .send({ hostId: "host1" });
      expect(res.status).toBe(404);
    });
  });

  describe("GET /sessions/:joinCode", () => {
    it("returns 200 with JoinResult for valid join code", async () => {
      const { app, sessionMgr } = buildApp();
      const session = sessionMgr.createSession("Test", undefined, true);
      const res = await request(app).get(`/sessions/${session.joinCode}`);
      expect(res.status).toBe(200);
      expect(res.body.session.id).toBe(session.id);
      expect(res.body.participantId).toBeTruthy();
    });

    it("returns 404 for invalid join code", async () => {
      const { app } = buildApp();
      const res = await request(app).get("/sessions/INVALID");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /sessions/:id/questions", () => {
    it("returns 201 with submitted question", async () => {
      const { app, sessionMgr } = buildApp();
      const session = sessionMgr.createSession("Test", undefined, true, "host1");
      sessionMgr.startSession(session.id, "host1");
      const res = await request(app)
        .post(`/sessions/${session.id}/questions`)
        .send({ participantId: "p1", text: "What is the plan?" });
      expect(res.status).toBe(201);
      expect(res.body.text).toBe("What is the plan?");
      expect(res.body.status).toBe("pending");
    });

    it("returns 400 for empty text", async () => {
      const { app, sessionMgr } = buildApp();
      const session = sessionMgr.createSession("Test", undefined, true, "host1");
      sessionMgr.startSession(session.id, "host1");
      const res = await request(app)
        .post(`/sessions/${session.id}/questions`)
        .send({ participantId: "p1", text: "" });
      expect(res.status).toBe(400);
    });

    it("returns 409 for closed session", async () => {
      const { app, sessionMgr } = buildApp();
      const session = sessionMgr.createSession("Test", undefined, true, "host1");
      sessionMgr.startSession(session.id, "host1");
      sessionMgr.endSession(session.id, "host1");
      const res = await request(app)
        .post(`/sessions/${session.id}/questions`)
        .send({ participantId: "p1", text: "A question?" });
      expect(res.status).toBe(409);
    });
  });

  describe("PATCH /questions/:id/approve", () => {
    it("returns 200 with approved question", async () => {
      const { app, sessionMgr, questionMgr } = buildApp();
      const session = sessionMgr.createSession("Test", undefined, true, "host1");
      sessionMgr.startSession(session.id, "host1");
      const question = questionMgr.submitQuestion(session.id, "p1", "A question?", sessionMgr.getSessionById(session.id));
      const res = await request(app)
        .patch(`/questions/${question.id}/approve`)
        .send({ moderatorId: "mod1" });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("approved");
    });

    it("returns 409 when question is not pending", async () => {
      const { app, sessionMgr, questionMgr } = buildApp();
      const session = sessionMgr.createSession("Test", undefined, true, "host1");
      sessionMgr.startSession(session.id, "host1");
      const question = questionMgr.submitQuestion(session.id, "p1", "A question?", sessionMgr.getSessionById(session.id));
      questionMgr.approveQuestion(question.id, "mod1"); // already approved
      const res = await request(app)
        .patch(`/questions/${question.id}/approve`)
        .send({ moderatorId: "mod1" });
      expect(res.status).toBe(409);
    });
  });

  describe("POST /questions/:id/upvote", () => {
    it("returns 201 with upvote", async () => {
      const { app, sessionMgr, questionMgr } = buildApp();
      const session = sessionMgr.createSession("Test", undefined, true, "host1");
      sessionMgr.startSession(session.id, "host1");
      const question = questionMgr.submitQuestion(session.id, "p1", "A question?", sessionMgr.getSessionById(session.id));
      questionMgr.approveQuestion(question.id, "mod1");
      const res = await request(app)
        .post(`/questions/${question.id}/upvote`)
        .send({ participantId: "p2", sessionId: session.id });
      expect(res.status).toBe(201);
      expect(res.body.questionId).toBe(question.id);
    });

    it("returns 409 for duplicate upvote", async () => {
      const { app, sessionMgr, questionMgr, upvoteMgr } = buildApp();
      const session = sessionMgr.createSession("Test", undefined, true, "host1");
      sessionMgr.startSession(session.id, "host1");
      const question = questionMgr.submitQuestion(session.id, "p1", "A question?", sessionMgr.getSessionById(session.id));
      questionMgr.approveQuestion(question.id, "mod1");
      upvoteMgr.upvote(question, "p2", sessionMgr.getSessionById(session.id));
      const res = await request(app)
        .post(`/questions/${question.id}/upvote`)
        .send({ participantId: "p2", sessionId: session.id });
      expect(res.status).toBe(409);
    });

    it("returns 422 for ineligible question (pending status)", async () => {
      const { app, sessionMgr, questionMgr } = buildApp();
      const session = sessionMgr.createSession("Test", undefined, true, "host1");
      sessionMgr.startSession(session.id, "host1");
      const question = questionMgr.submitQuestion(session.id, "p1", "A question?", sessionMgr.getSessionById(session.id));
      // question is still pending — not eligible for upvote
      const res = await request(app)
        .post(`/questions/${question.id}/upvote`)
        .send({ participantId: "p2", sessionId: session.id });
      expect(res.status).toBe(422);
    });
  });
});

// ─── Additional tests for requirements 2.1, 2.2, 3.5, 4.2, 4.5, 7.2 ───────

describe("REST API — question length boundary validation (Req 2.1, 2.2)", () => {
  function setupOpenSession() {
    const { app, sessionMgr, questionMgr, upvoteMgr } = buildApp();
    const session = sessionMgr.createSession("Test", undefined, true, "host1");
    sessionMgr.startSession(session.id, "host1");
    return { app, sessionMgr, questionMgr, upvoteMgr, session };
  }

  it("returns 201 for text of exactly 1 character (min valid)", async () => {
    const { app, session } = setupOpenSession();
    const res = await request(app)
      .post(`/sessions/${session.id}/questions`)
      .send({ participantId: "p1", text: "A" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
  });

  it("returns 201 for text of exactly 300 characters (max valid)", async () => {
    const { app, session } = setupOpenSession();
    const text = "x".repeat(300);
    const res = await request(app)
      .post(`/sessions/${session.id}/questions`)
      .send({ participantId: "p1", text });
    expect(res.status).toBe(201);
    expect(res.body.text).toHaveLength(300);
  });

  it("returns 400 for text of exactly 301 characters (just over limit)", async () => {
    const { app, session } = setupOpenSession();
    const text = "x".repeat(301);
    const res = await request(app)
      .post(`/sessions/${session.id}/questions`)
      .send({ participantId: "p1", text });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("text");
  });
});

describe("REST API — moderation reconfirmation and transitions (Req 3.5)", () => {
  function setupWithQuestion() {
    const { app, sessionMgr, questionMgr, upvoteMgr } = buildApp();
    const session = sessionMgr.createSession("Test", undefined, true, "host1");
    sessionMgr.startSession(session.id, "host1");
    const question = questionMgr.submitQuestion(
      session.id, "p1", "A question?", sessionMgr.getSessionById(session.id)
    );
    return { app, sessionMgr, questionMgr, upvoteMgr, session, question };
  }

  it("PATCH /questions/:id/reject returns 409 with currentStatus when question is not pending", async () => {
    const { app, questionMgr, question } = setupWithQuestion();
    // Approve first so it's no longer pending
    questionMgr.approveQuestion(question.id, "mod1");
    const res = await request(app)
      .patch(`/questions/${question.id}/reject`)
      .send({ moderatorId: "mod1" });
    expect(res.status).toBe(409);
    expect(res.body.currentStatus).toBe("approved");
  });

  it("PATCH /questions/:id/pin returns 200 regardless of current status (approved)", async () => {
    const { app, questionMgr, question } = setupWithQuestion();
    questionMgr.approveQuestion(question.id, "mod1");
    const res = await request(app)
      .patch(`/questions/${question.id}/pin`)
      .send({ moderatorId: "mod1" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pinned");
  });

  it("PATCH /questions/:id/pin returns 200 regardless of current status (rejected)", async () => {
    const { app, questionMgr, question } = setupWithQuestion();
    questionMgr.rejectQuestion(question.id, "mod1");
    const res = await request(app)
      .patch(`/questions/${question.id}/pin`)
      .send({ moderatorId: "mod1" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pinned");
  });

  it("PATCH /questions/:id/answer returns 200 for approved question", async () => {
    const { app, questionMgr, question } = setupWithQuestion();
    questionMgr.approveQuestion(question.id, "mod1");
    const res = await request(app)
      .patch(`/questions/${question.id}/answer`)
      .send({ moderatorId: "mod1" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("answered");
  });

  it("PATCH /questions/:id/answer returns 409 (TransitionError) for pending question", async () => {
    const { app, question } = setupWithQuestion();
    // question is still pending — markAnswered should throw TransitionError
    const res = await request(app)
      .patch(`/questions/${question.id}/answer`)
      .send({ moderatorId: "mod1" });
    expect(res.status).toBe(409);
  });
});

describe("REST API — upvote eligibility (Req 4.5)", () => {
  function setupOpenSession() {
    const { app, sessionMgr, questionMgr, upvoteMgr } = buildApp();
    const session = sessionMgr.createSession("Test", undefined, true, "host1");
    sessionMgr.startSession(session.id, "host1");
    return { app, sessionMgr, questionMgr, upvoteMgr, session };
  }

  it("returns 422 when upvoting a rejected question", async () => {
    const { app, sessionMgr, questionMgr, session } = setupOpenSession();
    const question = questionMgr.submitQuestion(
      session.id, "p1", "A question?", sessionMgr.getSessionById(session.id)
    );
    questionMgr.rejectQuestion(question.id, "mod1");
    const res = await request(app)
      .post(`/questions/${question.id}/upvote`)
      .send({ participantId: "p2", sessionId: session.id });
    expect(res.status).toBe(422);
  });

  it("returns 422 when upvoting an answered question", async () => {
    const { app, sessionMgr, questionMgr, session } = setupOpenSession();
    const question = questionMgr.submitQuestion(
      session.id, "p1", "A question?", sessionMgr.getSessionById(session.id)
    );
    questionMgr.approveQuestion(question.id, "mod1");
    questionMgr.markAnswered(question.id, "mod1");
    const res = await request(app)
      .post(`/questions/${question.id}/upvote`)
      .send({ participantId: "p2", sessionId: session.id });
    expect(res.status).toBe(422);
  });
});

describe("REST API — session end endpoint", () => {
  it("POST /sessions/:id/end returns 200 with closed session", async () => {
    const { app, sessionMgr } = buildApp();
    const session = sessionMgr.createSession("Test", undefined, true, "host1");
    sessionMgr.startSession(session.id, "host1");
    const res = await request(app)
      .post(`/sessions/${session.id}/end`)
      .send({ hostId: "host1" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("closed");
  });

  it("POST /sessions/:id/end returns 409 on invalid transition (already closed)", async () => {
    const { app, sessionMgr } = buildApp();
    const session = sessionMgr.createSession("Test", undefined, true, "host1");
    sessionMgr.startSession(session.id, "host1");
    sessionMgr.endSession(session.id, "host1");
    const res = await request(app)
      .post(`/sessions/${session.id}/end`)
      .send({ hostId: "host1" });
    expect(res.status).toBe(409);
  });
});
