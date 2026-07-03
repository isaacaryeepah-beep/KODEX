require("dotenv").config();

// Sentry must be initialised before any other require so it can instrument them
const Sentry = require("@sentry/node");
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    // Capture 10 % of traces in production; 100 % in dev
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  });
}

const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const path = require("path");
const morgan = require("morgan");
const logger = require("./services/logger");
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
const aiReportRoutes                = require("./routes/aiReports");
const hodRoutes = require("./routes/hod");
let superadminRoutes = null;
try { superadminRoutes = require("./routes/superadmin"); } catch(_) { logger.warn('superadmin routes not found — skipping'); }

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

// HTTP request logging via morgan → winston
const morganFormat = (process.env.NODE_ENV === 'production' || process.env.RENDER) ? 'combined' : 'dev';
app.use(morgan(morganFormat, { stream: logger.stream }));

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src":     ["'self'"],
      "script-src":      ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://meet.dikly.live"],
      "script-src-attr": ["'unsafe-inline'"],
      "style-src":       ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      "font-src":        ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net", "data:"],
      "img-src":         ["'self'", "data:", "blob:", "https:"],
      "connect-src":     ["'self'", "https://api.anthropic.com", "https://*.dikly.sbs", "https://*.dikly.live", "wss://*.dikly.sbs", "wss://*.dikly.live", "wss://*.livekit.cloud", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
      "frame-src":       ["'self'", "https://meet.dikly.live", "https://*.livekit.cloud"],
      "media-src":       ["'self'", "blob:"],
      "object-src":      ["'none'"],
      "base-uri":        ["'self'"],
      "form-action":     ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  noSniff: true,
  frameguard: { action: "sameorigin" },
  xssFilter: true,
}));

const allowedOrigins = [
  // Production domains
  "https://dikly.live",
  "https://www.dikly.live",
  "https://app.dikly.live",
  "https://monitor.dikly.live",
  "https://api.dikly.live",
  "https://admin.dikly.live",
  "https://meet.dikly.live",
  // Legacy domain
  "https://dikly.sbs",
  "https://www.dikly.sbs",
  // Local dev
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

// ── Asset version stamp ───────────────────────────────────────────────────────
// JS/CSS are cached aggressively by the browser (see express.static below).
// That is only safe because every asset reference in our HTML carries a
// version query string that changes on every deploy — a stale cached byte
// range is simply never requested again under the new URL. Relying on a
// developer to hand-bump a `?v=` string in index.html has already bitten us:
// app.js was edited across five PRs in one day while its query string sat
// unchanged, so any client with a warm cache (especially the Capacitor
// app, which rarely does a fresh top-level navigation) kept running
// week-old code. This stamp is computed once at boot and injected
// automatically, so it can't be forgotten again.
const ASSET_VERSION = process.env.RENDER_GIT_COMMIT || process.env.SOURCE_VERSION
  || process.env.GIT_COMMIT || Date.now().toString(36);

const fs = require("fs");
const _versionedHtmlCache = new Map();
function sendVersionedHtml(res, absPath) {
  let html = _versionedHtmlCache.get(absPath);
  if (!html) {
    const raw = fs.readFileSync(absPath, "utf8");
    html = raw.replace(
      /(src|href)="(\/(?:js|css)\/[^"?]+)(?:\?[^"]*)?"/g,
      (_m, attr, assetPath) => `${attr}="${assetPath}?v=${ASSET_VERSION}"`
    );
    _versionedHtmlCache.set(absPath, html);
  }
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

app.get(["/", "/index.html"], (req, res) => {
  sendVersionedHtml(res, path.join(__dirname, "public", "index.html"));
});

app.get("/superadmin", (req, res) => {
  sendVersionedHtml(res, path.join(__dirname, "public", "superadmin.html"));
});

app.get("/anticheat",           (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "anticheat-dashboard.html")));
app.get("/monitor",             (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "monitor-standalone.html")));
app.get("/meeting-join",        (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "meeting-monitor.html")));
app.get("/lecturer-meeting",    (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "lecturer-meeting.html")));
app.get("/student-meeting",     (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "student-meeting.html")));
app.get("/session-preflight",   (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "session-preflight.html")));
app.get("/quizzes",        (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "assignments.html")));
app.get("/assignments",    (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "assignments.html")));
app.get("/exam-preflight", (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "exam-preflight.html")));
app.get("/exam-room",      (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "exam-room.html")));
app.get("/about",          (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "about.html")));
app.get("/download",       (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "download.html")));
app.get("/founder",        (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "founder.html")));
app.get("/contact",        (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "contact.html")));
app.get("/privacy",        (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "privacy.html")));
app.get("/terms",          (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "terms.html")));
app.get("/delete-account", (req, res) => sendVersionedHtml(res, path.join(__dirname, "public", "delete-account.html")));

// Any other .html file under public/ that isn't explicitly routed above
// (e.g. snap-quiz.html, stream-room.html) still gets version-stamped, so
// this class of bug can't resurface on a page we forgot to list here.
const _publicDir = path.join(__dirname, "public");
app.get(/^\/[\w\-./]+\.html$/, (req, res, next) => {
  const abs = path.join(_publicDir, decodeURIComponent(req.path));
  if (!abs.startsWith(_publicDir) || !fs.existsSync(abs)) return next();
  sendVersionedHtml(res, abs);
});

