require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
const connectDB = require("./config/db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const attendanceSessionRoutes = require("./routes/attendanceSessions");
const qrTokenRoutes = require("./routes/qrTokens");
const paymentRoutes = require("./routes/payments");
const courseRoutes = require("./routes/courses");
const quizRoutes = require("./routes/quizzes");
const lecturerQuizRoutes = require("./routes/lecturerQuizzes");
const questionBankRoutes    = require("./routes/questionBank");
const announcementRoutes    = require("./routes/announcements");
const webhookRoutes         = require("./routes/webhooks");
const gradeBookRoutes       = require("./routes/gradeBook");
const studentQuizRoutes = require("./routes/studentQuizzes");
const adminQuizRoutes = require("./routes/adminQuizzes");
const zoomRoutes = require("./routes/zoom");
const reportRoutes = require("./routes/reports");
const approvalRoutes = require("./routes/approvals");
const rosterRoutes = require("./routes/roster");
const adminReportRoutes = require("./routes/adminReports");
const adminDashboardRoutes = require("./routes/adminDashboard");
const jitsiRoutes = require("./routes/jitsi");
const searchRoutes = require("./routes/Search");
const proctoredQuizRoutes = require("./routes/proctoredQuizzes");
const assignmentRoutes  = require("./routes/assignments");
const aiProxyRoutes     = require("./routes/aiProxy");
const meetingRoutes     = require("./routes/meetingRoutes");   // ← NEW
const sessionDashboardRoutes = require('./routes/sessionDashboard');
const normalQuizLecturerRoutes = require("./routes/normalQuizLecturerRoutes");
const normalQuizStudentRoutes  = require("./routes/normalQuizStudentRoutes");
const snapQuizLecturerRoutes        = require("./routes/snapQuizLecturerRoutes");
const snapQuizStudentRoutes         = require("./routes/snapQuizStudentRoutes");
const assignmentLecturerRoutes      = require("./routes/assignmentLecturerRoutes");
const assignmentStudentRoutes       = require("./routes/assignmentStudentRoutes");
const aiGeneratorRoutes             = require("./routes/aiGeneratorRoutes");
let superadminRoutes = null;
try { superadminRoutes = require("./routes/superadmin"); } catch(_) { console.warn('superadmin routes not found — skipping'); }

// ── Security middleware ───────────────────────────────────────────────────────
const { loginLimiter, registerLimiter, passwordResetLimiter, apiLimiter } = require("./middleware/rateLimiter");
const { sanitizeInputs } = require("./middleware/sanitize");

const app = express();
const PORT = process.env.PORT || 5000;

// ── CRITICAL: trust Render's proxy ────────────────────────────────────────────
// Without this, req.ip and X-Forwarded-For parsing are wrong, and every student
// appears to come from Render's load balancer — which would make the same-
// network public-IP-match anti-cheat in markAttendance silently pass for
// everyone including cheaters at home. Must be set before any route handler.
app.set("trust proxy", true);

// ── Helmet: secure HTTP headers ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  frameguard: { action: "sameorigin" },
  xssFilter: true,
}));

// ── CORS: only allow your own domain ─────────────────────────────────────────
const allowedOrigins = [
  "https://kodex-713g.onrender.com",
  "https://kodex.it.com",
  "https://www.kodex.it.com",
  "http://kodex.it.com",
  "http://www.kodex.it.com",
  "http://localhost:3000",
  "http://localhost:5000",
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (ESP32, Postman, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error(`CORS blocked: ${origin} is not allowed`));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-esp32-secret",
    "x-esp32-token",
  ],
  credentials: true,
}));

// ── Body parsing with safe limit ──────────────────────────────────────────────
// ── Raw body for Paystack webhook signature verification ─────────────────────
app.use((req, res, next) => {
  if (req.path === "/api/webhooks/paystack") {
    let raw = "";
    req.setEncoding("utf8");
    req.on("data", chunk => { raw += chunk; });
    req.on("end", () => {
      req.rawBody = raw;
      try { req.body = JSON.parse(raw); } catch (_) { req.body = {}; }
      next();
    });
  } else {
    next();
  }
});

