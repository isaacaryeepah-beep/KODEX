const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email"],
    },
    IndexNumber: {
      type: String,
      trim: true,
      sparse: true,
    },
    employeeId: {
      type: String,
      trim: true,
      sparse: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    role: {
      type: String,
      enum: ["superadmin", "admin", "manager", "employee", "lecturer", "hod", "student"],
      default: "employee",
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Institution is required"],
      index: true,
    },
    isApproved: {
      type: Boolean,
      default: false,
    },
    deviceId: {
      type: String,
      default: null,
      index: true,
    },
    lastLogoutTime: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    profilePhoto: {
      type: String,
      default: null,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorCode:    { type: String, default: null, select: false },
    twoFactorExpires: { type: Date, default: null },
    phone: {
      type: String,
      trim: true,
      default: null,
    },
    mustChangePassword: { type: Boolean, default: false },
    // 4-digit attendance PIN for ESP32 device — stored as bcrypt hash
    attendancePin: {
      type: String,
      default: null,
      select: false,
    }, // set true after admin temp reset
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },

    // Device pairing (lecturer) — one-time code, expires in 5 min
    devicePairingCode:    { type: String, default: null, select: false },
    devicePairingExpiry:  { type: Date,   default: null },
    passwordResetLog: [{
      resetAt:    { type: Date, default: Date.now },
      ipAddress:  { type: String, default: '' },
      userAgent:  { type: String, default: '' },
      method:     { type: String, default: 'self' }, // 'self' | 'admin'
      resetBy:    { type: String, default: '' },      // admin name if admin reset
    }],
    department: {
      type: String,
      trim: true,
      default: null,
    },
    // Student classification fields
    programme: {
      type: String,
      trim: true,
      default: null, // e.g. "BSc", "HND", "Diploma", "BTech", "Top-Up"
    },
    studentLevel: {
      type: String,
      trim: true,
      default: null, // e.g. "100", "200", "300", "400"
    },
    studentGroup: {
      type: String,
      trim: true,
      default: null, // e.g. "A", "B", "C"
    },
    sessionType: {
      type: String,
      trim: true,
      default: null, // e.g. "Morning", "Afternoon", "Evening", "Weekend"
    },
    semester: {
      type: String,
      trim: true,
      default: null, // e.g. "1", "2"
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    // ── Corporate profile fields ──────────────────────────────────────────
    // Granular corporate role used alongside the coarse `role` field.
    // Only populated for users in corporate-mode companies.
    corporateSubRole: {
      type: String,
      enum: [
        "company_admin",    // owns the company account
        "hr_manager",       // manages employees, leave, compliance
        "department_manager", // scoped to own department
        "team_lead",        // scoped to own team
        "branch_manager",   // scoped to own branch
        "payroll_officer",  // read access to payroll data
        "compliance_officer", // compliance & training oversight
        "employee",         // standard staff member
      ],
      default: null,
    },
    designation: {
      type: String,
      trim: true,
      default: null, // e.g. "Senior Software Engineer", "HR Coordinator"
    },
    employmentType: {
      type: String,
      enum: ["full_time", "part_time", "contract", "intern", "probation", null],
      default: null,
    },
    // The user's direct reporting manager (another User).
    reportingManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    dateHired: {
      type: Date,
      default: null,
    },
    workLocation: {
      type: String,
      enum: ["office", "remote", "hybrid", "field", null],
      default: null,
    },
    // Typed reference to corporate department/team (complements string `department`).
    corporateDepartmentRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },
    corporateTeamRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },
    // ── Status & access ───────────────────────────────────────────────────
    // Soft-suspension without removing the account.
    suspendedAt: {
      type: Date,
      default: null,
    },
    suspendedReason: {
      type: String,
      default: null,
    },

    // ── Account locking (failed logins / HOD action) ───────────────────────
    isLocked:            { type: Boolean, default: false },
    lockedAt:            { type: Date, default: null },
    lockReason:          { type: String, default: null },
    lockedBy:            { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    failedLoginAttempts: { type: Number, default: 0 },
    lastFailedLoginAt:   { type: Date, default: null },

    // ── Per-lecturer subscription (1 subscription = 1 user) ──────────────
    // Only applies to: lecturer, manager, admin
    // Students, employees, HODs are always free
    subscriptionStatus: {
      type: String,
      enum: ["trial", "active", "expired"],
      default: "trial",
    },
    trialEndDate: {
      type: Date,
      default: null, // set on registration to createdAt + 30 days
    },
    subscriptionExpiry: {
      type: Date,
      default: null,
    },
    semestersPaid: {
      type: Number,
      default: 0,
    },
    periodsPaid: {
      type: Number,
      default: 0,
    },

    // ── Anti-cheat clock-in/out (corporate) ────────────────────────────────────
    attendanceTrustScore: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },
    attendanceLockoutUntil: {
      type: Date,
      default: null,
    },
    attendanceFailedAttempts: {
      type: [{
        at:     { type: Date,   default: Date.now },
        reason: { type: String },
        ip:     { type: String, default: null },
        _id:    false,
      }],
      default: [],
    },
    lastClockEvent: {
      latitude:    { type: Number, default: null },
      longitude:   { type: Number, default: null },
      at:          { type: Date,   default: null },
      _id: false,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1, company: 1 }, { unique: true, sparse: true });
userSchema.index(
  { phone: 1, company: 1 },
  { unique: true, sparse: true, partialFilterExpression: { phone: { $type: "string" } } }
);
userSchema.index(
  { IndexNumber: 1, company: 1 },
  { unique: true, partialFilterExpression: { IndexNumber: { $type: "string" } } }
);
userSchema.index(
  { employeeId: 1, company: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $type: "string" } } }
);

// Fast look-up of all active users for a company filtered by role.
userSchema.index({ company: 1, role: 1, isActive: 1 });
// Corporate sub-role lookups (e.g. "find all hr_managers for company X").
userSchema.index({ company: 1, corporateSubRole: 1 });
// Corporate department scoping.
userSchema.index({ company: 1, corporateDepartmentRef: 1, isActive: 1 });

userSchema.pre("validate", function () {
  if (this.role === "student") {
    if (!this.IndexNumber) {
      this.invalidate("IndexNumber", "Index number is required for students");
    }
  } else {
    if (!this.email) {
      this.invalidate("email", "Email is required");
    }
  }
});

userSchema.pre("save", async function () {
  // Always store email lowercase — emails are case-insensitive by spec
  if (this.email && this.isModified("email")) {
    this.email = this.email.trim().toLowerCase();
  }
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
