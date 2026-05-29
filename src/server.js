require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
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
let jitsiRoutes = null;
try { jitsiRoutes = require("./routes/jitsi"); } catch(e) { console.warn('[Jitsi] routes not loaded:', e.message); }
const searchRoutes = require("./routes/Search");
// Legacy proctored quiz system — superseded by SnapQuiz (proctoringEnabled=true).
// Kept for historical data access. Set LEGACY_PROCTOR_DISABLED=true to retire.
let proctoredQuizRoutes = null;
if (!process.env.LEGACY_PROCTOR_DISABLED) {
  try { proctoredQuizRoutes = require("./routes/proctoredQuizzes"); } catch(_) {}
}
const assignmentRoutes  = require("./routes/assignments");
const aiProxyRoutes     = require("./routes/aiProxy");
const meetingRoutes     = require("./routes/meetingRoutes");
const sessionDashboardRoutes = require('./routes/sessionDashboard');
const normalQuizLecturerRoutes = require("./routes/normalQuizLecturerRoutes");
const normalQuizStudentRoutes  = require("./routes/normalQuizStudentRoutes");
const snapQuizLecturerRoutes        = require("./routes/snapQuizLecturerRoutes");
const snapQuizStudentRoutes         = require("./routes/snapQuizStudentRoutes");
const offlineSyncRoutes             = require("./routes/offlineSync");
const assignmentLecturerRoutes      = require("./routes/assignmentLecturerRoutes");
const assignmentStudentRoutes       = require("./routes/assignmentStudentRoutes");
const aiGeneratorRoutes             = require("./routes/aiGeneratorRoutes");
const hodRoutes = require("./routes/hod");
let superadminRoutes = null;
try { superadminRoutes = require("./routes/superadmin"); } catch(_) { console.warn('superadmin routes not found — skipping'); }

const { loginLimiter, registerLimiter, passwordResetLimiter, apiLimiter } = require("./middleware/rateLimiter");
const { sanitizeInputs } = require("./middleware/sanitize");

const app = express();
const PORT = process.env.PORT || 5000;

app.set("trust proxy", true);

app.use(compression({ level: 4, threshold: 1024 }));

app.use((req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.RENDER;
  if (isProduction && req.headers['x-forwarded-proto'] === 'http') {
    return res.redirect(301, `https://${req.hostname}${req.originalUrl}`);
  }
  next();
});

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  frameguard: { action: "sameorigin" },
  xssFilter: true,
}));

const allowedOrigins = [
  // dikly.live (legacy + Jitsi meet subdomain)
  "https://dikly.live",
  "https://www.dikly.live",
  "https://app.dikly.live",
  "https://monitor.dikly.live",
  "https://api.dikly.live",
  "https://admin.dikly.live",
  "https://meet.dikly.live",
  // dikly.sbs (primary platform domains)
  "https://dikly.sbs",
  "https://www.dikly.sbs",
  "https://app.dikly.sbs",
  "https://monitor.dikly.sbs",
  "https://api.dikly.sbs",
  "https://admin.dikly.sbs",
  // exam subdomain
  "https://exam.dikly.sbs",
  // Flutter web app (GitHub Pages)
  "https://isaacaryeepah-beep.github.io",
  // local development
  "http://localhost:3000",
  "http://localhost:5000",
];

app.use(cors({
  origin: (origin, callback) => {
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
    "x-device-id",
    "x-session-token",
    "x-request-time",
  ],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));


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

app.use((req, res, next) => {
  if (req.body && req.body.email) {
    req.body.email = req.body.email.trim().toLowerCase();
  }
  next();
});

app.use(sanitizeInputs);

app.use("/api/", (req, res, next) => {
  if (req.path.includes('/snapshot') || req.path.includes('/health')) return next();
  return apiLimiter(req, res, next);
});

// Docker / load-balancer health check
app.get('/health', (req, res) => res.json({ status: 'ok', ts: Date.now() }));

app.get("/superadmin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "superadmin.html"));
});

// Standalone proctoring monitor dashboard
app.get('/monitor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'monitor.html'));
});

