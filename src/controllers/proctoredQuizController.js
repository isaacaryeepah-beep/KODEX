const mongoose = require("mongoose");
const crypto = require("crypto");
const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const Attempt = require("../models/Attempt");
const Answer = require("../models/Answer");
const Course = require("../models/Course");
const QuizSession = require("../models/QuizSession");
const Snapshot = require("../models/Snapshot");
const ProctorLog = require("../models/ProctorLog");
const DeviceLock = require("../models/DeviceLock");

// ─── Helpers ───────────────────────────────────────────────────────────────

function detectPlatform(userAgent = "") {
  const ua = userAgent.toLowerCase();
  if (/ipad|android(?!.*mobile)|tablet/i.test(ua)) return "tablet";
  if (/iphone|android.*mobile|mobile/i.test(ua)) return "mobile";
  if (/windows|macintosh|linux/i.test(ua)) return "desktop";
  return "unknown";
}

function detectOS(userAgent = "") {
  if (/iphone|ipad/i.test(userAgent)) return "iOS";
  if (/android/i.test(userAgent)) return "Android";
  if (/windows/i.test(userAgent)) return "Windows";
  if (/macintosh/i.test(userAgent)) return "macOS";
  if (/linux/i.test(userAgent)) return "Linux";
  return "Unknown";
}

function detectBrowser(userAgent = "") {
  if (/chrome/i.test(userAgent) && !/edge|edg/i.test(userAgent)) return "Chrome";
  if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) return "Safari";
  if (/firefox/i.test(userAgent)) return "Firefox";
  if (/edge|edg/i.test(userAgent)) return "Edge";
  return "Unknown";
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

/** Recalculate integrity score from violation count & level */
function computeIntegrity(totalViolations, warningsIssued) {
  let score = 100;
  score -= Math.min(totalViolations * 3, 40);
  score -= Math.min(warningsIssued * 10, 30);
  return Math.max(0, score);
}

/** Classify event severity */
function classifyEvent(eventType) {
  const critical = ["multiple_faces", "camera_disabled", "identity_mismatch", "session_conflict", "phone_detected", "head_turn"];
  const warning = [
    "tab_switch",        // kept for legacy
    "app_background",    // sent by frontend when tab is hidden
    "app_foreground",    // sent on return — duration checked separately
    "face_missing",
    "face_off_center",   // was missing — now logged as warning
    "rapid_switching",
    "copy_attempt",
    "screenshot_attempt",
    "orientation_change",
  ];
  if (critical.includes(eventType)) return { severity: "critical", violationLevel: 3 };
  if (warning.includes(eventType)) return { severity: "warning", violationLevel: 2 };
  return { severity: "info", violationLevel: 0 };
}

// ─── 1. Start Proctored Session ────────────────────────────────────────────

