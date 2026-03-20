const mongoose = require("mongoose");
const User = require("../models/User");
const Company = require("../models/Company");
const Course = require("../models/Course");
const { ROLE_HIERARCHY } = require("../middleware/role");

exports.listUsers = async (req, res) => {
  try {
    const { role, department } = req.query;
    const filter = { ...req.companyFilter };
    if (role) filter.role = role;
    if (department) filter.department = department;

    if (req.user.role === "lecturer") {
      const courses = await Course.find({ lecturer: req.user._id, company: req.user.company });
      const enrolledIds = new Set();
      courses.forEach((c) => c.enrolledStudents.forEach((id) => enrolledIds.add(id.toString())));
      const studentIds = [...enrolledIds];
      filter.$or = [
        { _id: req.user._id },
        { _id: { $in: studentIds }, role: "student" },
      ];
    }
    // HOD sees only users in their department
    if (req.user.role === "hod" && req.user.department) {
      filter.department = req.user.department;
    }

    const users = await User.find(filter).populate("company", "name mode");
    res.json({ users });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

exports.getUserStats = async (req, res) => {
  try {
    const { department } = req.query;
    const base = { ...req.companyFilter };
    if (department) base.department = department;
    const [admins, lecturers, hods, students, employees] = await Promise.all([
      User.countDocuments({ ...base, role: { $in: ["admin", "manager"] } }),
      User.countDocuments({ ...base, role: "lecturer" }),
      User.countDocuments({ ...base, role: "hod" }),
      User.countDocuments({ ...base, role: "student" }),
      User.countDocuments({ ...base, role: "employee" }),
    ]);
    res.json({ admins, lecturers, hods, students, employees });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user stats" });
  }
};


exports.createUser = async (req, res) => {
  try {
    const { email, password, name, role, indexNumber, phone, department, programme, studentLevel, studentGroup, sessionType, semester } = req.body;
    const targetRole = role || "employee";

    const company = await Company.findById(req.user.company);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    const corporateRoles = ["manager", "employee"];
    const academicRoles = ["lecturer", "hod", "student"];

    if (company.mode === "corporate" && academicRoles.includes(targetRole)) {
      return res.status(400).json({ error: "Cannot create academic roles in corporate mode" });
    }
    if (company.mode === "academic" && corporateRoles.includes(targetRole)) {
      return res.status(400).json({ error: "Cannot create corporate roles in academic mode" });
    }

    if (ROLE_HIERARCHY[targetRole] >= ROLE_HIERARCHY[req.user.role]) {
      return res.status(403).json({ error: "Cannot create user with equal or higher role" });
    }

    // Only superadmin can create HODs
    if (targetRole === "hod" && req.user.role !== "superadmin") {
      return res.status(403).json({ error: "Only superadmins can create Head of Department accounts." });
    }

    const { normalisePhone } = require('../services/smsService');
    const normPhone = phone ? normalisePhone(phone) : null;

    // Check for duplicate phone across the institution
    if (normPhone) {
      const phoneExists = await User.findOne({ phone: normPhone, company: req.user.company });
      if (phoneExists) {
        return res.status(400).json({
          error: `This phone number is already registered to ${phoneExists.name} (${phoneExists.role}) at this institution.`
        });
      }
    }

    // Check for duplicate email across the institution (non-student roles)
    if (email && targetRole !== 'student') {
      const emailExists = await User.findOne({ email: email.toLowerCase().trim(), company: req.user.company });
      if (emailExists) {
        return res.status(400).json({
          error: `This email is already registered to ${emailExists.name} (${emailExists.role}) at this institution.`
        });
      }
    }

    const userData = {
      password,
      name,
      role: targetRole,
      phone: normPhone,
      company: req.user.company,
      department: department ? department.trim() : null,
    };

    // Department rules
    if (targetRole === "hod") {
      if (!department?.trim()) {
        return res.status(400).json({ error: "Department is required when creating an HOD." });
      }
      const existingHod = await User.findOne({
        company: req.user.company,
        role: "hod",
        department: department.trim(),
      });
      if (existingHod) {
        return res.status(400).json({
          error: `There is already an HOD assigned to the "${department.trim()}" department (${existingHod.name}). Each department can only have one HOD.`,
        });
      }
    }

    if (targetRole === "lecturer" && !department?.trim()) {
      return res.status(400).json({ error: "Department is required when creating a lecturer." });
    }

    if (targetRole === "student" && !department?.trim()) {
      return res.status(400).json({ error: "Department is required when creating a student." });
    }

    if (targetRole === "student") {
      if (!indexNumber) {
        return res.status(400).json({ error: "Index number is required for students" });
      }
      // Explicit duplicate check with clear message before hitting the DB index
      const existingStudent = await User.findOne({
        indexNumber: indexNumber.toString().trim().toUpperCase(),
        company: req.user.company,
      });
      if (existingStudent) {
        return res.status(400).json({
          error: `Index number ${indexNumber} is already registered to ${existingStudent.name} at this institution.`,
        });
      }
      userData.indexNumber = indexNumber.toString().trim().toUpperCase();
      // Save student classification
      if (programme)    userData.programme    = programme.trim();
      if (studentLevel) userData.studentLevel = studentLevel.trim();
      if (studentGroup) userData.studentGroup = studentGroup.trim().toUpperCase();
      if (sessionType)  userData.sessionType  = sessionType.trim();
      if (semester)     userData.semester     = semester.trim();
    } else {
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      userData.email = email;
    }

    if (targetRole === "employee") {
      const updatedCompany = await Company.findByIdAndUpdate(
        req.user.company,
        { $inc: { nextEmployeeSeq: 1 } },
        { new: true }
      );
      const prefix = (company.name || "CO")
        .substring(0, 3)
        .toUpperCase()
        .replace(/[^A-Z]/g, "X");
      userData.employeeId = `${prefix}-EMP-${String(updatedCompany.nextEmployeeSeq).padStart(4, "0")}`;
    }

    const user = await User.create(userData);

    // Send welcome emails (non-fatal)
    try {
      const emailService = require('../services/emailService');
      if (targetRole === 'hod' && user.email) {
        emailService.sendHodWelcome({
          email: user.email,
          name: user.name,
          institutionName: company.name,
          department: userData.department || null,
        }).catch(() => {});
      } else if (targetRole === 'lecturer' && user.email) {
        emailService.sendLecturerWelcome({
          email: user.email,
          name: user.name,
          institutionName: company.name,
          department: userData.department || null,
          isApproved: true,
        }).catch(() => {});
      } else if (targetRole === 'employee' && user.email) {
        emailService.sendEmployeeWelcome({
          email: user.email,
          name: user.name,
          companyName: company.name,
          employeeId: user.employeeId || '',
        }).catch(() => {});
      }
    } catch (_) {}

    res.status(201).json({ user });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    if (error.code === 11000) {
      return res.status(400).json({ error: "Email or index number already exists in this company" });
    }
    console.error("Create user error:", error);
    res.status(500).json({ error: "Failed to create user" });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { name, role, isActive, department } = req.body;
    const update = {};
    if (name) update.name = name;
    if (typeof isActive === "boolean") update.isActive = isActive;
    if (department !== undefined) {
      update.department = department ? department.trim() : null;
      // If changing department of an HOD, ensure no HOD already exists in target department
      if (update.department) {
        const targetUser = await User.findOne({ _id: req.params.id, company: req.user.company });
        if (targetUser?.role === "hod") {
          const clash = await User.findOne({
            company: req.user.company,
            role: "hod",
            department: update.department,
            _id: { $ne: req.params.id },
          });
          if (clash) {
            return res.status(400).json({
              error: `"${update.department}" already has an HOD (${clash.name}). Each department can only have one HOD.`,
            });
          }
        }
      }
    }

    if (role) {
      if (ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[req.user.role]) {
        return res.status(403).json({ error: "Cannot assign equal or higher role" });
      }
      update.role = role;
    }

    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...req.companyFilter },
      update,
      { new: true, runValidators: true }
    ).populate("company", "name mode");

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ user });
  } catch (error) {
    console.error("Update user error:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
};

exports.deactivateUser = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }

    const user = await User.findOne({ _id: req.params.id, ...req.companyFilter });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[req.user.role]) {
      return res.status(403).json({ error: "Cannot deactivate user with equal or higher role" });
    }

    user.isActive = false;
    await user.save();
    res.json({ message: "User deactivated successfully" });
  } catch (error) {
    console.error("Deactivate user error:", error);
    res.status(500).json({ error: "Failed to deactivate user" });
  }
};