app.use(express.json({ limit: "10mb" }));

// ── Global email normalizer — always lowercase email before any controller sees it
app.use((req, res, next) => {
  if (req.body && req.body.email) {
    req.body.email = req.body.email.trim().toLowerCase();
  }
  next();
});

// ── Global input sanitizer ───────────────────────────────────────────────────
app.use(sanitizeInputs);

// ── General API rate limit ───────────────────────────────────────────────────
app.use("/api/", (req, res, next) => {
  if (req.path.includes('/snapshot') || req.path.includes('/health')) return next();
  return apiLimiter(req, res, next);
});

// Superadmin portal
app.get("/superadmin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "superadmin.html"));
});

app.use(express.static(path.join(__dirname, "..", "client", "dist"), {
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  },
}));

app.get("/api", (req, res) => {
  res.json({
    status: "running",
    message: "KODEX API Server",
    endpoints: {
      auth: "/api/auth",
      users: "/api/users",
      attendanceSessions: "/api/attendance-sessions",
      qrTokens: "/api/qr-tokens",
      payments: "/api/payments",
      courses: "/api/courses",
      quizzes: "/api/quizzes",
      zoom: "/api/zoom",
      jitsi: "/api/jitsi",
      meetings: "/api/meetings",
      search: "/api/search",
      proctor: "/api/proctor",
      assignments: "/api/assignments",
    },
  });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/attendance-sessions", attendanceSessionRoutes);
app.use("/api/qr-tokens", qrTokenRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/quizzes", quizRoutes);
app.use("/api/lecturer/quizzes", lecturerQuizRoutes);
app.use("/api/lecturer/normal-quizzes", normalQuizLecturerRoutes);
app.use("/api/lecturer/question-bank", questionBankRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/timetable", require("./routes/timetable"));
app.use("/api/webhooks", webhookRoutes);
app.use("/api/gradebook", gradeBookRoutes);
app.use("/api/student/quizzes", studentQuizRoutes);
app.use("/api/student/normal-quizzes", normalQuizStudentRoutes);
app.use("/api/lecturer/snap-quizzes",  snapQuizLecturerRoutes);
app.use("/api/student/snap-quizzes",   snapQuizStudentRoutes);
app.use("/api/lecturer/assignments",   assignmentLecturerRoutes);
app.use("/api/student/assignments",    assignmentStudentRoutes);
app.use("/api/lecturer/ai-generator",  aiGeneratorRoutes);
app.use("/api/admin/quizzes", adminQuizRoutes);
app.use("/api/zoom", zoomRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/roster", rosterRoutes);
app.use("/api/admin/reports", adminReportRoutes);
app.use("/api/jitsi", jitsiRoutes);
app.use("/api/admin", adminDashboardRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/proctor", proctoredQuizRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/ai", aiProxyRoutes);
app.use("/api/meetings", meetingRoutes);              // ← NEW
app.use("/api/attendance-sessions", sessionDashboardRoutes); // session control dashboard

// Student attendance mark (anti-cheat validated)
const { markAttendance } = require('./controllers/sessionDashboardController');
const authenticate = require('./middleware/auth');
const { companyIsolation } = require('./middleware/companyIsolation');
app.post('/api/attendance/mark', authenticate, companyIsolation, markAttendance);

const esp32Routes = require("./routes/esp32");
app.use("/api/esp32", esp32Routes);

const shiftRoutes = require("./routes/shifts");
const leaveRoutes = require("./routes/leaves");
const trainingRoutes = require("./routes/training");
const performanceRoutes = require("./routes/performance");
const operationsRoutes = require("./routes/operations");
const advancedRoutes = require("./routes/advanced");
const departmentRoutes         = require("./routes/departments");
const teamRoutes               = require("./routes/teams");
const employeeProfileRoutes    = require("./routes/employeeProfiles");
const leavePolicyRoutes        = require("./routes/leavePolicies");
const leaveBalanceRoutes       = require("./routes/leaveBalances");
const corporateAttendanceRoutes = require("./routes/corporateAttendance");
const notificationRoutes        = require("./routes/notifications");
const auditLogRoutes            = require("./routes/auditLogs");
const payrollRoutes             = require("./routes/payroll");
const dashboardRoutes           = require("./routes/dashboard");
const courseResourceRoutes      = require("./routes/courseResources");
const enrollmentRoutes          = require("./routes/enrollments");
const forumRoutes               = require("./routes/forums");
const messageRoutes             = require("./routes/messages");
const transcriptRoutes          = require("./routes/transcripts");
const evaluationRoutes          = require("./routes/evaluations");
const calendarRoutes            = require("./routes/calendar");
const supportRoutes             = require("./routes/support");
const badgeRoutes               = require("./routes/badges");
const staffNoteRoutes           = require("./routes/staffNotes");
const programmeRoutes           = require("./routes/programmes");
const engagementRoutes          = require("./routes/engagement");
const faqRoutes                 = require("./routes/faq");

app.use("/api/shifts", shiftRoutes);
app.use("/api/leaves", leaveRoutes);
app.use("/api/training", trainingRoutes);
app.use("/api/performance", performanceRoutes);
app.use("/api/operations", operationsRoutes);
app.use("/api/advanced", advancedRoutes);
app.use("/api/departments",          departmentRoutes);
app.use("/api/teams",                teamRoutes);
app.use("/api/employee-profiles",    employeeProfileRoutes);
app.use("/api/leave-policies",       leavePolicyRoutes);
app.use("/api/leave-balances",       leaveBalanceRoutes);
app.use("/api/corporate-attendance", corporateAttendanceRoutes);
app.use("/api/notifications",        notificationRoutes);
app.use("/api/audit-logs",           auditLogRoutes);
app.use("/api/payroll",              payrollRoutes);
app.use("/api/dashboard",           dashboardRoutes);
app.use("/api/courses/:courseId/resources", courseResourceRoutes);
app.use("/api/enrollments",         enrollmentRoutes);
app.use("/api/forums",              forumRoutes);
app.use("/api/messages",            messageRoutes);
app.use("/api/transcripts",         transcriptRoutes);
app.use("/api/evaluations",         evaluationRoutes);
app.use("/api/calendar",            calendarRoutes);
app.use("/api/support",             supportRoutes);
app.use("/api/badges",              badgeRoutes);
app.use("/api/staff-notes",         staffNoteRoutes);
app.use("/api/programmes",          programmeRoutes);
app.use("/api/engagement",          engagementRoutes);
app.use("/api/faq",                 faqRoutes);

const deviceSessionRoutes = require("./routes/deviceSessionRoutes");
app.use("/api", deviceSessionRoutes);

if (superadminRoutes) app.use("/api/superadmin", superadminRoutes);

// ── Fallback ─────────────────────────────────────────────────────────────────
app.use((req, res) => {
  const indexPath = path.join(__dirname, "..", "client", "dist", "index.html");
  const fs = require("fs");
  if (req.accepts("html") && fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: "Route not found" });
  }
});

// ── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ── Start server ─────────────────────────────────────────────────────────────
const start = async () => {
  await connectDB();

  try {
    const mongoose = require("mongoose");
    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");
    const indexes = await usersCollection.indexes();
    const oldIndex = indexes.find(
      (idx) =>
        idx.key &&
        idx.key.indexNumber === 1 &&
        idx.key.company === 1 &&
        idx.sparse === true
    );
    if (oldIndex) {
      await usersCollection.dropIndex(oldIndex.name);
      console.log("Dropped old sparse indexNumber_1_company_1 index");
    }
  } catch (e) {
    if (e.codeName !== "IndexNotFound") {
      console.log("Index cleanup note:", e.message);
    }
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);

    try {
      const { startScheduler } = require("./services/emailScheduler");
      const { runWatchdog } = require("./controllers/sessionController");
      setInterval(runWatchdog, 5000);
      startScheduler();
    } catch (e) {
      console.error("Scheduler failed to start:", e.message);
    }
  });
};

start();