exports.startProctoredSession = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { deviceFingerprint, consentGiven, platform: clientPlatform } = req.body;

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }
    if (!consentGiven) {
      return res.status(400).json({ error: "Consent is required to proceed" });
    }
    if (!deviceFingerprint) {
      return res.status(400).json({ error: "Device fingerprint is required" });
    }

    // Verify quiz access
    const quiz = await Quiz.findOne({
      _id: quizId,
      company: req.user.company,
      isActive: true,
    }).populate("course", "enrolledStudents title code");

    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const isEnrolled = quiz.course?.enrolledStudents?.some(
      (s) => s.toString() === req.user._id.toString()
    );
    if (!isEnrolled) return res.status(403).json({ error: "Not enrolled in this course" });

    const now = new Date();
    if (now < quiz.startTime) return res.status(400).json({ error: "Quiz has not started yet" });
    if (now > quiz.endTime) return res.status(400).json({ error: "Quiz window has closed" });

    // Check for existing submitted attempt
    const existingAttempt = await Attempt.findOne({
      quiz: quizId,
      student: req.user._id,
      isSubmitted: true,
    });
    if (existingAttempt) {
      return res.status(409).json({ error: "You have already submitted this quiz" });
    }

    // ── Device Lock: block if another device already active ──────────────
    const activeLock = await DeviceLock.findOne({
      student: req.user._id,
      quiz: quizId,
      isActive: true,
    });

    if (activeLock && activeLock.deviceFingerprint !== deviceFingerprint) {
      return res.status(409).json({
        error: "This quiz is already active on another device. Please finish on that device first.",
        code: "DEVICE_CONFLICT",
      });
    }

    // If same device, allow re-entry (reload scenario)
    if (activeLock && activeLock.deviceFingerprint === deviceFingerprint) {
      // Fetch the existing session
      const existingSession = await QuizSession.findById(activeLock.session);
      if (existingSession && existingSession.status === "active") {
        existingSession.lastHeartbeat = now;
        await existingSession.save();

        // Get questions and attempt
        const attempt = await Attempt.findOne({ quiz: quizId, student: req.user._id });
        let questions = await Question.find({ quiz: quizId })
          .select("-correctAnswer")
          .sort({ createdAt: 1 });
        questions = shuffleArray(questions.map((q) => q.toObject()));

        return res.json({
          reconnected: true,
          session: {
            _id: existingSession._id,
            sessionToken: existingSession.sessionToken,
            platform: existingSession.platform,
            status: existingSession.status,
          },
          attempt,
          questions,
          timeLimit: quiz.timeLimit,
          quizTitle: quiz.title,
          courseName: quiz.course?.title,
        });
      }
    }

    // ── Create Attempt ────────────────────────────────────────────────────
    let attempt = await Attempt.findOne({ quiz: quizId, student: req.user._id });
    if (!attempt) {
      attempt = await Attempt.create({
        quiz: quizId,
        student: req.user._id,
        company: req.user.company,
        startedAt: now,
        maxScore: quiz.totalMarks,
      });
    }

    // ── Build Session ─────────────────────────────────────────────────────
    const ua = req.headers["user-agent"] || "";
    const sessionToken = generateSessionToken();

    const session = await QuizSession.create({
      quiz: quizId,
      student: req.user._id,
      attempt: attempt._id,
      company: req.user.company,
      sessionToken,
      deviceFingerprint,
      ipAddress: req.ip,
      userAgent: ua,
      platform: clientPlatform || detectPlatform(ua),
      os: detectOS(ua),
      browser: detectBrowser(ua),
      consentGiven: true,
      consentTimestamp: now,
      status: "active",
    });

    // ── Device Lock ────────────────────────────────────────────────────────
    // Release any old locks for this student+quiz (should be none, but clean up)
    await DeviceLock.updateMany(
      { student: req.user._id, quiz: quizId, isActive: true },
      { isActive: false, releasedAt: now, releaseReason: "manual" }
    );

    await DeviceLock.create({
      student: req.user._id,
      quiz: quizId,
      company: req.user.company,
      session: session._id,
      sessionToken,
      deviceFingerprint,
      ipAddress: req.ip,
      platform: session.platform,
      isActive: true,
    });

    // ── Log start event ────────────────────────────────────────────────────
    await ProctorLog.create({
      session: session._id,
      student: req.user._id,
      quiz: quizId,
      company: req.user.company,
      eventType: "exam_started",
      severity: "info",
      violationLevel: 0,
      metadata: { platform: session.platform, os: session.os, browser: session.browser },
    });

    // ── Shuffle questions ──────────────────────────────────────────────────
    let questions = await Question.find({ quiz: quizId })
      .select("-correctAnswer")
      .sort({ createdAt: 1 });
    // Shuffle question ORDER only. Options are NOT shuffled server-side to preserve
    // correctAnswer index integrity during grading.
    questions = shuffleArray(questions.map((q) => q.toObject()));

    res.json({
      session: {
        _id: session._id,
        sessionToken,
        platform: session.platform,
        status: "active",
      },
      attempt,
      questions,
      timeLimit: quiz.timeLimit,
      quizTitle: quiz.title,
      courseName: quiz.course?.title,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Quiz already active. Reload to reconnect." });
    }
    console.error("startProctoredSession error:", error);
    res.status(500).json({ error: "Failed to start proctored session" });
  }
};

