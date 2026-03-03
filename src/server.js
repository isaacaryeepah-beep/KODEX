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
const assignmentRoutes = require("./routes/assignments");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "10mb" }));
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
    message: "Smart Attendance API Server",
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
  });
};

start();