// Student session preflight / validation screen (runs before Jitsi)
app.get('/session-preflight', (req, res) => {
  // Permissions-Policy allows this page to delegate camera/mic to cross-origin iframes.
  // Without it, iOS Safari may reload or block the Jitsi iframe when permissions are granted.
  res.setHeader('Permissions-Policy', 'camera=*, microphone=*, display-capture=*');
  res.sendFile(path.join(__dirname, 'public', 'session-preflight.html'));
});

// Meeting lobby pages
app.get('/lecturer-meeting', (req, res) => {
  res.setHeader('Permissions-Policy', 'camera=*, microphone=*, display-capture=*');
  res.sendFile(path.join(__dirname, 'public', 'lecturer-meeting.html'));
});
app.get('/student-meeting', (req, res) => {
  res.setHeader('Permissions-Policy', 'camera=*, microphone=*, display-capture=*');
  res.sendFile(path.join(__dirname, 'public', 'student-meeting.html'));
});

// GetStream live call room
app.get('/stream-room', (req, res) => {
  res.setHeader('Permissions-Policy', 'camera=*, microphone=*, display-capture=*');
  res.sendFile(path.join(__dirname, 'public', 'stream-room.html'));
});

// AI-proctored exam pages
app.get('/exam-preflight', (req, res) => {
  res.setHeader('Permissions-Policy', 'camera=*, microphone=*, fullscreen=*');
  res.sendFile(path.join(__dirname, 'public', 'exam-preflight.html'));
});
app.get('/exam-room', (req, res) => {
  res.setHeader('Permissions-Policy', 'camera=*, microphone=*, fullscreen=*');
  res.sendFile(path.join(__dirname, 'public', 'exam-room.html'));
});

app.get("/anticheat",      (req, res) => res.sendFile(path.join(__dirname, "public", "anticheat-dashboard.html")));
app.get("/about",          (req, res) => res.sendFile(path.join(__dirname, "public", "about.html")));
app.get("/founder",        (req, res) => res.sendFile(path.join(__dirname, "public", "founder.html")));
app.get("/contact",        (req, res) => res.sendFile(path.join(__dirname, "public", "contact.html")));
app.get("/privacy",        (req, res) => res.sendFile(path.join(__dirname, "public", "privacy.html")));
app.get("/terms",          (req, res) => res.sendFile(path.join(__dirname, "public", "terms.html")));
app.get("/delete-account", (req, res) => res.sendFile(path.join(__dirname, "public", "delete-account.html")));

// Flutter web app — served at /app/ (same origin as API, no CORS needed)
const flutterWebPath = path.join(__dirname, '..', 'flutter-web');
// Explicit index handler first so express.static never sees a bare directory (avoids 403)
app.get(['/app', '/app/'], (req, res) => {
  res.sendFile(path.join(flutterWebPath, 'index.html'), (err) => {
    if (err) res.status(503).send('Flutter app deploying — try again in a moment.');
  });
});
app.use('/app', express.static(flutterWebPath, { index: false }));
app.get('/app/*', (req, res) => {
  res.sendFile(path.join(flutterWebPath, 'index.html'), (err) => {
    if (err) res.status(503).send('Flutter app deploying — try again in a moment.');
  });
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (['.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2'].includes(ext)) {
      res.setHeader("Cache-Control", "public, max-age=604800, stale-while-revalidate=86400");
    } else {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    }
  },
}));