// ─── 2. Heartbeat / Log Event ──────────────────────────────────────────────

exports.logEvent = async (req, res) => {
  try {
    const { sessionToken, eventType, duration, metadata } = req.body;

    if (!sessionToken || !eventType) {
      return res.status(400).json({ error: "sessionToken and eventType required" });
    }

    const session = await QuizSession.findOne({ sessionToken, student: req.user._id });
    if (!session) return res.status(404).json({ error: "Session not found" });
    if (session.status !== "active") {
      return res.status(409).json({
        error: "Session is no longer active",
        status: session.status,
        terminationReason: session.terminationReason,
      });
    }

    session.lastHeartbeat = new Date();

    const { severity, violationLevel } = classifyEvent(eventType);
    let action = "logged"; // logged | warned | terminated

    // ── Violation enforcement ──────────────────────────────────────────────

    // Background too long — terminate immediately regardless of violation level
    const backgroundTooLong =
      (eventType === "app_foreground") && duration && duration > 10;

    if (backgroundTooLong) {
      session.totalViolations += 1;
      session.integrityScore = computeIntegrity(session.totalViolations, session.warningsIssued);
      session.status = "terminated";
      session.violationLevel = 3;
      session.terminationReason = "app_background_timeout";
      session.endedAt = new Date();
      await DeviceLock.updateMany(
        { session: session._id },
        { isActive: false, releasedAt: new Date(), releaseReason: "terminated" }
      );
      action = "terminated";
    } else if (violationLevel > 0) {
      session.totalViolations += 1;
      session.integrityScore = computeIntegrity(session.totalViolations, session.warningsIssued);

      // Track critical violations for 2-strike rule
      if (violationLevel === 3) {
        session.criticalViolations = (session.criticalViolations || 0) + 1;
      }

      if (
        (violationLevel === 3 && session.criticalViolations >= 2) ||
        session.totalViolations >= 10
      ) {
        session.status = "terminated";
        session.violationLevel = 3;
        session.terminationReason = eventType;
        session.endedAt = new Date();
        await DeviceLock.updateMany(
          { session: session._id },
          { isActive: false, releasedAt: new Date(), releaseReason: "terminated" }
        );
        action = "terminated";
      } else if (session.totalViolations % 3 === 0) {
        // Issue a warning every 3 violations
        session.warningsIssued += 1;
        action = "warned";
      }
    }

    await session.save();

    // ── Write to ProctorLogs ──────────────────────────────────────────────
    await ProctorLog.create({
      session: session._id,
      student: req.user._id,
      quiz: session.quiz,
      company: session.company,
      eventType,
      severity,
      violationLevel,
      duration: duration || null,
      metadata: metadata || {},
    });

    res.json({
      action,
      integrityScore: session.integrityScore,
      totalViolations: session.totalViolations,
      warningsIssued: session.warningsIssued,
      status: session.status,
      ...(action === "terminated" && { terminationReason: session.terminationReason }),
    });
  } catch (error) {
    console.error("logEvent error:", error);
    res.status(500).json({ error: "Failed to log event" });
  }
};

// ─── 3. Upload Snapshot ────────────────────────────────────────────────────

