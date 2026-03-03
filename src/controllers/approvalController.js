const User = require("../models/User");

exports.getPendingApprovals = async (req, res) => {
  try {
    const pending = await User.find({
      company: req.user.company,
      isApproved: false,
      isActive: true,
    }).populate("company", "name mode");

    res.json({ pending });
  } catch (error) {
    console.error("Get pending approvals error:", error);
    res.status(500).json({ error: "Failed to fetch pending approvals" });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      company: req.user.company,
      isApproved: false,
    });

    if (!user) {
      return res.status(404).json({ error: "User not found or already approved" });
    }

    user.isApproved = true;
    await user.save();

    res.json({ message: `${user.name} has been approved`, user });
  } catch (error) {
    console.error("Approve user error:", error);
    res.status(500).json({ error: "Failed to approve user" });
  }
};

exports.rejectUser = async (req, res) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      company: req.user.company,
      isApproved: false,
    });

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
