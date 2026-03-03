const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Company = require("../models/Company");
const StudentRoster = require("../models/StudentRoster");
const { generateToken } = require("../utils/jwt");

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

exports.register = async (req, res) => {
  try {
    const { email, password, name, companyName, mode } = req.body;

    if (!email || !password || !name || !companyName) {
      return res.status(400).json({ error: "Email, password, name, and institution name are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const companyMode = mode || "corporate";
    if (!["corporate", "academic"].includes(companyMode)) {
      return res.status(400).json({ error: "Mode must be corporate or academic" });
    }

    const existingCompany = await Company.findOne({ name: companyName });
    if (existingCompany) {
      return res.status(400).json({ error: "An institution with this name already exists. Use your institution code to join instead." });
    }

    const company = await Company.create({
      name: companyName,
      mode: companyMode,
      subscriptionStatus: "trial",
    });

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      await Company.findByIdAndDelete(company._id);
      return res.status(400).json({ error: "This email is already registered" });
    }

    let user;
    try {
      user = await User.create({
        email,
        password,
        name,
        company: company._id,
        role: "admin",
        isApproved: true,
      });
    } catch (userError) {
      await Company.findByIdAndDelete(company._id);
      throw userError;
    }

    const token = generateToken(user._id);

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        company: {
          id: company._id,
          name: company.name,
          mode: company.mode,
          institutionCode: company.institutionCode,
        },
      },
      trial: {
        active: company.isTrialActive,
        daysRemaining: company.trialDaysRemaining,
        timeRemaining: company.trialTimeRemaining,
      },
      subscription: {
        active: company.subscriptionActive,
        status: company.subscriptionStatus,
        plan: company.subscriptionPlan,
      },
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "field";
      return res.status(400).json({ error: `This ${field} is already registered` });
    }
    console.error("Register error:", error.message, error.stack);
    res.status(500).json({ error: error.message || "Registration failed" });
  }
};

exports.registerLecturer = async (req, res) => {
  try {
    const { name, email, password, institutionCode, institutionName, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // MODE A: Lecturer creates their own institution (subscribed as admin)
    if (institutionName && !institutionCode) {
      const existingCompany = await Company.findOne({ name: institutionName });
      if (existingCompany) {
        return res.status(400).json({ error: "An institution with this name already exists. Use your institution code to join instead." });
      }

      const company = await Company.create({
        name: institutionName,
        mode: "academic",
        subscriptionStatus: "trial",
      });

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        await Company.findByIdAndDelete(company._id);
        return res.status(400).json({ error: "This email is already registered" });
      }

      let user;
      try {
        user = await User.create({
          email,
          password,
          name,
          company: company._id,
          role: "lecturer",
          isApproved: true,
          department: department || null,
        });
      } catch (userError) {
        await Company.findByIdAndDelete(company._id);
        throw userError;
      }

      const token = generateToken(user._id);
      return res.status(201).json({
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          isApproved: user.isApproved,
          company: {
            id: company._id,
            name: company.name,
            mode: company.mode,
            institutionCode: company.institutionCode,
          },
        },
        trial: {
          active: company.isTrialActive,
          daysRemaining: company.trialDaysRemaining,
          timeRemaining: company.trialTimeRemaining,
        },
        subscription: {
          active: company.subscriptionActive,
          status: company.subscriptionStatus,
          plan: company.subscriptionPlan,
        },
        message: "Institution created successfully. You are now an approved lecturer.",
      });
    }

    // MODE B: Lecturer joins an existing institution using institution code
    if (!institutionCode) {
      return res.status(400).json({ error: "Either institution name (to create) or institution code (to join) is required" });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase(), mode: "academic" });
    if (!company) {
      return res.status(404).json({ error: "Institution not found. Please check your institution code." });
    }

    if (!company.isActive) {
      return res.status(403).json({ error: "This institution is currently inactive." });
    }

    const existingUser = await User.findOne({ email, company: company._id });
    if (existingUser) {
      return res.status(400).json({ error: "A user with this email already exists at this institution" });
    }

    const user = await User.create({
      name,
      email,
      password,
      company: company._id,
      role: "lecturer",
      isApproved: false,
      department: department || null,
    });

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        company: { id: company._id, name: company.name, mode: company.mode },
      },
      message: "Registration successful. Your account is pending admin approval.",
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: "This email is already registered at this institution" });
    }
    console.error("Lecturer register error:", error);
    res.status(500).json({ error: "Lecturer registration failed" });
  }
};