exports.uploadSnapshot = async (req, res) => {
  try {
    const { sessionToken, imageData, type, faceDetected, faceCount, faceCentered, faceScore } =
      req.body;

    if (!sessionToken || !imageData || !type) {
      return res.status(400).json({ error: "sessionToken, imageData, and type required" });
    }

    const session = await QuizSession.findOne({ sessionToken, student: req.user._id });
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Allow end/violation snapshots even on terminated sessions (for evidence)
    if (session.status !== "active" && !["end", "violation"].includes(type)) {
      return res.status(409).json({ error: "Session is no longer active" });
    }

    const snapshot = await Snapshot.create({
      session: session._id,
      student: req.user._id,
      quiz: session.quiz,
      company: session.company,
      type,
      imageData,
      faceDetected: !!faceDetected,
      faceCount: faceCount || 0,
      faceCentered: !!faceCentered,
      faceScore: faceScore || null,
      flagged: faceCount > 1 || !faceDetected,
      flagReason:
        faceCount > 1
          ? "Multiple faces detected"
          : !faceDetected
          ? "No face detected"
          : null,
    });

    // Link start snapshot to session
    if (type === "start" && !session.startSnapshotId) {
      session.startSnapshotId = snapshot._id;
      session.identityVerified = !!faceDetected;
      await session.save();
    }

    if (type === "end") {
      session.endSnapshotId = snapshot._id;
      await session.save();
    }

    res.json({
      snapshotId: snapshot._id,
      flagged: snapshot.flagged,
      flagReason: snapshot.flagReason,
    });
  } catch (error) {
    console.error("uploadSnapshot error:", error);
    res.status(500).json({ error: "Failed to upload snapshot" });
  }
};

// ─── 4. Submit Quiz ────────────────────────────────────────────────────────

exports.submitProctoredQuiz = async (req, res) => {
  try {
    const { id: quizId } = req.params;
    const { sessionToken, answers } = req.body;

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const session = await QuizSession.findOne({ sessionToken, student: req.user._id });
    if (!session) return res.status(404).json({ error: "Session not found" });

    // Guard: session must belong to the quiz being submitted
    if (session.quiz.toString() !== quizId) {
      return res.status(403).json({ error: "Session does not match this quiz" });
    }

    if (session.status === "terminated") {
      return res.status(403).json({
        error: "Your exam was terminated due to proctoring violations",
        terminationReason: session.terminationReason,
      });
    }

    const quiz = await Quiz.findOne({ _id: quizId, company: req.user.company, isActive: true });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const attempt = await Attempt.findOne({ quiz: quizId, student: req.user._id });
    if (!attempt) return res.status(400).json({ error: "No attempt found" });
    if (attempt.isSubmitted) return res.status(409).json({ error: "Already submitted" });

    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: "Answers must be an array" });
    }

    const questions = await Question.find({ quiz: quizId });
    const questionMap = {};
    questions.forEach((q) => (questionMap[q._id.toString()] = q));

    let totalScore = 0;
    const answerDocs = [];

    for (const ans of answers) {
      const question = questionMap[ans.questionId];
      if (!question) continue;
      const isCorrect = question.correctAnswer === ans.selectedAnswer;
      const points = isCorrect ? question.marks : 0;
      totalScore += points;
      answerDocs.push({
        attempt: attempt._id,
        question: ans.questionId,
        selectedAnswer: ans.selectedAnswer,
        isCorrect,
      });
    }

    if (answerDocs.length > 0) {
      await Answer.insertMany(answerDocs, { ordered: false }).catch(() => {});
    }

    const now = new Date();
    attempt.score = totalScore;
    attempt.maxScore = quiz.totalMarks;
    attempt.submittedAt = now;
    attempt.isSubmitted = true;
    await attempt.save();

    // Finalise session
    session.status = "completed";
    session.endedAt = now;
    await session.save();

    // Release device lock
    await DeviceLock.updateMany(
      { session: session._id },
      { isActive: false, releasedAt: now, releaseReason: "submitted" }
    );

    // Log submission
    await ProctorLog.create({
      session: session._id,
      student: req.user._id,
      quiz: quizId,
      company: session.company,
      eventType: "exam_submitted",
      severity: "info",
      violationLevel: 0,
    });

    res.json({
      success: true,
      score: totalScore,
      maxScore: quiz.totalMarks,
      percentage: quiz.totalMarks > 0 ? Math.round((totalScore / quiz.totalMarks) * 100) : 0,
      integrityScore: session.integrityScore,
    });
  } catch (error) {
    console.error("submitProctoredQuiz error:", error);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
};

// ─── 5. Live Monitor (Lecturer) ────────────────────────────────────────────