app.use(express.static(path.join(__dirname, "public"), {
  setHeaders: (res, filePath) => {
    const base = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    // The service worker script must never be cached at the HTTP layer —
    // its own update algorithm depends on always being able to fetch a
    // byte-fresh copy from the literal /sw.js URL (it carries no version
    // query string, unlike the assets it manages).
    if (base === 'sw.js') {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
    } else if (['.js', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2'].includes(ext)) {
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

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
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
app.use("/api/jitsi", jitsiRoutes);
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
const executiveRoutes           = require("./routes/executive");
const taskRoutes                = require("./routes/tasks");
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
app.use("/api/executive", executiveRoutes);
app.use("/api/tasks", taskRoutes);
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

const classRepAdminRoutes  = require("./routes/classRepAdmin");
const classRepRoutes       = require("./routes/classRepRoutes");
const courseVideoRoutes    = require("./routes/courseVideoRoutes");
const examRoutes           = require("./routes/examRoutes");
app.use("/api/class-rep-admin", classRepAdminRoutes);
app.use("/api/class-rep",       classRepRoutes);
app.use("/api/course-videos",   courseVideoRoutes);
app.use("/api/exam",            examRoutes);
app.use("/api/ai-reports",      aiReportRoutes);

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

// Sentry error handler must come before any other error middleware
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

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

app.use((err, req, res, _next) => {
  // Determine status code: use err.statusCode (AppError) or fall back to 500
  const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;

  // Log server errors (5xx) with full stack; client errors (4xx) with message only
  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl}`, { error: err.message, stack: err.stack });
  } else {
    logger.warn(`${req.method} ${req.originalUrl}: ${err.message}`);
  }

  // Mongoose validation errors → 400
  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors || {}).map(e => e.message);
    return res.status(400).json({ error: messages.join(', ') || err.message });
  }

  // Mongoose duplicate key → 409
  if (err.code === 11000) {
    return res.status(409).json({ error: 'Duplicate entry. A record with this value already exists.' });
  }

  // Mongoose CastError (invalid ObjectId) → 400
  if (err.name === 'CastError') {
    return res.status(400).json({ error: `Invalid ${err.path}: ${err.value}` });
  }

  // JWT errors → 401
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const message = err.isOperational ? err.message : 'Internal server error';
  res.status(statusCode).json({ error: message });
});

const { validateJitsiConfig } = require('./services/jitsiConfigValidator');
const { attachMonitorWs }    = require('./services/monitorWs');

const server = http.createServer(app);
attachMonitorWs(server);

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
      logger.info("Dropped old sparse indexNumber_1_company_1 index");
    }
  } catch (e) {
    if (e.codeName !== "IndexNotFound") {
      logger.info("Index cleanup note: " + e.message);
    }
  }

  try {
    const mongoose = require("mongoose");
    const db = mongoose.connection.db;
    const assignmentsCol = db.collection("assignments");
    const aIdxs = await assignmentsCol.indexes();
    for (const idx of aIdxs) {
      if (idx.unique && idx.key && idx.key.company !== undefined && Object.keys(idx.key).length <= 3) {
        logger.info(`Dropping stale unique assignment index: ${idx.name}`);
        await assignmentsCol.dropIndex(idx.name);
      }
    }
  } catch (e) {
    if (e.codeName !== "IndexNotFound" && e.code !== 26) {
      logger.info("Assignment index cleanup note: " + e.message);
    }
  }

  server.listen(PORT, "0.0.0.0", () => {
    logger.info(`Server running on port ${PORT}`);

    try {
      const { startScheduler } = require("./services/emailScheduler");
      const { runWatchdog } = require("./controllers/sessionController");
      setInterval(runWatchdog, 5000);
      startScheduler();
    } catch (e) {
      logger.error("Scheduler failed to start", { error: e.message });
    }

    // Daily MongoDB backup at 02:00 (only when backup is configured)
    if (process.env.BACKUP_DIR || process.env.BACKUP_S3_BUCKET) {
      try {
        const cron       = require("node-cron");
        const { execFile } = require("child_process");
        const backupScript = path.join(__dirname, "..", "scripts", "backup-mongo.sh");
        cron.schedule("0 2 * * *", () => {
          logger.info("[backup] Starting scheduled MongoDB backup...");
          execFile(backupScript, { env: { ...process.env, PATH: process.env.PATH } }, (err, stdout, stderr) => {
            if (err) {
              logger.error("[backup] Backup failed", { error: err.message, stderr: stderr?.trim() });
            } else {
              logger.info("[backup] Backup complete", { output: stdout?.trim() });
            }
          });
        });
        logger.info("[backup] Daily backup scheduled at 02:00");
      } catch (e) {
        logger.error("[backup] Failed to schedule backup", { error: e.message });
      }
    }
  });
};

// ── Process-level error handlers ─────────────────────────────────────────────

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection", {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception — shutting down", { error: err.message, stack: err.stack });
  process.exit(1);
});

start();