exports.registerStudent = async (req, res) => {
  try {
    const { name, indexNumber, password, institutionCode } = req.body;

    if (!name || !indexNumber || !password || !institutionCode) {
      return res.status(400).json({ error: "Name, student ID, password, and institution code are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase(), mode: "academic" });
    if (!company) {
      return res.status(404).json({ error: "Institution not found. Please check your institution code." });
    }

    if (!company.isActive) {
      return res.status(403).json({ error: "This institution is currently inactive." });
    }

    const rosterEntry = await StudentRoster.findOne({
      studentId: indexNumber.trim().toUpperCase(),
      company: company._id,
    });

    if (!rosterEntry) {
      return res.status(403).json({
        error: "Your Student ID was not found in any class roster. Your lecturer must add your Student ID to a class before you can register.",
      });
    }

    const existingStudent = await User.findOne({ indexNumber: indexNumber.trim().toUpperCase(), company: company._id });
    if (existingStudent) {
      return res.status(400).json({ error: "A student with this ID already exists at this institution" });
    }

    const user = await User.create({
      name,
      indexNumber: indexNumber.trim().toUpperCase(),
      password,
      company: company._id,
      role: "student",
      isApproved: true,
    });

    await StudentRoster.updateMany(
      { studentId: indexNumber.trim().toUpperCase(), company: company._id },
      { $set: { registered: true, registeredUser: user._id } }
    );

    const Course = require("../models/Course");
    const rosterEntries = await StudentRoster.find({
      studentId: indexNumber.trim().toUpperCase(),
      company: company._id,
    });
    const courseIds = rosterEntries.map((r) => r.course);
    if (courseIds.length > 0) {
      await Course.updateMany(
        { _id: { $in: courseIds } },
        { $addToSet: { enrolledStudents: user._id } }
      );
    }

    const token = generateToken(user._id);

    res.status(201).json({
      user: {
        id: user._id,
        indexNumber: user.indexNumber,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        company: { id: company._id, name: company.name, mode: company.mode },
      },
      token,
      message: "Registration successful. You have been automatically enrolled in your courses.",
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: "This student ID is already registered at this institution" });
    }
    console.error("Student register error:", error);
    res.status(500).json({ error: "Student registration failed" });
  }
};

exports.registerEmployee = async (req, res) => {
  try {
    const { name, email, password, institutionCode } = req.body;

    if (!name || !email || !password || !institutionCode) {
      return res.status(400).json({ error: "Name, email, password, and institution code are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase(), mode: "corporate" });
    if (!company) {
      return res.status(404).json({ error: "Company not found. Please check your institution code." });
    }

    if (!company.isActive) {
      return res.status(403).json({ error: "This company is currently inactive." });
    }

    const existingUser = await User.findOne({ email, company: company._id });
    if (existingUser) {
      return res.status(400).json({ error: "An employee with this email already exists at this company" });
    }

    const updatedCompany = await Company.findByIdAndUpdate(
      company._id,
      { $inc: { nextEmployeeSeq: 1 } },
      { new: true }
    );
    const prefix = (company.name || "CO")
      .substring(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, "X");
    const employeeId = `${prefix}-EMP-${String(updatedCompany.nextEmployeeSeq).padStart(4, "0")}`;

    const user = await User.create({
      name,
      email,
      password,
      company: company._id,
      role: "employee",
      employeeId,
      isApproved: false,
    });

    const token = generateToken(user._id);

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        company: { id: company._id, name: company.name, mode: company.mode },
      },
      message: "Registration successful. Your account is pending admin approval.",
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: "This email is already registered at this company" });
    }
    console.error("Employee register error:", error);
    res.status(500).json({ error: "Employee registration failed" });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, indexNumber, password, deviceId, institutionCode, loginRole, portalMode } = req.body;

    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    if (!email && !indexNumber) {
      return res.status(400).json({ error: "Email or student ID is required" });
    }

    let user;
    if (indexNumber) {
      const query = { indexNumber, role: "student" };
      if (institutionCode) {
        const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
        if (!company) {
          return res.status(401).json({ error: "Institution not found" });
        }
        query.company = company._id;
      }
      user = await User.findOne(query).select("+password");
    } else if (email && institutionCode && loginRole === "employee") {
      const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
      if (!company) {
        return res.status(401).json({ error: "Company not found" });
      }
      user = await User.findOne({ email, company: company._id, role: "employee" }).select("+password");
    } else {
      user = await User.findOne({ email }).select("+password");
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    if (!user.isApproved) {
      return res.status(403).json({ error: "Your account is pending approval. Please contact your institution admin." });
    }

    const company = await Company.findById(user.company);

    if (portalMode && company && company.mode !== portalMode && user.role !== "superadmin") {
      const correctPortal = company.mode === "corporate" ? "Corporate Admin Portal" : "Academic Admin Portal";
      return res.status(403).json({ error: `Your institution is set up as ${company.mode}. Please use the ${correctPortal} to sign in.` });
    }

    // ── Role-portal enforcement ──────────────────────────────────────────────
    // Each portal only accepts specific roles — prevents admins logging in as
    // lecturers, employees logging in as admins, etc.
    const PORTAL_ALLOWED_ROLES = {
      admin:    ["admin", "superadmin", "manager"],
      lecturer: ["lecturer"],
      employee: ["employee"],
      student:  ["student"],
    };
    if (loginRole && PORTAL_ALLOWED_ROLES[loginRole]) {
      const allowed = PORTAL_ALLOWED_ROLES[loginRole];
      if (!allowed.includes(user.role)) {
        // Give a specific helpful message depending on what they tried
        if (loginRole === "lecturer" && ["admin", "superadmin"].includes(user.role)) {
          return res.status(403).json({ error: "You are registered as an Admin. Please use the Admin Portal to sign in." });
        }
        if (loginRole === "admin" && user.role === "lecturer") {
          return res.status(403).json({ error: "You are registered as a Lecturer. Please use the Lecturer Portal to sign in." });
        }
        if (loginRole === "admin" && user.role === "employee") {
          return res.status(403).json({ error: "You are registered as an Employee. Please use the Employee Portal to sign in." });
        }
        return res.status(403).json({ error: `This portal is for ${loginRole}s only. Please use the correct portal to sign in.` });
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    if (company && !company.hasAccess && user.role !== "superadmin" && user.role !== "admin") {
      return res.status(403).json({
        error: "Subscription inactive",
        message: "Your institution's subscription has expired. Please contact your admin.",
        subscriptionExpired: true,
      });
    }

    if (user.lastLogoutTime) {
      const timeSinceLogout = Date.now() - new Date(user.lastLogoutTime).getTime();
      if (timeSinceLogout < SIX_HOURS_MS && deviceId && user.deviceId && user.deviceId !== deviceId) {
        const remainingMs = SIX_HOURS_MS - timeSinceLogout;
        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
        return res.status(403).json({
          error: "You must wait 6 hours before signing in to a different account.",
          remainingHours,
          restrictedUntil: new Date(new Date(user.lastLogoutTime).getTime() + SIX_HOURS_MS).toISOString(),
        });
      }
    }

    if (deviceId) {
      user.deviceId = deviceId;
      await user.save();
    }

    const token = generateToken(user._id);

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        indexNumber: user.indexNumber,
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        company: company ? {
          id: company._id,
          name: company.name,
          mode: company.mode,
          institutionCode: company.institutionCode,
        } : null,
        deviceId: user.deviceId,
      },
      trial: company ? {
        active: company.isTrialActive,
        daysRemaining: company.trialDaysRemaining,
        timeRemaining: company.trialTimeRemaining,
      } : null,
      subscription: company ? {
        active: company.subscriptionActive,
        status: company.subscriptionStatus,
        plan: company.subscriptionPlan,
      } : null,
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed" });
  }
};

exports.logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      lastLogoutTime: new Date(),
      deviceId: null,
    });

    res.json({
      message: "Logged out successfully",
      restrictedUntil: new Date(Date.now() + SIX_HOURS_MS).toISOString(),
    });
  } catch (error) {
    console.error("Logout error:", error);
    res.status(500).json({ error: "Logout failed" });
  }
};

exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate("company", "name mode institutionCode");
    const company = await Company.findById(user.company);

    const isAdmin = ['admin', 'superadmin', 'manager'].includes(user.role);
    res.json({
      user: {
        ...user.toJSON(),
        company: company ? {
          id: company._id,
          _id: company._id,
          name: company.name,
          mode: company.mode,
          institutionCode: company.institutionCode,
          ...(isAdmin ? { qrSeed: company.qrSeed, bleLocationId: company.bleLocationId } : {}),
        } : user.company,
      },
      trial: company ? {
        active: company.isTrialActive,
        daysRemaining: company.trialDaysRemaining,
        timeRemaining: company.trialTimeRemaining,
      } : null,
      subscription: company ? {
        active: company.subscriptionActive,
        status: company.subscriptionStatus,
        plan: company.subscriptionPlan,
      } : null,
    });
  } catch (error) {
    console.error("Get me error:", error);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
};

exports.migrateOrphanUsers = async (req, res) => {
  try {
    const orphanUsers = await User.find({
      $or: [{ company: null }, { company: { $exists: false } }],
    });

    if (orphanUsers.length === 0) {
      return res.json({ message: "No orphan users found", migrated: 0 });
    }

    let defaultCompany = await Company.findOne({ name: "Default Institution" });
    if (!defaultCompany) {
      defaultCompany = await Company.create({
        name: "Default Institution",
        mode: "corporate",
        subscriptionStatus: "trial",
      });
    }

    const result = await User.updateMany(
      { $or: [{ company: null }, { company: { $exists: false } }] },
      { $set: { company: defaultCompany._id, isApproved: true } }
    );

    res.json({
      message: `Migrated ${result.modifiedCount} orphan users to Default Institution`,
      migrated: result.modifiedCount,
      institutionCode: defaultCompany.institutionCode,
    });
  } catch (error) {
    console.error("Migration error:", error);
    res.status(500).json({ error: "Migration failed" });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { indexNumber, institutionCode } = req.body;

    if (!indexNumber || !institutionCode) {
      return res.status(400).json({ error: "Student ID and institution code are required" });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) {
      return res.status(404).json({ error: "Institution not found" });
    }

    const user = await User.findOne({ indexNumber, company: company._id, role: "student" });
    if (!user) {
      return res.status(404).json({ error: "Student not found" });
    }

    if (user.resetPasswordExpires && user.resetPasswordExpires > Date.now()) {
      return res.status(429).json({ error: "A reset code was already generated" });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const hashedCode = await bcrypt.hash(code, 10);

    user.resetPasswordToken = hashedCode;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    res.json({
      message: "Password reset code generated. Please contact your lecturer to get the reset code.",
      resetCode: code,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Failed to generate reset code" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { indexNumber, resetCode, newPassword, institutionCode } = req.body;

    if (!indexNumber || !resetCode || !newPassword) {
      return res.status(400).json({ error: "Student ID, reset code, and new password are required" });
    }

    const filter = {
      indexNumber,
      resetPasswordExpires: { $gt: Date.now() },
    };

    if (institutionCode) {
      const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
      if (company) filter.company = company._id;
    }

    const user = await User.findOne(filter).select("+password");

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    const isValid = await bcrypt.compare(resetCode, user.resetPasswordToken);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid reset code" });
    }

    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
};
