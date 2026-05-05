const User    = require("../models/User");
const Company = require("../models/Company");
const { syncStudentToRoster } = require("../utils/rosterSync");
const { sendStudentWelcome } = require("../services/emailService");

exports.getPendingApprovals = async (req, res) => {
  try {
    const filter = { company: req.user.company, isApproved: false, isActive: true };
    if (req.user.role === "hod") {
      // HOD sees pending lecturers AND students in their own department
      filter.role = { $in: ["lecturer", "student"] };
      if (req.user.department) filter.department = req.user.department;
    }
    const pending = await User.find(filter).populate("company", "name mode");
    res.json({ pending });
  } catch (error) {
    console.error("Get pending approvals error:", error);
    res.status(500).json({ error: "Failed to fetch pending approvals" });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const filter = { _id: req.params.id, company: req.user.company, isApproved: false };
    if (req.user.role === "hod") {
      filter.role = { $in: ["lecturer", "student"] };
      if (req.user.department) filter.department = req.user.department;
    }
    const user = await User.findOne(filter);
    if (!user) {
      return res.status(404).json({ error: "User not found or already approved" });
    }
    user.isApproved = true;
    await user.save();

    // For students: enroll in matching roster courses and send approval notification.
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
    const filter = { _id: req.params.id, company: req.user.company, isApproved: false };
    if (req.user.role === "hod") {
      filter.role = { $in: ["lecturer", "student"] };
      if (req.user.department) filter.department = req.user.department;
    }
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