exports.activateUser = async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ error: "Cannot modify your own account" });
    }

    const user = await User.findOne({ _id: req.params.id, ...req.companyFilter });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[req.user.role]) {
      return res.status(403).json({ error: "Cannot activate user with equal or higher role" });
    }

    user.isActive = true;
    await user.save();
    res.json({ message: "User activated successfully" });
  } catch (error) {
    console.error("Activate user error:", error);
    res.status(500).json({ error: "Failed to activate user" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, ...req.companyFilter });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    if (ROLE_HIERARCHY[user.role] >= ROLE_HIERARCHY[req.user.role]) {
      return res.status(403).json({ error: "Cannot delete user with equal or higher role" });
    }

    await User.findByIdAndDelete(user._id);
    res.json({ message: "User permanently deleted" });
  } catch (error) {
    console.error("Delete user error:", error);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

// ── Bulk CSV import ──────────────────────────────────────────────────────────
// POST /api/users/bulk-import  (multipart/form-data)
// CSV columns: name*, indexNumber*, email (optional), phone (optional), courseCode (optional), department (optional)
// Generates a random password for each student; returns a downloadable results list.
exports.bulkImportStudents = async (req, res) => {
  const multer = require("multer");
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }).single("csv");

  upload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });

    try {
      const company = await Company.findById(req.user.company);
      if (!company) return res.status(404).json({ error: "Company not found" });
      if (company.mode !== "academic") return res.status(400).json({ error: "Bulk student import is for academic mode only" });

      let rows = [];

      if (req.file) {
        // Parse uploaded CSV
        const text = req.file.buffer.toString("utf8");
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        if (lines.length < 2) return res.status(400).json({ error: "CSV must have a header row and at least one data row" });

        const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ""));
        const nameIdx        = headers.findIndex(h => h === "name" || h === "fullname" || h === "studentname");
        const idxIdx         = headers.findIndex(h => h === "indexnumber" || h === "studentid" || h === "id" || h === "index");
        const emailIdx       = headers.findIndex(h => h === "email");
        const phoneIdx       = headers.findIndex(h => h === "phone" || h === "phonenumber" || h === "mobile");
        const courseIdx      = headers.findIndex(h => h === "coursecode" || h === "course" || h === "code");
        const deptIdx        = headers.findIndex(h => ["department","dept","faculty"].includes(h));
        const programmeIdx   = headers.findIndex(h => h === "programme" || h === "program");
        const levelIdx       = headers.findIndex(h => h === "level");
        const groupIdx       = headers.findIndex(h => h === "group");
        const sessionTypeIdx = headers.findIndex(h => h === "sessiontype" || h === "session");
        const semesterIdx    = headers.findIndex(h => h === "semester" || h === "sem");

        if (nameIdx === -1 || idxIdx === -1) {
          return res.status(400).json({ error: "CSV must have 'name' and 'indexNumber' columns" });
        }

        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(",").map(c => c.trim().replace(/^"|"$/g, ""));
          if (!cols[nameIdx] && !cols[idxIdx]) continue; // skip blank rows
          rows.push({
            name:        (cols[nameIdx]        || "").trim(),
            indexNumber: (cols[idxIdx]         || "").trim().toUpperCase(),
            email:       emailIdx >= 0       ? (cols[emailIdx]       || "").trim() : "",
            phone:       phoneIdx >= 0       ? (cols[phoneIdx]       || "").trim() : "",
            courseCode:  courseIdx >= 0      ? (cols[courseIdx]      || "").trim().toUpperCase() : "",
            department:  deptIdx >= 0        ? (cols[deptIdx]        || "").trim() : "",
            programme:   programmeIdx >= 0   ? (cols[programmeIdx]   || "").trim() : "",
            studentLevel:levelIdx >= 0       ? (cols[levelIdx]       || "").trim() : "",
            studentGroup:groupIdx >= 0       ? (cols[groupIdx]       || "").trim().toUpperCase() : "",
            sessionType: sessionTypeIdx >= 0 ? (cols[sessionTypeIdx] || "").trim() : "",
            semester:    semesterIdx >= 0    ? (cols[semesterIdx]    || "").trim() : "",
          });
        }
      } else if (req.body?.students) {
        // JSON fallback (for testing)
        rows = Array.isArray(req.body.students) ? req.body.students : JSON.parse(req.body.students);
      }

      if (!rows.length) return res.status(400).json({ error: "No student rows found" });

      const { normalisePhone } = require("../services/smsService");

      // Pre-load courses referenced in the CSV
      const courseCodes = [...new Set(rows.map(r => r.courseCode).filter(Boolean))];
      const courseMap = {};
      if (courseCodes.length) {
        const courses = await Course.find({ code: { $in: courseCodes }, company: req.user.company });
        courses.forEach(c => { courseMap[c.code.toUpperCase()] = c; });
      }

      // Also support a single courseId passed in the body/query
      let defaultCourse = null;
      if (req.body?.courseId || req.query?.courseId) {
        defaultCourse = await Course.findOne({ _id: req.body?.courseId || req.query?.courseId, company: req.user.company });
      }

      const results = { created: 0, skipped: 0, errors: [] };
      const createdStudents = [];

      for (const row of rows) {
        if (!row.name || !row.indexNumber) {
          results.errors.push({ row: row.indexNumber || "?", error: "Missing name or indexNumber" });
          results.skipped++;
          continue;
        }

        // Generate a readable temp password: first 3 of name + last 3 of indexNumber + 4-digit random
        const namePart = row.name.replace(/[^a-zA-Z]/g, "").slice(0, 3).toLowerCase();
        const idPart   = row.indexNumber.replace(/[^a-zA-Z0-9]/g, "").slice(-3).toLowerCase();
        const numPart  = String(Math.floor(1000 + Math.random() * 9000));
        const tempPassword = namePart + idPart + numPart;

        // Build user data -- email optional for students
        const userData = {
          name: row.name,
          indexNumber: row.indexNumber,
          password: tempPassword,
          role: "student",
          company: req.user.company,
          mustChangePassword: true,
        };

        if (row.email) userData.email = row.email.toLowerCase();
        if (row.phone) {
          try { userData.phone = normalisePhone(row.phone); } catch (_) {}
        }
        if (row.department)   userData.department   = row.department;
        if (row.programme)    userData.programme    = row.programme;
        if (row.studentLevel) userData.studentLevel = row.studentLevel;
        if (row.studentGroup) userData.studentGroup = row.studentGroup.toUpperCase();
        if (row.sessionType)  userData.sessionType  = row.sessionType;
        if (row.semester)     userData.semester     = row.semester;

        try {
          const user = await User.create(userData);
          results.created++;

          // Enroll in course if specified
          const course = (row.courseCode && courseMap[row.courseCode.toUpperCase()]) || defaultCourse;
          if (course) {
            await Course.updateOne({ _id: course._id }, { $addToSet: { enrolledStudents: user._id } });
            // Also add to StudentRoster if not already there
            const StudentRoster = require("../models/StudentRoster");
            await StudentRoster.findOneAndUpdate(
              { studentId: row.indexNumber, course: course._id, company: req.user.company },
              { $setOnInsert: { studentId: row.indexNumber, name: row.name, course: course._id, company: req.user.company, addedBy: req.user._id, registered: true, registeredUser: user._id } },
              { upsert: true, new: false }
            ).catch(() => {}); // ignore duplicate roster errors
          }

          createdStudents.push({
            name: user.name,
            indexNumber: user.indexNumber,
            email: user.email || "",
            tempPassword,
            course: course?.title || "",
            status: "created",
          });
        } catch (err) {
          if (err.code === 11000) {
            results.skipped++;
            results.errors.push({ row: row.indexNumber, error: "Already exists" });
            createdStudents.push({ name: row.name, indexNumber: row.indexNumber, email: row.email || "", tempPassword: "(existing)", course: "", status: "skipped" });
          } else {
            results.skipped++;
            results.errors.push({ row: row.indexNumber, error: err.message });
          }
        }
      }

      res.json({
        message: `${results.created} student(s) created, ${results.skipped} skipped`,
        results,
        students: createdStudents,
      });
    } catch (err) {
      console.error("Bulk import error:", err);
      res.status(500).json({ error: "Bulk import failed: " + err.message });
    }
  });
};


