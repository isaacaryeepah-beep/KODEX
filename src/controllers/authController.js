// ═══════════════════════════════════════════════════════════════════════════
// FIXED: Password Reset Function
// ═══════════════════════════════════════════════════════════════════════════
// File: src/controllers/authController.js
// Replace: Lines 915-984 (the entire exports.resetPassword function)
// ═══════════════════════════════════════════════════════════════════════════

exports.resetPassword = async (req, res) => {
  try {
    const IndexNumber = req.body.IndexNumber || req.body.indexNumber;
    const { resetCode, newPassword, institutionCode } = req.body;

    if (!IndexNumber || !resetCode || !newPassword) {
      return res.status(400).json({ error: "Student ID, reset code, and new password are required" });
    }

    // ✅ FIX #1: Institution code is now REQUIRED (prevents cross-institution attacks)
    if (!institutionCode) {
      return res.status(400).json({ error: "Institution code is required" });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) {
      return res.status(404).json({ error: "Institution not found" });
    }

    // ✅ FIX #2: Convert IndexNumber to UPPERCASE to match database format
    // This is the CRITICAL fix - students were typing lowercase but DB has uppercase
    const filter = {
      IndexNumber: IndexNumber.toUpperCase(),  // ← THIS IS THE KEY FIX!
      company: company._id,
      resetPasswordExpires: { $gt: Date.now() },
    };

    // ✅ FIX #3: Explicitly include resetPasswordToken in the query
    const user = await User.findOne(filter).select("+password +resetPasswordToken");

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset code" });
    }

    // ✅ FIX #4: Check if resetPasswordToken exists (defensive programming)
    if (!user.resetPasswordToken) {
      return res.status(400).json({ error: "No reset code found. Please request a new code." });
    }

    // Now compare the codes
    const isValid = await bcrypt.compare(resetCode, user.resetPasswordToken);
    if (!isValid) {
      return res.status(400).json({ error: "Invalid reset code" });
    }

    // Reset the password
    user.password = newPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    
    // Log the reset for security audit
    if (!user.passwordResetLog) user.passwordResetLog = [];
    user.passwordResetLog.push({
      resetAt: new Date(),
      ipAddress: req.ip || req.headers['x-forwarded-for'] || '',
      userAgent: req.headers['user-agent'] || '',
      method: 'self',
      resetBy: user.name || user.IndexNumber,
    });
    
    await user.save();

    // Notify admin of student reset (non-fatal - don't fail if this errors)
    try {
      const Company = require('../models/Company');
      const admin = await require('../models/User').findOne({
        company: user.company,
        role: { $in: ['admin', 'manager'] },
        isActive: true,
      }).select('email name').lean();
      const companyData = await Company.findById(user.company).select('name').lean();
      if (admin?.email) {
        sendAdminPasswordResetNotice({
          adminEmail: admin.email,
          adminName: admin.name || 'Admin',
          targetUserName: user.name || user.IndexNumber,
          targetUserRole: user.role,
          targetUserEmail: user.email || user.IndexNumber,
          institutionName: companyData?.name || '',
        }).catch(() => {});
      }
    } catch(_) {}

    res.json({ message: "Password has been reset successfully" });
  } catch (error) {
    console.error("Reset password error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// WHAT WAS FIXED:
// ═══════════════════════════════════════════════════════════════════════════
// 1. ✅ Institution code now REQUIRED (security fix)
// 2. ✅ IndexNumber converted to UPPERCASE before database search (MAIN FIX)
// 3. ✅ resetPasswordToken explicitly included in select query
// 4. ✅ Added check for resetPasswordToken existence
// ═══════════════════════════════════════════════════════════════════════════
