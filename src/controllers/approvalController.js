const User    = require("../models/User");
const Company = require("../models/Company");
const { syncStudentToRoster } = require("../utils/rosterSync");
const { sendStudentWelcome, sendEmployeeWelcome } = require("../services/emailService");

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
    } else if (user.role === "employee") {
      if (user.email) {
        Company.findById(user.company).select("name").lean()
          .then(company => sendEmployeeWelcome({
            email: user.email,
            name: user.name,
            companyName: company?.name || "",
            employeeId: user.employeeId || "",
          }))
          .catch(err => console.error("[approveUser] employee welcome email failed:", err.message));
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
    await User.findByIdAndDelete(user._id);
    res.json({ message: `${user.name} has been rejected and removed` });
  } catch (error) {
    console.error("Reject user error:", error);
    res.status(500).json({ error: "Failed to reject user" });
  }
};
