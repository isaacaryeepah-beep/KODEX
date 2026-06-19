const User    = require("../models/User");
const Company = require("../models/Company");
const { syncStudentToRoster } = require("../utils/rosterSync");
const { sendStudentWelcome, sendEmployeeWelcome, sendRegistrationRejected } = require("../services/emailService");

// Build the base query filter for the requesting user's role.
// Uses req.companyFilter (set by companyIsolation middleware) so superadmin
// gets an empty filter (sees all companies) while everyone else is scoped
// to their own company.
function _baseFilter(req) {
  const filter = { ...req.companyFilter, isApproved: false, isActive: true };
  if (req.user.role === "hod") {
    // HOD sees pending lecturers and students in their own department only
    filter.role = { $in: ["lecturer", "student"] };
    if (req.user.department) filter.department = req.user.department;
  } else if (req.user.role === "manager") {
    // Manager sees pending employees in their company only
    filter.role = "employee";
  }
  return filter;
}

exports.getPendingApprovals = async (req, res) => {
  try {
    const pending = await User.find(_baseFilter(req)).populate("company", "name mode");
    res.json({ pending });
  } catch (error) {
    console.error("Get pending approvals error:", error);
    res.status(500).json({ error: "Failed to fetch pending approvals" });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const filter = { _id: req.params.id, isApproved: false, ..._baseFilter(req) };
    const user = await User.findOne(filter);
    if (!user) {
      return res.status(404).json({ error: "User not found or already approved" });
    }
    user.isApproved = true;
    await user.save();

    if (user.role === "student") {
      syncStudentToRoster(user._id, user.company).catch(err =>
        console.error("[approveUser] rosterSync failed:", err.message)
      );
      if (user.email) {
        Company.findById(user.company).select("name").lean()
          .then(company => sendStudentWelcome({
            email: user.email,
            name: user.name,
            institutionName: company?.name || "",
            IndexNumber: user.IndexNumber,
          }))
          .catch(err => console.error("[approveUser] student welcome email failed:", err.message));
      }
    } else if (user.role === "employee" || user.role === "manager") {
      if (user.email) {
        Company.findById(user.company).select("name").lean()
          .then(company => sendEmployeeWelcome({
            email: user.email,
            name: user.name,
            companyName: company?.name || "",
            employeeId: user.employeeId || user.role,
          }))
          .catch(err => console.error("[approveUser] welcome email failed:", err.message));
      }
    }

    res.json({ message: `${user.name} has been approved`, user });
  } catch (error) {
    console.error("Approve user error:", error);
    res.status(500).json({ error: "Failed to approve user" });
  }
};

exports.rejectUser = async (req, res) => {
  try {
    const filter = { _id: req.params.id, isApproved: false, ..._baseFilter(req) };
    const user = await User.findOne(filter);
    if (!user) {
      return res.status(404).json({ error: "User not found or already approved" });
    }
    const reason = (req.body?.reason || '').trim() || null;
    await User.findByIdAndDelete(user._id);

    if (user.email) {
      Company.findById(user.company).select("name displayName").lean()
        .then(company => sendRegistrationRejected({
          email: user.email,
          name: user.name,
          orgName: company?.displayName || company?.name || '',
          reason,
        }))
        .catch(err => console.error("[rejectUser] rejection email failed:", err.message));
    }

    res.json({ message: `${user.name} has been rejected and removed` });
  } catch (error) {
    console.error("Reject user error:", error);
    res.status(500).json({ error: "Failed to reject user" });
  }
};

exports.getSelfRegistrationStatus = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company).select("selfRegistrationEnabled institutionCode").lean();
    if (!company) return res.status(404).json({ error: "Company not found" });
    res.json({ enabled: !!company.selfRegistrationEnabled, institutionCode: company.institutionCode });
  } catch (error) {
    console.error("getSelfRegistrationStatus error:", error);
    res.status(500).json({ error: "Failed to get status" });
  }
};

exports.toggleSelfRegistration = async (req, res) => {
  try {
    const { enabled } = req.body;
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be a boolean" });
    }
    const company = await Company.findByIdAndUpdate(
      req.user.company,
      { selfRegistrationEnabled: enabled },
      { new: true }
    ).select("selfRegistrationEnabled institutionCode");
    if (!company) return res.status(404).json({ error: "Company not found" });
    res.json({ enabled: company.selfRegistrationEnabled, institutionCode: company.institutionCode });
  } catch (error) {
    console.error("toggleSelfRegistration error:", error);
    res.status(500).json({ error: "Failed to update setting" });
  }
};
