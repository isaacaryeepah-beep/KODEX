const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Company = require("../models/Company");
const PlatformSettings = require("../models/PlatformSettings");
const StudentRoster = require("../models/StudentRoster");
const MeetingIdentity = require("../models/MeetingIdentity");
const { generateToken, generateRefreshToken, verifyRefreshToken } = require("../utils/jwt");
const { sendWelcome, sendAdminPasswordResetNotice, sendPasswordReset, sendNewInstitutionAlert, sendLecturerWelcome, sendEmployeeWelcome, sendHodWelcome } = require("../services/emailService");
const { sendOtp, normalisePhone } = require("../services/smsService");
const { syncStudentToRoster } = require("../utils/rosterSync");

const MODERATOR_ROLES = ['admin', 'lecturer', 'manager', 'hod', 'superadmin'];

async function createMeetingIdentity(user, companyId) {
  try {
    const initials = (user.name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(w => w[0].toUpperCase())
      .join('');
    await MeetingIdentity.create({
      userId:      user._id,
      company:     companyId,
      displayName: user.name,
      role:        user.role,
      isModerator: MODERATOR_ROLES.includes(user.role),
      jitsiUserId: `${user.role}_${user._id}`,
      initials,
    });
  } catch (e) {
    // Non-fatal — identity can be created lazily on first join
    console.error('[MeetingIdentity] auto-create failed:', e.message);
  }
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const PAID_ROLES         = ["lecturer", "manager", "admin", "hod"];
const ALL_PAID_ROLES     = ["lecturer", "manager", "admin", "hod", "student", "employee"];
const TRIAL_DAYS         = 30;
const STUDENT_TRIAL_DAYS = 45;
const SEMESTER_DAYS      = 112;

async function getTrialDays() {
  try {
    const s = await PlatformSettings.findOne().lean();
    return (s?.trialDays > 0) ? s.trialDays : TRIAL_DAYS;
  } catch {
    return TRIAL_DAYS;
  }
}

async function getStudentTrialDays() {
  try {
    const s = await PlatformSettings.findOne().lean();
    return (s?.studentTrialDays > 0) ? s.studentTrialDays : STUDENT_TRIAL_DAYS;
  } catch {
    return STUDENT_TRIAL_DAYS;
  }
}

function computeUserTrial(user, company, fallbackTrialDays) {
  const now = Date.now();
  const subEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
  const inSub  = !!(subEnd && subEnd > now);

  if (user.role === 'student') {
    const trialEnd = user.trialEndDate
      ? new Date(user.trialEndDate)
      : new Date(new Date(user.createdAt).getTime() + STUDENT_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const inTrial = trialEnd > now;
    const activeEnd = inSub ? subEnd : inTrial ? trialEnd : null;
    const daysLeft = activeEnd ? Math.max(0, Math.ceil((activeEnd - now) / 86400000)) : 0;
    return { daysLeft, activeEnd, status: inSub ? 'active' : inTrial ? 'trial' : 'expired', isSubscribed: inSub, plan: 'student_semester' };
  }

  if (user.role === 'employee') {
    if (inSub) {
      const daysLeft = Math.max(0, Math.ceil((subEnd - now) / 86400000));
      return { daysLeft, activeEnd: subEnd, status: 'active', isSubscribed: true, plan: 'employee_monthly' };
    }
    // Fall back to company trial
    const cEnd = company?.trialEndDate ? new Date(company.trialEndDate) : null;
    const cActive = !!(company?.subscriptionActive || (cEnd && cEnd > now));
    const daysLeft = cActive
      ? (company?.subscriptionActive ? 999 : Math.max(0, Math.ceil((cEnd - now) / 86400000)))
      : 0;
    return { daysLeft, activeEnd: cEnd, status: cActive ? 'trial' : 'expired', isSubscribed: false, plan: 'employee_monthly', coveredByCompany: cActive };
  }

  // lecturer / manager / admin (original logic)
  const trialEnd = user.trialEndDate
    ? new Date(user.trialEndDate)
    : new Date(new Date(user.createdAt).getTime() + (fallbackTrialDays || TRIAL_DAYS) * 24 * 60 * 60 * 1000);
  const activeEnd = inSub ? subEnd : trialEnd;
  const daysLeft  = Math.max(0, Math.ceil((activeEnd - now) / 86400000));
  return { daysLeft, activeEnd, status: inSub ? 'active' : trialEnd > now ? 'trial' : 'expired', isSubscribed: inSub };
}

exports.register = async (req, res) => {
  try {
    let { password, mode, phone } = req.body;
    const name        = req.body.name        ? req.body.name.trim()        : req.body.name;
    const companyName = req.body.companyName ? req.body.companyName.trim() : req.body.companyName;
    const email       = req.body.email       ? req.body.email.trim().toLowerCase() : null;

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

    const trialDays = await getTrialDays();
    const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    const company = await Company.create({
      name: companyName,
      mode: companyMode,
      subscriptionStatus: "trial",
      trialEndDate,
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
        trialEndDate,
        subscriptionStatus: "trial",
      });
    } catch (userError) {
      await Company.findByIdAndDelete(company._id);
      throw userError;
    }

    const token        = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Auto-create Jitsi meeting identity for the new admin
    await createMeetingIdentity(user, company._id);

    sendWelcome({
      email:           user.email,
      name:            user.name || user.email.split('@')[0],
      institutionName: company.name,
      trialDays:       trialDays,
      trialEndDate:    company.trialEndDate,
    }).catch(err => console.error('Welcome email failed:', err.message));

    sendNewInstitutionAlert({
      institutionName: company.name,
      adminName:       user.name,
      adminEmail:      user.email,
      mode:            company.mode,
      institutionCode: company.institutionCode,
    }).catch(err => console.error('Superadmin alert failed:', err.message));

    res.status(201).json({
      token,
      refreshToken,
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
    const { password, institutionCode, institutionName } = req.body;
    const name       = req.body.name       ? req.body.name.trim()       : req.body.name;
    const email      = req.body.email      ? req.body.email.trim().toLowerCase() : "";
    const department = req.body.department ? req.body.department.trim() : req.body.department;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Name, email, and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Lecturer joins an existing institution
    if (!institutionCode) {
      return res.status(400).json({ error: "Institution code is required" });
    }
    if (!department?.trim()) {
      return res.status(400).json({ error: "Department is required. Please enter the department you teach in." });
    }

    const trialDays = await getTrialDays();
    const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase(), mode: "academic" });
    if (!company) {
      return res.status(404).json({ error: "Institution not found. Please check your institution code." });
    }

    if (!company.isActive) {
      return res.status(403).json({ error: "This institution is currently inactive." });
    }

    if (!department?.trim()) {
      return res.status(400).json({ error: "Department is required." });
    }
    const hod = await User.findOne({
      company: company._id,
      role: "hod",
      department: { $regex: new RegExp(`^${department.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      isApproved: true,
    });
    if (!hod) {
      return res.status(400).json({
        error: `No approved HOD found for "${department.trim()}". A Head of Department must be set up for this department before lecturers can join it.`,
      });
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
      department: department.trim(),
      trialEndDate,
      subscriptionStatus: "trial",
    });

    try {
      await User.updateOne({ _id: hod._id }, { $inc: { pendingApprovals: 1 } });
    } catch (_) {}

    // Auto-create Jitsi meeting identity for the new lecturer
    await createMeetingIdentity(user, company._id);

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
    const { password, institutionCode, studentLevel, studentGroup, sessionType, semester } = req.body;
    const name        = req.body.name        ? req.body.name.trim()        : req.body.name;
    const email       = req.body.email       ? req.body.email.trim().toLowerCase() : "";
    const department  = req.body.department  ? req.body.department.trim()  : req.body.department;
    const programme   = req.body.programme   ? req.body.programme.trim()   : req.body.programme;
    const phone = req.body.phone ? req.body.phone.trim() : "";
    const IndexNumber = req.body.IndexNumber || req.body.indexNumber;

    if (!name || !IndexNumber || !password || !institutionCode) {
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

    // HOD-first enforcement
    if (department?.trim()) {
      const hodExists = await User.findOne({
        company: company._id,
        role: "hod",
        department: { $regex: new RegExp(`^${department.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
        isApproved: true,
      });
      if (!hodExists) {
        return res.status(400).json({
          error: `No approved HOD found for "${department.trim()}". A Head of Department must be set up for this department before students can join it.`,
        });
      }
    }

    const rosterEntry = await StudentRoster.findOne({
      studentId: IndexNumber.trim().toUpperCase(),
      company: company._id,
    });

    if (!rosterEntry) {
      return res.status(403).json({
        error: "Your Student ID was not found in any class roster. Your lecturer must add your Student ID to a class before you can register.",
      });
    }

    const existingStudent = await User.findOne({ IndexNumber: IndexNumber.trim().toUpperCase(), company: company._id });
    if (existingStudent) {
      return res.status(400).json({ error: "A student with this ID already exists at this institution" });
    }

    const studentTrialDays = await getStudentTrialDays();
    const studentTrialEnd  = new Date(Date.now() + studentTrialDays * 24 * 60 * 60 * 1000);

    const user = await User.create({
      name,
      IndexNumber: IndexNumber.trim().toUpperCase(),
      password,
      company: company._id,
      role: "student",
      isApproved: false,
      department: department ? department.trim() : null,
      programme: programme ? programme.trim() : null,
      studentLevel: studentLevel ? studentLevel.trim() : null,
      studentGroup: studentGroup ? studentGroup.trim().toUpperCase() : null,
      sessionType: sessionType ? sessionType.trim() : null,
      semester: semester ? semester.trim() : null,
      trialEndDate:       studentTrialEnd,
      subscriptionStatus: 'trial',
    });

    // Welcome email is sent when the account is approved, not at registration.
    return res.status(201).json({
      message: "Registration successful! Your account is pending approval. Your HOD or admin will review and approve your account before you can sign in.",
    });
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
    const { password, institutionCode } = req.body;
    const name  = req.body.name  ? req.body.name.trim()  : req.body.name;
    const email = req.body.email ? req.body.email.trim().toLowerCase() : "";

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

exports.registerManager = async (req, res) => {
  try {
    const { password, institutionCode, phone } = req.body;
    const name  = req.body.name  ? req.body.name.trim()  : req.body.name;
    const email = req.body.email ? req.body.email.trim().toLowerCase() : "";

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
      return res.status(400).json({ error: "An account with this email already exists at this company" });
    }

    if (phone) {
      const normPhone = normalisePhone(phone);
      const phoneExists = await User.findOne({ phone: normPhone, company: company._id });
      if (phoneExists) return res.status(400).json({ error: "Phone number is already in use" });
    }

    const user = await User.create({
      name,
      email,
      password,
      phone: phone ? normalisePhone(phone) : null,
      company: company._id,
      role: "manager",
      isApproved: false,
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
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: "This email is already registered at this company" });
    }
    console.error("Manager register error:", error);
    res.status(500).json({ error: "Manager registration failed" });
  }
};

exports.registerHod = async (req, res) => {
  try {
    const { password, institutionCode, phone } = req.body;
    const name       = req.body.name       ? req.body.name.trim()       : req.body.name;
    const email      = req.body.email      ? req.body.email.trim().toLowerCase() : '';
    const department = req.body.department ? req.body.department.trim() : req.body.department;

    if (!name || !email || !password || !institutionCode || !department) {
      return res.status(400).json({ error: 'Name, email, password, institution code and department are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase(), mode: 'academic' });
    if (!company) {
      return res.status(404).json({ error: 'Institution not found. Please check your institution code.' });
    }
    if (!company.isActive) {
      return res.status(403).json({ error: 'This institution is currently inactive.' });
    }

    const existingUser = await User.findOne({ email, company: company._id });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists at this institution' });
    }

    const existingHod = await User.findOne({ company: company._id, role: 'hod', department: { $regex: new RegExp(`^${department.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    if (existingHod) {
      return res.status(400).json({ error: `A HOD for "${department.trim()}" already exists. Contact your admin.` });
    }

    if (phone) {
      const normPhone = normalisePhone(phone);
      const phoneExists = await User.findOne({ phone: normPhone, company: company._id });
      if (phoneExists) return res.status(400).json({ error: 'Phone number is already in use' });
    }

    const trialDays = await getTrialDays();
    const trialEndDate = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

    const user = await User.create({
      name,
      email,
      password,
      phone: phone ? normalisePhone(phone) : null,
      company: company._id,
      role: 'hod',
      department: department.trim(),
      isApproved: false,
      trialEndDate,
      subscriptionStatus: 'trial',
    });

    // Auto-create Jitsi meeting identity for the new HOD
    await createMeetingIdentity(user, company._id);

    if (user.email) {
      sendHodWelcome({
        email: user.email,
        name: user.name,
        institutionName: company.name,
        department: department.trim(),
        isApproved: false,
      }).catch(err => console.error('HOD welcome email failed:', err.message));
    }

    res.status(201).json({
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        department: user.department,
        isApproved: user.isApproved,
        company: { id: company._id, name: company.name, mode: company.mode },
      },
      message: 'Registration successful. Your HOD account is pending admin approval.',
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ error: messages.join(', ') });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: 'This email is already registered at this institution' });
    }
    console.error('HOD register error:', error);
    res.status(500).json({ error: 'HOD registration failed' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email: emailRaw, password, deviceId, institutionCode, loginRole, portalMode } = req.body;
    const email = emailRaw ? emailRaw.trim().toLowerCase() : "";
    const IndexNumber = req.body.IndexNumber || req.body.indexNumber;

    if (!password) {
      return res.status(400).json({ error: "Password is required" });
    }

    if (!email && !IndexNumber) {
      return res.status(400).json({ error: "Email or student ID is required" });
    }

    let user;
    if (IndexNumber) {
      let companyId = null;
      if (institutionCode) {
        const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
        if (!company) {
          return res.status(401).json({ error: "Institution not found" });
        }
        companyId = company._id;
      }
      const normIndex = IndexNumber.trim().toUpperCase();
      const baseQuery = { role: "student", ...(companyId ? { company: companyId } : {}) };
      user = await User.findOne({ ...baseQuery, IndexNumber: normIndex }).select("+password");
      if (!user) {
        user = await User.findOne({ ...baseQuery, indexNumber: normIndex }).select("+password");
      }
    } else if (email && institutionCode && loginRole === "manager") {
      const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
      if (!company) {
        return res.status(401).json({ error: "Company not found" });
      }
      user = await User.findOne({ email, company: company._id, role: "manager" }).select("+password");
    } else if (email && institutionCode && loginRole === "employee") {
      const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
      if (!company) {
        return res.status(401).json({ error: "Company not found" });
      }
      user = await User.findOne({ email, company: company._id, role: "employee" }).select("+password");
    } else if (email && loginRole === "lecturer") {
      user = await User.findOne({ email, role: "lecturer" }).select("+password");
    } else if (email && loginRole === "hod") {
      user = await User.findOne({ email, role: "hod" }).select("+password");
    } else {
      user = await User.findOne({ email }).select("+password");
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Track failed attempts for all non-superadmin roles; lock after 5 consecutive failures
      if (user && user.role !== 'superadmin') {
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
        user.lastFailedLoginAt = new Date();
        if (user.failedLoginAttempts >= 5 && !user.isLocked) {
          user.isLocked = true;
          user.lockedAt = new Date();
          user.lockReason = user.role === 'employee'
            ? 'Account locked after 5 failed login attempts. Contact your manager or admin.'
            : user.role === 'student'
            ? 'Account locked after 5 failed login attempts. Contact your department HOD.'
            : 'Account locked after 5 failed login attempts. Contact your institution admin.';
        }
        await user.save().catch(() => {});
      }
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Reset failed login counter on successful credential check
    if (user.failedLoginAttempts > 0) {
      user.failedLoginAttempts = 0;
      user.lastFailedLoginAt = null;
      await user.save().catch(() => {});
    }

    if (!user.isApproved) {
      const msg = user.role === "student"
        ? "Your account is pending approval. Please wait for your HOD or admin to approve your registration."
        : "Your account is pending approval. Please contact your institution admin.";
      return res.status(403).json({ error: msg });
    }

    const company = await Company.findById(user.company);

    if (company && ["lecturer", "hod", "student"].includes(user.role) && company.mode !== "academic") {
      company.mode = "academic";
      await company.save().catch(() => {});
      console.log(`[LOGIN] Auto-corrected company mode to 'academic' for ${company.name}`);
    }

    if (portalMode && company && company.mode !== portalMode && user.role !== "superadmin") {
      const academicRoles = ["lecturer", "hod", "student"];
      const corporateRoles = ["employee", "manager"];
      const isRolePortalMismatch =
        (academicRoles.includes(user.role) && portalMode === "corporate") ||
        (corporateRoles.includes(user.role) && portalMode === "academic") ||
        user.role === "admin";
      if (isRolePortalMismatch) {
        return res.status(401).json({ error: "Incorrect email or password." });
      }
    }

    if (user.role === "superadmin" && loginRole !== "superadmin") {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const PORTAL_ALLOWED_ROLES = {
      admin:    ["admin"],
      manager:  ["manager"],
      lecturer: ["lecturer"],
      hod:      ["hod"],
      employee: ["employee"],
      student:  ["student"],
    };
    if (loginRole && PORTAL_ALLOWED_ROLES[loginRole]) {
      const allowed = PORTAL_ALLOWED_ROLES[loginRole];
      if (!allowed.includes(user.role)) {
        return res.status(401).json({ error: "Invalid credentials" });
      }
    }

    if (company && !company.hasAccess && !["superadmin", "admin", "manager", "lecturer"].includes(user.role)) {
      const activeSubscriber = await User.findOne({
        company: company._id,
        role: { $in: ["admin", "lecturer", "manager"] },
        subscriptionExpiry: { $gt: new Date() },
      }).select("_id").lean();

      if (!activeSubscriber) {
        return res.status(403).json({
          error: "Subscription inactive",
          message: "Your institution's subscription has expired. Please contact your admin.",
          subscriptionExpired: true,
        });
      }
    }

    if (['student', 'employee'].includes(user.role) && user.lastLogoutTime) {
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

    // ── Trusted-device check (students & employees only) ────────────────────
    // Login is always allowed. The 6-hour lock only blocks quiz/meeting/attendance
    // access (enforced by requireNoDeviceLock middleware), not the login itself.
    const now = new Date();
    const isLockableRole = ['student', 'employee'].includes(user.role);

    if (deviceId) {
      if (!Array.isArray(user.trustedDevices)) user.trustedDevices = [];

      // Lazy migration: seed trustedDevices from legacy single deviceId field
      if (user.trustedDevices.length === 0 && user.deviceId) {
        user.trustedDevices.push({
          deviceId:    user.deviceId,
          firstSeenAt: user.createdAt || now,
          lastSeenAt:  now,
          ipAddress:   null,
          userAgent:   null,
          platform:    null,
        });
      }

      const knownIdx = user.trustedDevices.findIndex(d => d.deviceId === deviceId);

      if (knownIdx >= 0) {
        // Recognised device — refresh metadata
        const td = user.trustedDevices[knownIdx];
        td.lastSeenAt = now;
        td.ipAddress  = req.ip || null;
        td.userAgent  = req.headers["user-agent"] || null;

        // Auto-clear an expired lock (students/employees only)
        if (isLockableRole && user.accountDeviceLock?.isLocked) {
          const expiry = user.accountDeviceLock.lockedUntil
            ? new Date(user.accountDeviceLock.lockedUntil) : null;
          if (!expiry || expiry <= now) {
            user.accountDeviceLock.isLocked = false;
          }
        }

      } else if (user.trustedDevices.length === 0) {
        // First device ever — add silently, no lock for any role
        user.trustedDevices.push({
          deviceId,
          firstSeenAt: now,
          lastSeenAt:  now,
          ipAddress:   req.ip || null,
          userAgent:   req.headers["user-agent"] || null,
          platform:    _detectPlatform(req.headers["user-agent"] || ""),
        });

      } else {
        // New device on existing account — track for all roles
        user.trustedDevices.push({
          deviceId,
          firstSeenAt: now,
          lastSeenAt:  now,
          ipAddress:   req.ip || null,
          userAgent:   req.headers["user-agent"] || null,
          platform:    _detectPlatform(req.headers["user-agent"] || ""),
        });

        // Immutable audit log entry
        if (!Array.isArray(user.newDeviceLogs)) user.newDeviceLogs = [];
        user.newDeviceLogs.push({
          deviceId,
          ipAddress:  req.ip || null,
          userAgent:  req.headers["user-agent"] || null,
          platform:   _detectPlatform(req.headers["user-agent"] || ""),
          detectedAt: now,
        });

        // 6-hour quiz/meeting lock — students and employees only
        if (isLockableRole) {
          user.accountDeviceLock = {
            isLocked:      true,
            lockedAt:      now,
            lockedUntil:   new Date(now.getTime() + SIX_HOURS_MS),
            triggerDevice: deviceId,
            knownDevice:   user.deviceId || null,
            unlockedBy:    null,
            unlockedAt:    null,
          };
        }
      }

      user.deviceId = deviceId;
    } else if (isLockableRole && user.accountDeviceLock?.isLocked) {
      // No deviceId sent — auto-clear expired lock for students/employees
      const expiry = user.accountDeviceLock.lockedUntil
        ? new Date(user.accountDeviceLock.lockedUntil) : null;
      if (!expiry || expiry <= now) {
        user.accountDeviceLock.isLocked = false;
      }
    }

    user.lastLoginAt = new Date();
    // deviceId is already set inside the trusted-device block above; only update here
    // when no fingerprint was provided (e.g. old clients or server-side calls)
    if (deviceId && !user.deviceId) user.deviceId = deviceId;
    await user.save({ validateModifiedOnly: true });

    const token        = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    res.json({
      token,
      refreshToken,
      user: {
        id: user._id,
        email: user.email,
        IndexNumber: user.IndexNumber,
        employeeId: user.employeeId,
        name: user.name,
        role: user.role,
        department: user.department || null,
        profilePhoto: user.profilePhoto || null,
        isApproved: user.isApproved,
        mustChangePassword: user.mustChangePassword || false,
        twoFactorEnabled: user.twoFactorEnabled || false,
        company: company ? {
          id: company._id,
          name: company.name,
          mode: company.mode,
          institutionCode: company.institutionCode,
        } : null,
        deviceId: user.deviceId,
        lastLoginAt: user.lastLoginAt,
        subscriptionExpiry: user.subscriptionExpiry || null,
        subscriptionStatus: user.subscriptionStatus || null,
        accountDeviceLock: user.accountDeviceLock?.isLocked ? {
          isLocked: true,
          lockedUntil: user.accountDeviceLock.lockedUntil,
          remainingMins: user.accountDeviceLock.lockedUntil
            ? Math.ceil((new Date(user.accountDeviceLock.lockedUntil) - Date.now()) / 60000)
            : null,
        } : null,
        trustedDeviceCount: user.trustedDevices?.length || 0,
        newDeviceDetected: user.accountDeviceLock?.isLocked &&
          user.accountDeviceLock?.lockedAt?.getTime() >= (Date.now() - 5000),
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
      userTrial: ALL_PAID_ROLES.includes(user.role) ? computeUserTrial(user, company, await getTrialDays()) : null,
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

exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ error: "Refresh token required" });
    const decoded = verifyRefreshToken(refreshToken);
    const token   = generateToken(decoded.id);
    const newRefreshToken = generateRefreshToken(decoded.id);
    res.json({ token, refreshToken: newRefreshToken });
  } catch (err) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
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
      userTrial: ALL_PAID_ROLES.includes(user.role) ? computeUserTrial(user, company, await getTrialDays()) : null,
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
    const IndexNumber = req.body.IndexNumber || req.body.indexNumber;
    const { institutionCode } = req.body;

    if (!IndexNumber || !institutionCode) {
      return res.status(400).json({ error: "Student ID and institution code are required" });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) {
      return res.status(404).json({ error: "Institution not found" });
    }

    const normIdx = IndexNumber.trim().toUpperCase();
    let user = await User.findOne({ IndexNumber: normIdx, company: company._id, role: "student" });
    if (!user) {
      user = await User.findOne({ indexNumber: normIdx, company: company._id, role: "student" });
    }
    if (!user) {
      return res.status(404).json({ error: "Student not found" });
    }

    if (user.resetPasswordExpires && user.resetPasswordExpires > Date.now()) {
      const remaining = new Date(user.resetPasswordExpires) - Date.now();
      const remainingMins = Math.ceil(remaining / 60000);
      if (remaining > 59 * 60 * 1000) {
        return res.status(429).json({ error: `A reset code was already sent. Please wait ${remainingMins} minutes or check your email.` });
      }
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const hashedCode = await bcrypt.hash(code, 10);

    user.resetPasswordToken = hashedCode;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    let message = "Password reset code generated. Please contact your lecturer to get the reset code.";
    if (user.email) {
      const companyData = await Company.findById(user.company).select("name").lean().catch(() => null);
      const emailResult = await sendPasswordReset({
        email: user.email,
        name: user.name,
        resetCode: code,
        role: "student",
        institutionName: companyData?.name || "",
      }).catch(err => ({ ok: false, error: err.message }));

      if (!emailResult || emailResult.ok === false) {
        const detail = emailResult?.error ? ` (${emailResult.error})` : '';
        console.error(`[ForgotPassword] Email failed for ${user.email}:${detail}`);
        return res.status(500).json({ error: `Failed to send reset code. Please try again or contact your institution.` });
      }
      message = "A reset code has been sent to your email address.";
    }

    res.json({ message });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ error: "Failed to generate reset code" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const IndexNumber = req.body.IndexNumber || req.body.indexNumber;
    const { resetCode, newPassword, institutionCode } = req.body;

    if (!IndexNumber || !resetCode || !newPassword) {
      return res.status(400).json({ error: "Student ID, reset code, and new password are required" });
    }

    const normIndex = IndexNumber.trim().toUpperCase();

    let companyFilter = {};
    if (institutionCode) {
      const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
      if (company) companyFilter.company = company._id;
    }

    let user = await User.findOne({
      IndexNumber: normIndex,
      resetPasswordExpires: { $gt: Date.now() },
      ...companyFilter,
    }).select("+password +resetPasswordToken");

    if (!user) {
      user = await User.findOne({
        indexNumber: normIndex,
        resetPasswordExpires: { $gt: Date.now() },
        ...companyFilter,
      }).select("+password +resetPasswordToken");
    }

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    if (!user.resetPasswordToken) {
      return res.status(400).json({ error: "No reset code found. Please request a new one." });
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
      resetBy: user.name || user.IndexNumber,
    });
    await user.save({ validateBeforeSave: false });

    // In-app notification to all admins + HODs
    require('../services/notificationService').notifyPasswordReset(user, 'self_reset');

    try {
      const admin = await User.findOne({
        company: user.company,
        role: { $in: ['admin', 'manager'] },
        isActive: true,
      }).select('email name').lean();
      const companyDoc = await Company.findById(user.company).select('name').lean();
      if (admin?.email) {
        sendAdminPasswordResetNotice({
          adminEmail: admin.email,
          adminName: admin.name || 'Admin',
          targetUserName: user.name || user.IndexNumber,
          targetUserRole: user.role,
          targetUserEmail: user.email || user.IndexNumber,
          institutionName: companyDoc?.name || '',
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
    const { phone, email: emailRaw, institutionCode } = req.body;
    const email = emailRaw ? emailRaw.trim().toLowerCase() : null;
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

    const rolesAllowedReset = ["manager", "lecturer", "hod", "employee"];
    if (["admin", "superadmin"].includes(user.role)) {
      return res.status(403).json({ error: "Invalid input" });
    }
    if (user.role === "student") {
      return res.status(403).json({ error: "Invalid input" });
    }
    if (!rolesAllowedReset.includes(user.role)) {
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
    let lastEmailError = null;

    if (phone) {
      const normPhone = normalisePhone(phone);
      const smsResult = await sendOtp({ phone: normPhone, code, name: user.name });
      if (smsResult.ok || smsResult.dev) {
        smsSent = true;
      } else {
        console.error('[ForgotPasswordEmail] SMS failed:', smsResult.error);
      }
    }

    if (user.email) {
      const companyData = await Company.findById(user.company).select('name').lean().catch(() => null);
      const emailResult = await sendPasswordReset({
        email: user.email,
        name: user.name,
        resetCode: code,
        role: user.role,
        institutionName: companyData?.name || '',
      }).catch(err => ({ ok: false, error: err.message }));

      if (emailResult.ok) {
        emailSent = true;
      } else {
        console.error('[ForgotPasswordEmail] Email send failed:', emailResult.error);
        lastEmailError = emailResult.error;
      }
    }

    if (!smsSent && !emailSent) {
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save({ validateBeforeSave: false });
      const detail = lastEmailError ? ` (${lastEmailError})` : '';
      return res.status(500).json({ error: `Failed to send reset code${detail}. Check Render logs for details.` });
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
    const { phone, email: emailRaw } = req.body;
    const email = emailRaw ? emailRaw.trim().toLowerCase() : null;
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
    if (user.role === "employee") {
      return res.status(403).json({ error: "Invalid input" });
    }
    if (!["admin", "superadmin", "manager"].includes(user.role)) {
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
    let lastEmailError = null;

    if (normPhone) {
      const smsResult = await sendOtp({ phone: normPhone, code, name: user.name });
      if (smsResult.ok || smsResult.dev) {
        smsSent = true;
      } else {
        console.error('[ForgotPasswordAdmin] SMS failed:', smsResult.error);
      }
    }

    if (user.email) {
      const companyData = user.company;
      const emailResult = await sendPasswordReset({
        email: user.email,
        name: user.name,
        resetCode: code,
        role: user.role,
        institutionName: companyData?.name || '',
      }).catch(err => ({ ok: false, error: err.message }));

      if (emailResult.ok) {
        emailSent = true;
      } else {
        console.error('[ForgotPasswordAdmin] Email send failed:', emailResult.error);
        lastEmailError = emailResult.error;
      }
    }

    if (!smsSent && !emailSent) {
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save({ validateBeforeSave: false });
      const detail = lastEmailError ? ` (${lastEmailError})` : '';
      return res.status(500).json({ error: `Failed to send reset code${detail}. Check Render logs for details.` });
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
    const { phone, email: emailRaw, resetCode, newPassword } = req.body;
    const email = emailRaw ? emailRaw.trim().toLowerCase() : null;
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
      }).select("+password +resetPasswordToken");
    }
    if (!user && email) {
      user = await User.findOne({
        email: email.trim().toLowerCase(),
        resetPasswordExpires: { $gt: Date.now() },
      }).select("+password +resetPasswordToken");
    }

    if (!user) return res.status(400).json({ error: "Invalid or expired reset code" });

    if (!user.resetPasswordToken) return res.status(400).json({ error: "Reset code has expired. Please request a new one." });

    const isValid = await bcrypt.compare(String(resetCode).trim(), user.resetPasswordToken);
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

    try {
      const admin = await User.findOne({
        company: user.company,
        role: { $in: ['admin', 'manager'] },
        isActive: true,
        email: { $exists: true, $ne: user.email },
      }).select('email name').lean();
      const companyDoc = await Company.findById(user.company).select('name').lean();
      if (admin?.email) {
        sendAdminPasswordResetNotice({
          adminEmail: admin.email,
          adminName: admin.name || 'Admin',
          targetUserName: user.name || user.email,
          targetUserRole: user.role,
          targetUserEmail: user.email || user.IndexNumber,
          institutionName: companyDoc?.name || '',
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
    user.twoFactorExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    const emailResult = await sendPasswordReset({
      email: user.email,
      name: user.name,
      resetCode: code,
      role: user.role,
      institutionName: "Two-Factor Authentication",
    }).catch(err => ({ ok: false, error: err.message }));

    if (!emailResult || emailResult.ok === false) {
      const detail = emailResult?.error ? ` (${emailResult.error})` : '';
      console.error(`[2FA] Email failed for ${user.email}:${detail}`);
      return res.status(500).json({ error: "Failed to send 2FA code. Please try again." });
    }

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

    user.twoFactorCode = null;
    user.twoFactorExpires = null;
    await user.save({ validateBeforeSave: false });

    const token        = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    res.json({ ok: true, token, refreshToken });
  } catch(e) {
    console.error("2FA verify error:", e);
    res.status(500).json({ error: "Verification failed" });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, currentPassword, newPassword, department, profilePhoto, attendancePin, clearAttendancePin } = req.body;
    const user = await User.findById(req.user._id).select("+password +attendancePin");
    if (!user) return res.status(404).json({ error: "User not found" });

    if (name && name.trim()) user.name = name.trim();

    if (profilePhoto !== undefined) {
      if (profilePhoto && profilePhoto.length > 2 * 1024 * 1024 * 1.4) {
        return res.status(400).json({ error: "Profile photo must be under 2MB" });
      }
      user.profilePhoto = profilePhoto || null;
    }

    if (department !== undefined && user.role === 'lecturer') {
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
    res.json({
      message: "Profile updated successfully",
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        profilePhoto: user.profilePhoto || null,
      }
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile" });
  }
};

exports.getDepartments = async (req, res) => {
  try {
    const { institutionCode } = req.query;
    if (!institutionCode) return res.status(400).json({ error: 'institutionCode is required' });

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) return res.status(404).json({ error: 'Institution not found' });

    const hods = await User.find({
      company: company._id,
      role: 'hod',
      isApproved: true,
      department: { $exists: true, $ne: null },
    }).select('department').lean();

    const departments = [...new Set(hods.map(h => h.department).filter(Boolean))].sort();
    res.json({ departments });
  } catch(e) {
    res.status(500).json({ error: 'Failed to fetch departments' });
  }
};


function _detectPlatform(ua) {
  ua = (ua || '').toLowerCase();
  if (/mobile|android|iphone|ipod/.test(ua)) return 'mobile';
  if (/tablet|ipad/.test(ua))                return 'tablet';
  if (/windows|macintosh|linux/.test(ua))    return 'desktop';
  return 'unknown';
}

// ── Device login history ──────────────────────────────────────────────────────
exports.getMyDevices = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('trustedDevices newDeviceLogs accountDeviceLock deviceId role')
      .lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    const trusted = (user.trustedDevices || []).map(d => ({
      deviceId:   d.deviceId,
      platform:   d.platform || 'unknown',
      ipAddress:  d.ipAddress || null,
      userAgent:  d.userAgent || null,
      firstSeenAt: d.firstSeenAt,
      lastSeenAt:  d.lastSeenAt,
      isCurrent:  d.deviceId === user.deviceId,
    })).sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));

    const alerts = (user.newDeviceLogs || []).map(d => ({
      deviceId:   d.deviceId,
      platform:   d.platform || 'unknown',
      ipAddress:  d.ipAddress || null,
      userAgent:  d.userAgent || null,
      detectedAt: d.detectedAt,
    })).sort((a, b) => new Date(b.detectedAt) - new Date(a.detectedAt));

    res.json({
      devices: trusted,
      newDeviceAlerts: alerts,
      deviceLock: ['student', 'employee'].includes(user.role)
        ? {
            isLocked:    user.accountDeviceLock?.isLocked || false,
            lockedUntil: user.accountDeviceLock?.lockedUntil || null,
          }
        : null,
    });
  } catch (e) {
    console.error('getMyDevices error:', e);
    res.status(500).json({ error: 'Failed to fetch device history' });
  }
};

exports.removeMyDevice = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const user = await User.findById(req.user._id).select('trustedDevices deviceId role');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const before = (user.trustedDevices || []).length;
    user.trustedDevices = (user.trustedDevices || []).filter(d => d.deviceId !== deviceId);
    if (user.trustedDevices.length === before) {
      return res.status(404).json({ error: 'Device not found' });
    }

    // If removing the current device, clear deviceId too
    if (user.deviceId === deviceId) user.deviceId = null;

    await user.save({ validateModifiedOnly: true });
    res.json({ ok: true, message: 'Device removed from trusted list' });
  } catch (e) {
    console.error('removeMyDevice error:', e);
    res.status(500).json({ error: 'Failed to remove device' });
  }
};
