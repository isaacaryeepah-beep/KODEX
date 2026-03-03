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
      enum: ["superadmin", "admin", "manager", "employee", "lecturer", "student"],
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
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
    department: {
      type: String,
      trim: true,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1, company: 1 }, { unique: true, sparse: true });
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
