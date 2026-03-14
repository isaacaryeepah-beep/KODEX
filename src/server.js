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
let superadminRoutes = null;
try { superadminRoutes = require("./routes/superadmin"); } catch(_) { console.warn('superadmin routes not found — skipping'); }

// ── Security middleware ───────────────────────────────────────────────────────
const { loginLimiter, registerLimiter, passwordResetLimiter, apiLimiter } = require("./middleware/rateLimiter");
const { sanitizeInputs } = require("./middleware/sanitize");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Helmet: secure HTTP headers ───────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,      // keep off — your app uses inline scripts
  crossOriginEmbedderPolicy: false,  // needed for Jitsi/Zoom iframes
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  hsts: { maxAge: 31536000, includeSubDomains: true }, // force HTTPS for 1 year
  noSniff: true,         // prevent MIME type sniffing
  frameguard: { action: "sameorigin" }, // prevent clickjacking
  xssFilter: true,       // basic XSS protection header
}));

// ── CORS: only allow your own domain ─────────────────────────────────────────
const allowedOrigins = [
  "https://kodex-713g.onrender.com",  // render subdomain
  "https://kodex.it.com",             // custom domain
  "https://www.kodex.it.com",         // www variant
  "http://kodex.it.com",              // http fallback
  "http://www.kodex.it.com",          // www http fallback
  "http://localhost:3000",            // local dev
  "http://localhost:5000",            // local dev
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin} is not allowed`));
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
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

app.use(express.json({ limit: "10mb" })); // kept at 10mb — proctored quiz snapshots need it

// ── Global input sanitizer (NoSQL injection + XSS prevention) ────────────────
app.use(sanitizeInputs);

// ── General API rate limit (200 req / 15min per IP) ──────────────────────────
// Exclude snapshot upload from general rate limit (large payloads, frequent during quizzes)
app.use("/api/", (req, res, next) => {
  if (req.path.includes('/snapshot') || req.path.includes('/health')) return next();
  return apiLimiter(req, res, next);
});
// Superadmin portal — must be before static middleware so it takes priority
app.get("/superadmin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "superadmin.html"));
});

app.use(express.static(path.join(__dirname, "public"), {
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
app.use("/api/lecturer/question-bank", questionBankRoutes);
app.use("/api/announcements",          announcementRoutes);
app.use("/api/webhooks",               webhookRoutes);      // public — Paystack webhook
app.use("/api/gradebook",              gradeBookRoutes);
app.use("/api/student/quizzes", studentQuizRoutes);
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
app.use("/api/ai",          aiProxyRoutes);
const shiftRoutes        = require("./routes/shifts");
const leaveRoutes        = require("./routes/leaves");
const trainingRoutes     = require("./routes/training");
const performanceRoutes  = require("./routes/performance");
const operationsRoutes   = require("./routes/operations");
const advancedRoutes     = require("./routes/advanced");
app.use("/api/shifts",      shiftRoutes);
app.use("/api/leaves",      leaveRoutes);
app.use("/api/training",    trainingRoutes);
app.use("/api/performance", performanceRoutes);
app.use("/api/operations",  operationsRoutes);
app.use("/api/advanced",    advancedRoutes);
if (superadminRoutes) app.use("/api/superadmin",  superadminRoutes);

app.use((req, res) => {
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

    // Start email scheduler (trial reminders, renewal nudges)
    try {
      const { startScheduler } = require("./services/emailScheduler");
      startScheduler();
    } catch (e) {
      console.error("Scheduler failed to start:", e.message);
    }
  });
};

start();