exports.bulkAction = async (req, res) => {
  try {
    const { userIds, action } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "No users selected" });
    }

    if (!["activate", "deactivate", "delete"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const safeIds = userIds.filter(id => id !== req.user._id.toString());

    if (safeIds.length === 0) {
      return res.status(400).json({ error: "Cannot perform this action on your own account" });
    }

    const users = await User.find({ _id: { $in: safeIds }, ...req.companyFilter });
    const allowedIds = users
      .filter(u => ROLE_HIERARCHY[u.role] < ROLE_HIERARCHY[req.user.role])
      .map(u => u._id);

    if (allowedIds.length === 0) {
      return res.status(403).json({ error: "No users eligible for this action (role restrictions)" });
    }

    const filter = { _id: { $in: allowedIds } };

    let result;
    if (action === "activate") {
      result = await User.updateMany(filter, { isActive: true });
      res.json({ message: `${result.modifiedCount} user(s) activated` });
    } else if (action === "deactivate") {
      result = await User.updateMany(filter, { isActive: false });
      res.json({ message: `${result.modifiedCount} user(s) deactivated` });
    } else if (action === "delete") {
      result = await User.deleteMany(filter);
      res.json({ message: `${result.deletedCount} user(s) permanently deleted` });
    }
  } catch (error) {
    console.error("Bulk action error:", error);
    res.status(500).json({ error: "Failed to perform bulk action" });
  }
};