app.get("/api", (req, res) => {
  res.json({
    status: "running",
    message: "DIKLY API Server",
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
app.use("/api/offline-sync",           offlineSyncRoutes);
app.use("/api/lecturer/assignments",   assignmentLecturerRoutes);
app.use("/api/student/assignments",    assignmentStudentRoutes);
app.use("/api/lecturer/ai-generator",  aiGeneratorRoutes);
app.use("/api/admin/quizzes", adminQuizRoutes);
app.use("/api/zoom", zoomRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/hod", hodRoutes);
app.use("/api/roster", rosterRoutes);
app.use("/api/admin/reports", adminReportRoutes);
if (jitsiRoutes) {
  app.use("/api/jitsi", jitsiRoutes);
} else {
  app.use("/api/jitsi", (req, res) => res.status(503).json({ error: "Jitsi is not configured on this server. Use GetStream meetings instead." }));
}
app.use("/api/admin", adminDashboardRoutes);
app.use("/api/search", searchRoutes);
if (proctoredQuizRoutes) {
  app.use("/api/proctor", proctoredQuizRoutes);
} else {
  app.use("/api/proctor", (req, res) => res.status(410).json({
    error: "The legacy proctored quiz system has been retired. Use /api/student/snap-quizzes instead.",
  }));
}
app.use("/api/assignments", assignmentRoutes);
app.use("/api/ai", aiProxyRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/exam",     require("./routes/examRoutes"));
app.use("/api/attendance-sessions", sessionDashboardRoutes);

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

const classRepRoutes      = require('./routes/classRepRoutes');
app.use('/api/class-rep', classRepRoutes);

const classRepAdminRoutes = require('./routes/classRepAdmin');
app.use('/api/class-rep-admin', classRepAdminRoutes);

const courseVideoRoutes = require('./routes/courseVideoRoutes');
app.use('/api/course-videos', courseVideoRoutes);

if (superadminRoutes) app.use("/api/superadmin", superadminRoutes);

app.get('/.well-known/assetlinks.json', (req, res) => {
  res.json([{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'sbs.dikly.attendance',
      sha256_cert_fingerprints: [process.env.ANDROID_SHA256_FINGERPRINT || 'REPLACE_WITH_YOUR_KEYSTORE_SHA256'],
    },
  }]);
});

app.get('/.well-known/apple-app-site-association', (req, res) => {
  res.set('Content-Type', 'application/json');
  res.json({
    applinks: {
      apps: [],
      details: [{
        appID: (process.env.APPLE_TEAM_ID || 'REPLACE_WITH_TEAM_ID') + '.sbs.dikly.attendance',
        paths: ['*'],
      }],
    },
  });
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found', path: req.path });
  }
  const indexPath = path.join(__dirname, "public", "index.html");
  const fs = require("fs");
  if (req.accepts("html") && fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: "Route not found" });
  }
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

let validateJitsiConfig = () => {};
try { ({ validateJitsiConfig } = require('./services/jitsiConfigValidator')); } catch(_) {}

const start = async () => {
  validateJitsiConfig();
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

  try {
    const mongoose = require("mongoose");
    const db = mongoose.connection.db;
    const assignmentsCol = db.collection("assignments");
    const aIdxs = await assignmentsCol.indexes();
    for (const idx of aIdxs) {
      if (idx.unique && idx.key && idx.key.company !== undefined && Object.keys(idx.key).length <= 3) {
        console.log(`Dropping stale unique assignment index: ${idx.name}`);
        await assignmentsCol.dropIndex(idx.name);
      }
    }
  } catch (e) {
    if (e.codeName !== "IndexNotFound" && e.code !== 26) {
      console.log("Assignment index cleanup note:", e.message);
    }
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);

    // Attach WebSocket monitoring server
    try {
      const monitorWs = require('./services/monitorWs');
      monitorWs.attachToServer(httpServer);
      console.log('[MonitorWS] WebSocket monitoring server attached');
    } catch (e) {
      console.error('[MonitorWS] Failed to attach:', e.message);
    }

    try {
      const { startScheduler } = require("./services/emailScheduler");
      const { runWatchdog } = require("./controllers/sessionController");
      setInterval(runWatchdog, 5000);
      startScheduler();
    } catch (e) {
      console.error("Scheduler failed to start:", e.message);
    }

    try {
      const { startAssignmentReminder } = require("./services/assignmentReminder");
      startAssignmentReminder();
    } catch (e) {
      console.error("[AssignmentReminder] Failed to start:", e.message);
    }

    try {
      const { startTimetableReminder } = require("./services/timetableReminder");
      startTimetableReminder();
    } catch (e) {
      console.error("[TimetableReminder] Failed to start:", e.message);
    }
  });
};

start();

// ── Process-level crash guards ────────────────────────────────────────────────
// Log the error so it appears in Render/PM2 logs, then exit so the process
// manager can restart cleanly. Swallowing these silently causes zombie servers.
process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] unhandledRejection:", reason);
  process.exit(1);
});
