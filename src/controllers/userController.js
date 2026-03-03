const mongoose = require("mongoose");
const User = require("../models/User");
const Company = require("../models/Company");
const Course = require("../models/Course");
const { ROLE_HIERARCHY } = require("../middleware/role");

exports.listUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const filter = { ...req.companyFilter };
    if (role) filter.role = role;

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

    const users = await User.find(filter).populate("company", "name mode");
    res.json({ users });
  } catch (error) {
    console.error("List users error:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { email, password, name, role, indexNumber } = req.body;
    const targetRole = role || "employee";

    const company = await Company.findById(req.user.company);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    const corporateRoles = ["manager", "employee"];
    const academicRoles = ["lecturer", "student"];

    if (company.mode === "corporate" && academicRoles.includes(targetRole)) {
      return res.status(400).json({ error: "Cannot create academic roles in corporate mode" });
    }
    if (company.mode === "academic" && corporateRoles.includes(targetRole)) {
      return res.status(400).json({ error: "Cannot create corporate roles in academic mode" });
    }

    if (ROLE_HIERARCHY[targetRole] >= ROLE_HIERARCHY[req.user.role]) {
      return res.status(403).json({ error: "Cannot create user with equal or higher role" });
    }

    const userData = {
      password,
      name,
      role: targetRole,
      company: req.user.company,
    };

    if (targetRole === "student") {
      if (!indexNumber) {
        return res.status(400).json({ error: "Index number is required for students" });
      }
      userData.indexNumber = indexNumber;
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
    const { name, role, isActive } = req.body;
    const update = {};
    if (name) update.name = name;
    if (typeof isActive === "boolean") update.isActive = isActive;

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