exports.getResetLogs = async (req, res) => {
  try {
    const users = await User.find({
      company: req.user.company,
      "passwordResetLog.0": { $exists: true },
    }).select("name email indexNumber role passwordResetLog").lean();

    // Flatten all logs into one list sorted by most recent
    const logs = [];
    for (const user of users) {
      for (const log of (user.passwordResetLog || [])) {
        logs.push({
          userId:    user._id,
          userName:  user.name || user.email || user.indexNumber,
          userRole:  user.role,
          userEmail: user.email || user.indexNumber,
          resetAt:   log.resetAt,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          method:    log.method,
          resetBy:   log.resetBy,
        });
      }
    }
    logs.sort((a, b) => new Date(b.resetAt) - new Date(a.resetAt));
    res.json({ logs });
  } catch (error) {
    console.error("Get reset logs error:", error);
    res.status(500).json({ error: "Failed to fetch reset logs" });
  }
};

exports.adminResetStudentPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const target = await require('../models/User').findOne({ _id: id, company: req.user.company });
    if (!target) return res.status(404).json({ error: "User not found" });
    // Block resetting another admin/superadmin account (security)
    if (['admin', 'superadmin'].includes(target.role) && !['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ error: "You cannot reset an admin password" });
    }

    // Generate a memorable temp password: INSTITUTIONCODE-6digits
    const crypto = require('crypto');
    const digits = String(crypto.randomInt(100000, 999999));
    const institutionCode = req.user.company?.institutionCode || 'KODEX';
    const tempPassword = `${institutionCode}-${digits}`;

    target.password = tempPassword;
    target.mustChangePassword = true;
    if (!target.passwordResetLog) target.passwordResetLog = [];
    target.passwordResetLog.push({
      resetAt: new Date(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      method: 'admin',
      resetBy: req.user.name || req.user.email || 'Admin',
    });
    await target.save();

    res.json({
      message: "Temporary password generated. Give this to the student.",
      tempPassword,
      userName: target.name,
      userEmail: target.email || target.indexNumber,
    });
  } catch (error) {
    console.error("Admin reset student password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

exports.changePasswordAfterReset = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "New password must be at least 8 characters" });
    }
    const user = await require('../models/User').findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ error: "User not found" });

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();
    res.json({ message: "Password changed successfully." });
  } catch (error) {
    console.error("Change password after reset error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
};

// ── Clear student device lock (admin action) ──────────────────────────────────
exports.clearDeviceLock = async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.id, company: req.user.company, role: "student" });
    if (!user) return res.status(404).json({ error: "Student not found" });

    user.deviceId = null;
    await user.save({ validateBeforeSave: false });

    console.log(`[DeviceLock] Cleared for student ${user.name} by ${req.user.name}`);
    res.json({ message: `Device lock cleared for ${user.name}. They can now log in from a new device.` });
  } catch (error) {
    console.error("Clear device lock error:", error);
    res.status(500).json({ error: "Failed to clear device lock" });
  }
};
