const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Company = require("../models/Company");
const StudentRoster = require("../models/StudentRoster");
const { generateToken } = require("../utils/jwt");
const { sendWelcome, sendAdminPasswordResetNotice, sendPasswordReset, sendNewInstitutionAlert, sendLecturerWelcome, sendStudentWelcome, sendEmployeeWelcome, sendHodWelcome } = require("../services/emailService");
const { sendOtp, normalisePhone } = require("../services/smsService");

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

exports.register = async (req, res) => {
  try {
    const { email, password, name, companyName, mode, phone } = req.body;

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

    if (phone) {
      const normPhone = normalisePhone(phone);
      const phoneExists = await User.findOne({ phone: normPhone });
      if (phoneExists) {
        await Company.findByIdAndDelete(company._id);
        return res.status(400).json({ error: "Phone number is already in use" });
      }
    }

    let user;
    try {
      user = await User.create({
        email,
        password,
        name,
        phone: phone ? normalisePhone(phone) : null,
        company: company._id,
        role: "admin",
        isApproved: true,
      });
    } catch (userError) {
      await Company.findByIdAndDelete(company._id);
      throw userError;
    }

    const token = generateToken(user._id);

    // Send welcome email (non-fatal)
    sendWelcome({
      email:           user.email,
      name:            user.name || user.email.split('@')[0],
      institutionName: company.name,
      trialDays:       14,
      trialEndDate:    company.trialEndDate,
    }).catch(err => console.error('Welcome email failed:', err.message));

    // Notify superadmin of new signup (non-fatal)
    sendNewInstitutionAlert({
      institutionName: company.name,
      adminName:       user.name,
      adminEmail:      user.email,
      mode:            company.mode,
      institutionCode: company.institutionCode,
    }).catch(err => console.error('Superadmin alert failed:', err.message));

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        mustChangePassword: user.mustChangePassword || false,
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
      if (Object.keys(error.keyPattern || {}).includes("phone")) return res.status(400).json({ error: "Phone number is already in use" });
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

      if (req.body.phone) {
        const normPhone = normalisePhone(req.body.phone);
        const phoneExists = await User.findOne({ phone: normPhone, company: company._id });
        if (phoneExists) {
          await Company.findByIdAndDelete(company._id);
          return res.status(400).json({ error: "Phone number is already in use" });
        }
      }

      let user;
      try {
        user = await User.create({
          email,
          password,
          name,
          phone: req.body.phone ? normalisePhone(req.body.phone) : null,
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
        mustChangePassword: user.mustChangePassword || false,
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
    if (!department?.trim()) {
      return res.status(400).json({ error: "Department is required. Please enter the department you teach in." });
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

    if (req.body.phone) {
      const normPhone = normalisePhone(req.body.phone);
      const phoneExists = await User.findOne({ phone: normPhone, company: company._id });
      if (phoneExists) return res.status(400).json({ error: "Phone number is already in use" });
    }

    const user = await User.create({
      name,
      email,
      password,
      phone: req.body.phone ? normalisePhone(req.body.phone) : null,
      company: company._id,
      role: "lecturer",
      isApproved: false,
      department: department || null,
    });

    // If a department was specified, notify the HOD of that department
    if (department) {
      try {
        const hod = await User.findOne({ company: company._id, role: "hod", department: department.trim() });
        if (hod) {
          // Store a pending notification count on HOD (simple increment via a temp field)
          await User.updateOne({ _id: hod._id }, { $inc: { pendingApprovals: 1 } });
        }
      } catch (_) {} // non-critical
    }

    // Send welcome email (non-fatal)
    if (user.email) {
      sendLecturerWelcome({
        email: user.email,
        name: user.name,
        institutionName: company.name,
        department: department || null,
        isApproved: false,
      }).catch(err => console.error('Lecturer welcome email failed:', err.message));
    }

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        mustChangePassword: user.mustChangePassword || false,
        company: { id: company._id, name: company.name, mode: company.mode },
      },
      message: department
        ? "Registration successful. Your HOD and institution admin will review your account."
        : "Registration successful. Your account is pending admin approval.",
    });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    if (error.code === 11000) {
      if (Object.keys(error.keyPattern || {}).includes("phone")) return res.status(400).json({ error: "Phone number is already in use" });
      return res.status(400).json({ error: "This email is already registered at this institution" });
    }
    console.error("Lecturer register error:", error);
    res.status(500).json({ error: "Lecturer registration failed" });
  }
};

exports.registerStudent = async (req, res) => {
  try {
    const { name, indexNumber, password, institutionCode, department, email } = req.body;

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

    if (req.body.phone) {
      const normPhone = normalisePhone(req.body.phone);
      const phoneExists = await User.findOne({ phone: normPhone, company: company._id });
      if (phoneExists) return res.status(400).json({ error: "Phone number is already in use" });
    }

    const user = await User.create({
      name,
      indexNumber: indexNumber.trim().toUpperCase(),
      password,
      phone: req.body.phone ? normalisePhone(req.body.phone) : null,
      email: email ? email.trim().toLowerCase() : null,
      company: company._id,
      role: "student",
      isApproved: true,
      department: department ? department.trim() : null,
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

    // Warn if no HOD exists for the student's department
    let departmentNote = null;
    if (department?.trim()) {
      const hod = await User.findOne({ company: company._id, role: "hod", department: department.trim() });
      if (!hod) {
        departmentNote = `No Head of Department found for "${department.trim()}". Your institution admin may not have set one up yet.`;
      }
    }

    res.status(201).json({
      user: {
        id: user._id,
        indexNumber: user.indexNumber,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        mustChangePassword: user.mustChangePassword || false,
        company: { id: company._id, name: company.name, mode: company.mode },
      },
      token,
      departmentNote,
      message: "Registration successful. You have been automatically enrolled in your courses.",
    });

    // Send welcome email if student has email (non-fatal)
    if (user.email) {
      sendStudentWelcome({
        email: user.email,
        name: user.name,
        institutionName: company.name,
        indexNumber: user.indexNumber,
      }).catch(err => console.error('Student welcome email failed:', err.message));
    }
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    if (error.code === 11000) {
      if (Object.keys(error.keyPattern || {}).includes("phone")) return res.status(400).json({ error: "Phone number is already in use" });
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

    if (req.body.phone) {
      const normPhone = normalisePhone(req.body.phone);
      const phoneExists = await User.findOne({ phone: normPhone, company: company._id });
      if (phoneExists) return res.status(400).json({ error: "Phone number is already in use" });
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
      phone: req.body.phone ? normalisePhone(req.body.phone) : null,
      company: company._id,
      role: "employee",
      employeeId,
      isApproved: false,
    });

    // Send welcome email (non-fatal)
    sendEmployeeWelcome({
      email: user.email,
      name: user.name,
      companyName: company.name,
      employeeId: user.employeeId,
    }).catch(err => console.error('Employee welcome email failed:', err.message));

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
        isApproved: user.isApproved,
        mustChangePassword: user.mustChangePassword || false,
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
      if (Object.keys(error.keyPattern || {}).includes("phone")) return res.status(400).json({ error: "Phone number is already in use" });
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
    } else if (email && loginRole === "lecturer") {
      // Scope lecturer login to academic companies only — prevents cross-company email collision
      const CompanyModel = require("../models/Company");
      const academicIds = await CompanyModel.find({ mode: "academic" }, "_id").lean().then(cs => cs.map(c => c._id));
      user = await User.findOne({ email, company: { $in: academicIds }, role: "lecturer" }).select("+password");
    } else if (email && loginRole === "hod") {
      const CompanyModel = require("../models/Company");
      const academicIds = await CompanyModel.find({ mode: "academic" }, "_id").lean().then(cs => cs.map(c => c._id));
      user = await User.findOne({ email, company: { $in: academicIds }, role: "hod" }).select("+password");
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
      // Don't reveal which portal is correct — generic error
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // ── Role-portal enforcement ──────────────────────────────────────────────
    // Each portal only accepts specific roles — prevents admins logging in as
    // lecturers, employees logging in as admins, etc.
    const PORTAL_ALLOWED_ROLES = {
      admin:    ["admin", "superadmin", "manager"],
      lecturer: ["lecturer"],
      hod:      ["hod"],
      employee: ["employee"],
      student:  ["student"],
    };
    if (loginRole && PORTAL_ALLOWED_ROLES[loginRole]) {
      const allowed = PORTAL_ALLOWED_ROLES[loginRole];
      // Wrong portal — return same error as wrong password (don't reveal account exists)
      if (!allowed.includes(user.role)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    if (company && !company.hasAccess && !["superadmin", "admin", "manager"].includes(user.role)) {
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

    // ── Student device lock ─────────────────────────────────────────────────
    // Students are locked to a single device. If they log in from a new device
    // their account is blocked until an admin clears the device lock.
    if (user.role === "student" && deviceId && user.deviceId && user.deviceId !== deviceId) {
      return res.status(403).json({
        error: "This account is active on another device. Please contact your admin to unlock it.",
        deviceLocked: true,
      });
    }

    // Update lastLoginAt and deviceId
    user.lastLoginAt = new Date();
    if (deviceId) user.deviceId = deviceId;
    await user.save();

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
        department: user.department || null,
        profilePhoto: user.profilePhoto || null,
        isApproved: user.isApproved,
        mustChangePassword: user.mustChangePassword || false,
        company: company ? {
          id: company._id,
          name: company.name,
          mode: company.mode,
          institutionCode: company.institutionCode,
        } : null,
        deviceId: user.deviceId,
        lastLoginAt: user.lastLoginAt,
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

    // Send to student email if available, otherwise give code to lecturer
    let message = "Password reset code generated. Please contact your lecturer to get the reset code.";
    if (user.email) {
      const companyData = await Company.findById(user.company).select("name").lean().catch(() => null);
      sendPasswordReset({
        email: user.email,
        name: user.name,
        resetCode: code,
        role: "student",
        institutionName: companyData?.name || "",
      }).catch(err => console.error("[ForgotPassword] Email failed:", err.message));
      message = "A reset code has been sent to your email address.";
    }

    res.json({
      message,
      resetCode: user.email ? undefined : code, // only expose code to lecturer if no email
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
    if (!user.passwordResetLog) user.passwordResetLog = [];
    user.passwordResetLog.push({
      resetAt: new Date(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      method: 'self',
      resetBy: user.name || user.indexNumber,
    });
    await user.save();

    // Notify admin of student reset (non-fatal)
    try {
      const Company = require('../models/Company');
      const admin = await require('../models/User').findOne({
        company: user.company,
        role: { $in: ['admin', 'manager'] },
        isActive: true,
      }).select('email name').lean();
      const company = await Company.findById(user.company).select('name').lean();
      if (admin?.email) {
        sendAdminPasswordResetNotice({
          adminEmail: admin.email,
          adminName: admin.name || 'Admin',
          targetUserName: user.name || user.indexNumber,
          targetUserRole: user.role,
          targetUserEmail: user.email || user.indexNumber,
          institutionName: company?.name || '',
        }).catch(() => {});
      }
    } catch(_) {}

    res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

exports.forgotPasswordEmail = async (req, res) => {
  try {
    const { phone, email, institutionCode } = req.body;
    if (!phone && !email) return res.status(400).json({ error: "Phone number or email is required" });
    if (!institutionCode) return res.status(400).json({ error: "Institution code is required" });

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) return res.status(404).json({ error: "Institution not found. Please check your institution code." });

    let user = null;
    if (phone) {
      const normPhone = normalisePhone(phone);
      user = await User.findOne({ phone: normPhone, company: company._id })
          || await User.findOne({ phone: phone.trim(), company: company._id });
    }
    if (!user && email) {
      user = await User.findOne({ email: email.trim().toLowerCase(), company: company._id });
    }

    if (!user) return res.status(404).json({ error: "No account found with those details in this institution." });

    if (["admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ error: "Invalid input" });
    }
    if (user.role === "student") {
      return res.status(403).json({ error: "Invalid input" });
    }
    if (!["manager", "lecturer", "employee"].includes(user.role)) {
      return res.status(403).json({ error: "Invalid input" });
    }
    if (user.resetPasswordExpires && user.resetPasswordExpires > Date.now() && (user.resetPasswordExpires - Date.now()) > 59 * 60 * 1000) {
      return res.status(429).json({ error: "A reset code was already sent. Please check your phone or wait 1 minute before trying again." });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const hashedCode = await bcrypt.hash(code, 10);
    user.resetPasswordToken = hashedCode;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    let smsSent = false;
    let emailSent = false;

    // Send SMS if phone was provided
    if (phone) {
      const normPhone = normalisePhone(phone);
      const smsResult = await sendOtp({ phone: normPhone, code, name: user.name });
      if (smsResult.ok || smsResult.dev) {
        smsSent = true;
        console.log(`[ForgotPasswordEmail] OTP sent via SMS to ${normPhone}`);
      } else {
        console.error('[ForgotPasswordEmail] SMS failed:', smsResult.error);
      }
    }

    // Send email if user has email
    if (user.email) {
      const companyData = await Company.findById(user.company).select('name').lean().catch(() => null);
      try {
        await sendPasswordReset({
          email: user.email,
          name: user.name,
          resetCode: code,
          role: user.role,
          institutionName: companyData?.name || '',
        });
        emailSent = true;
        console.log(`[ForgotPasswordEmail] OTP sent via email to ${user.email}`);
      } catch(err) {
        console.error('[ForgotPasswordEmail] Email send failed:', err.message);
      }
    }

    if (!smsSent && !emailSent) {
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ error: "Failed to send reset code. Please try again." });
    }

    const channel = smsSent && emailSent ? 'your phone and email'
      : smsSent ? 'your phone via SMS'
      : 'your email';
    res.json({ message: `A reset code has been sent to ${channel}.` });
  } catch (error) {
    console.error("Forgot password email error:", error);
    res.status(500).json({ error: "Failed to generate reset code" });
  }
};

exports.forgotPasswordAdmin = async (req, res) => {
  try {
    const { phone, email } = req.body;
    if (!phone && !email) return res.status(400).json({ error: "Phone number or email is required" });

    let user = null;
    if (phone) {
      const normPhone = normalisePhone(phone);
      user = await User.findOne({ phone: normPhone }).populate("company", "name")
          || await User.findOne({ phone: phone.trim() }).populate("company", "name");
    }
    if (!user && email) {
      user = await User.findOne({ email: email.trim().toLowerCase(), role: { $in: ["admin", "manager"] } }).populate("company", "name");
    }

    if (!user) return res.status(404).json({ error: "No account found with those details." });

    if (user.role === "lecturer") {
      return res.status(403).json({ error: "Invalid input" });
    }
    if (["employee", "manager"].includes(user.role)) {
      return res.status(403).json({ error: "Invalid input" });
    }
    if (!["admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ error: "This reset method is for admins only." });
    }
    if (user.resetPasswordExpires && user.resetPasswordExpires > Date.now() && (user.resetPasswordExpires - Date.now()) > 59 * 60 * 1000) {
      return res.status(429).json({ error: "A reset code was already sent. Please check your phone or wait 1 minute before trying again." });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const hashedCode = await bcrypt.hash(code, 10);
    user.resetPasswordToken = hashedCode;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const normPhone = phone ? normalisePhone(phone) : null;
    let smsSent = false;
    let emailSent = false;

    // Send SMS if phone provided
    if (normPhone) {
      const smsResult = await sendOtp({ phone: normPhone, code, name: user.name });
      if (smsResult.ok || smsResult.dev) {
        smsSent = true;
        console.log(`[ForgotPasswordAdmin] OTP sent via SMS to ${normPhone}`);
      } else {
        console.error('[ForgotPasswordAdmin] SMS failed:', smsResult.error);
      }
    }

    // Send email if user has email
    if (user.email) {
      const companyData = user.company;
      try {
        await sendPasswordReset({
          email: user.email,
          name: user.name,
          resetCode: code,
          role: user.role,
          institutionName: companyData?.name || '',
        });
        emailSent = true;
        console.log(`[ForgotPasswordAdmin] OTP sent via email to ${user.email}`);
      } catch(err) {
        console.error('[ForgotPasswordAdmin] Email send failed:', err.message);
      }
    }

    if (!smsSent && !emailSent) {
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ error: "Failed to send reset code. Please try again." });
    }

    const channel = smsSent && emailSent ? 'your phone and email'
      : smsSent ? 'your phone via SMS'
      : 'your email';
    res.json({ message: `A 6-digit reset code has been sent to ${channel}.` });
  } catch (error) {
    console.error("Forgot password admin error:", error);
    res.status(500).json({ error: "Failed to generate reset code" });
  }
};

exports.resetPasswordEmail = async (req, res) => {
  try {
    const { phone, email, resetCode, newPassword } = req.body;
    if ((!phone && !email) || !resetCode || !newPassword) {
      return res.status(400).json({ error: "Phone or email, reset code, and new password are required" });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    let user = null;
    if (phone) {
      const normPhone = normalisePhone(phone);
      user = await User.findOne({
        phone: { $in: [normPhone, phone.trim()] },
        resetPasswordExpires: { $gt: Date.now() },
      }).select("+password");
    }
    if (!user && email) {
      user = await User.findOne({
        email: email.trim().toLowerCase(),
        resetPasswordExpires: { $gt: Date.now() },
      }).select("+password");
    }

    if (!user) return res.status(400).json({ error: "Invalid or expired reset code" });

    const isValid = await bcrypt.compare(resetCode, user.resetPasswordToken);
    if (!isValid) return res.status(400).json({ error: "Incorrect reset code" });

    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    if (!user.passwordResetLog) user.passwordResetLog = [];
    user.passwordResetLog.push({
      resetAt: new Date(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      method: 'self',
      resetBy: user.name || user.email,
    });
    await user.save();

    // Notify admin of the reset (non-fatal)
    try {
      const Company = require('../models/Company');
      const admin = await require('../models/User').findOne({
        company: user.company,
        role: { $in: ['admin', 'manager'] },
        isActive: true,
        email: { $exists: true, $ne: user.email },
      }).select('email name').lean();
      const company = await Company.findById(user.company).select('name').lean();
      if (admin?.email) {
        sendAdminPasswordResetNotice({
          adminEmail: admin.email,
          adminName: admin.name || 'Admin',
          targetUserName: user.name || user.email,
          targetUserRole: user.role,
          targetUserEmail: user.email || user.indexNumber,
          institutionName: company?.name || '',
        }).catch(() => {});
      }
    } catch(_) {}

    res.json({ message: "Password reset successfully. You can now sign in." });
  } catch (error) {
    console.error("Reset password email error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
};


// ── 2FA: Toggle enable/disable ───────────────────────────────────────────────
exports.toggle2FA = async (req, res) => {
  try {
    const { enable } = req.body;
    await User.findByIdAndUpdate(req.user._id, { twoFactorEnabled: !!enable });
    res.json({ ok: true, twoFactorEnabled: !!enable });
  } catch(e) {
    res.status(500).json({ error: "Failed to update 2FA setting" });
  }
};

// ── 2FA: Send code after password verification ───────────────────────────────
exports.send2FACode = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user?.email) return res.status(400).json({ error: "No email on file for 2FA" });

    const code = String(crypto.randomInt(100000, 999999));
    const hashedCode = await bcrypt.hash(code, 10);
    user.twoFactorCode = hashedCode;
    user.twoFactorExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    await user.save({ validateBeforeSave: false });

    const { sendPasswordReset } = require("../services/emailService");
    await sendPasswordReset({
      email: user.email,
      name: user.name,
      resetCode: code,
      role: user.role,
      institutionName: "Two-Factor Authentication",
    });

    res.json({ ok: true, message: "2FA code sent to your email" });
  } catch(e) {
    console.error("2FA send error:", e);
    res.status(500).json({ error: "Failed to send 2FA code" });
  }
};

// ── 2FA: Verify code ─────────────────────────────────────────────────────────
exports.verify2FACode = async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user._id).select("+twoFactorCode +twoFactorExpires");
    if (!user?.twoFactorCode) return res.status(400).json({ error: "No 2FA code pending" });
    if (user.twoFactorExpires < new Date()) return res.status(400).json({ error: "Code expired. Please sign in again." });

    const isValid = await bcrypt.compare(code, user.twoFactorCode);
    if (!isValid) return res.status(400).json({ error: "Incorrect code" });

    // Clear the code
    user.twoFactorCode = null;
    user.twoFactorExpires = null;
    await user.save({ validateBeforeSave: false });

    // Issue a fresh full token
    const token = generateToken(user._id);
    res.json({ ok: true, token });
  } catch(e) {
    console.error("2FA verify error:", e);
    res.status(500).json({ error: "Verification failed" });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, currentPassword, newPassword, department, profilePhoto } = req.body;
    const user = await User.findById(req.user._id).select("+password");
    if (!user) return res.status(404).json({ error: "User not found" });

    if (name && name.trim()) user.name = name.trim();

    // Profile photo — store as base64 (max ~2MB)
    if (profilePhoto !== undefined) {
      if (profilePhoto && profilePhoto.length > 2 * 1024 * 1024 * 1.4) {
        return res.status(400).json({ error: "Profile photo must be under 2MB" });
      }
      user.profilePhoto = profilePhoto || null;
    }

    // Allow lecturer/hod to update their own department
    if (department !== undefined && ["lecturer", "hod"].includes(user.role)) {
      if (user.role === "hod" && department.trim()) {
        // Ensure no other HOD has this dept
        const clash = await User.findOne({
          company: user.company,
          role: "hod",
          department: department.trim(),
          _id: { $ne: user._id },
        });
        if (clash) {
          return res.status(400).json({ error: `"${department.trim()}" already has an HOD (${clash.name}).` });
        }
      }
      user.department = department.trim() || null;
    }

    if (newPassword) {
      if (!currentPassword) return res.status(400).json({ error: "Current password is required to set a new password" });
      if (newPassword.length < 8) return res.status(400).json({ error: "New password must be at least 8 characters" });
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return res.status(401).json({ error: "Current password is incorrect" });
      user.password = newPassword;
    }

    await user.save();
    res.json({ message: "Profile updated successfully", user: { name: user.name, email: user.email, role: user.role, department: user.department, profilePhoto: user.profilePhoto || null } });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
};
