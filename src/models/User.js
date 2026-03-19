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
    indexNumber: {
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
    mustChangePassword: { type: Boolean, default: false }, // set true after admin temp reset
    // 4-digit PIN for ESP32 classroom attendance marking
    // Simpler than full password — set by student in their profile
    attendancePin:     { type: String, default: null, select: false },  // bcrypt hashed
    attendancePinSet:  { type: Boolean, default: false },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
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
  { indexNumber: 1, company: 1 },
  { unique: true, partialFilterExpression: { indexNumber: { $type: "string" } } }
);
userSchema.index(
  { employeeId: 1, company: 1 },
  { unique: true, partialFilterExpression: { employeeId: { $type: "string" } } }
);

userSchema.pre("validate", function () {
  if (this.role === "student") {
    if (!this.indexNumber) {
      this.invalidate("indexNumber", "Index number is required for students");
    }
  } else {
    if (!this.email) {
      this.invalidate("email", "Email is required");
    }
  }
});

userSchema.pre("save", async function () {
  // Hash attendance PIN if changed
  if (this.isModified("attendancePin") && this.attendancePin) {
    const salt = await bcrypt.genSalt(10);
    this.attendancePin = await bcrypt.hash(String(this.attendancePin), salt);
    this.attendancePinSet = true;
  }

  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.comparePin = async function(candidatePin) {
  if (!this.attendancePin) return false;
  return bcrypt.compare(String(candidatePin), this.attendancePin);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