exports.liveMonitor = async (req, res) => {
  try {
    const { quizId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: quizId, company: req.user.company });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const sessions = await QuizSession.find({ quiz: quizId, company: req.user.company })
      .populate("student", "name indexNumber")
      .populate("attempt", "score maxScore isSubmitted")
      .sort({ startedAt: -1 });

    const now = new Date();
    const sessionData = sessions.map((s) => {
      const elapsed = (now - s.startedAt) / 1000 / 60; // minutes
      const remaining = Math.max(0, quiz.timeLimit - elapsed);
      const statusColor =
        s.status === "terminated" ? "red" :
        s.status === "completed"  ? "green" :
        s.integrityScore >= 75    ? "green" :
        s.integrityScore >= 50    ? "yellow" : "red";

      return {
        sessionId: s._id,
        student: s.student,
        platform: s.platform,
        status: s.status,
        statusColor,
        integrityScore: s.integrityScore,
        totalViolations: s.totalViolations,
        warningsIssued: s.warningsIssued,
        remainingMinutes: Math.round(remaining),
        identityVerified: s.identityVerified,
        isSubmitted: s.attempt?.isSubmitted || false,
        lastHeartbeat: s.lastHeartbeat,
        terminationReason: s.terminationReason,
      };
    });

    res.json({
      quiz: { _id: quiz._id, title: quiz.title, timeLimit: quiz.timeLimit },
      sessions: sessionData,
      summary: {
        total: sessions.length,
        active: sessions.filter((s) => s.status === "active").length,
        completed: sessions.filter((s) => s.status === "completed").length,
        terminated: sessions.filter((s) => s.status === "terminated").length,
      },
    });
  } catch (error) {
    console.error("liveMonitor error:", error);
    res.status(500).json({ error: "Failed to fetch monitor data" });
  }
};

// ─── 6. Session Report (Lecturer) ─────────────────────────────────────────

exports.sessionReport = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: "Invalid session ID" });
    }

    const session = await QuizSession.findById(sessionId)
      .populate("student", "name indexNumber email")
      .populate("attempt", "score maxScore isSubmitted submittedAt startedAt")
      .populate("quiz", "title timeLimit totalMarks");

    if (!session || session.company.toString() !== req.user.company.toString()) {
      return res.status(404).json({ error: "Session not found" });
    }

    const [logs, snapshots] = await Promise.all([
      ProctorLog.find({ session: sessionId }).sort({ timestamp: 1 }),
      Snapshot.find({ session: sessionId })
        .select("-imageData")
        .sort({ capturedAt: 1 }),
    ]);

    // Violation summary
    const violationSummary = {};
    logs.forEach((l) => {
      if (l.violationLevel > 0) {
        violationSummary[l.eventType] = (violationSummary[l.eventType] || 0) + 1;
      }
    });

    res.json({
      session,
      logs,
      snapshots,
      violationSummary,
    });
  } catch (error) {
    console.error("sessionReport error:", error);
    res.status(500).json({ error: "Failed to fetch session report" });
  }
};

// ─── 7. Snapshot Image (Lecturer) ─────────────────────────────────────────

exports.getSnapshotImage = async (req, res) => {
  try {
    const { snapshotId } = req.params;
    const snapshot = await Snapshot.findById(snapshotId);

    if (!snapshot || snapshot.company.toString() !== req.user.company.toString()) {
      return res.status(404).json({ error: "Snapshot not found" });
    }

    res.json({ imageData: snapshot.imageData, type: snapshot.type, capturedAt: snapshot.capturedAt });
  } catch (error) {
    console.error("getSnapshotImage error:", error);
    res.status(500).json({ error: "Failed to fetch snapshot" });
  }
};

// ─── Utils ─────────────────────────────────────────────────────────────────

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Shuffle options but keep track of which index is correct.
 * Since we strip correctAnswer from the query, we just shuffle options array
 * and return the shuffled options with no mapping needed (student sees shuffled).
 */
function shuffleOptionsWithMapping(q) {
  if (!q.options || q.options.length === 0) return q.options;
  const indices = q.options.map((_, i) => i);
  const shuffled = shuffleArray(indices);
  return shuffled.map((i) => q.options[i]);
}
