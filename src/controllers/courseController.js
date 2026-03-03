const mongoose = require("mongoose");
const Course = require("../models/Course");
const User = require("../models/User");

exports.createCourse = async (req, res) => {
  try {
    const { title, code, description } = req.body;

    if (!title || !code) {
      return res.status(400).json({ error: "Title and code are required" });
    }

    const course = await Course.create({
      title,
      code,
      description: description || "",
      company: req.user.company,
      lecturer: req.user._id,
    });

    const populated = await course.populate([
      { path: "lecturer", select: "name email" },
      { path: "company", select: "name" },
    ]);

    res.status(201).json({ course: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: "Course code already exists in this company" });
    }
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    console.error("Create course error:", error);
    res.status(500).json({ error: "Failed to create course" });
  }
};

exports.listCourses = async (req, res) => {
  try {
    const filter = { ...req.companyFilter, isActive: true };

    if (req.user.role === "student") {
      filter.enrolledStudents = req.user._id;
    } else if (req.user.role === "lecturer") {
      filter.lecturer = req.user._id;
    }

    const courses = await Course.find(filter)
      .populate("lecturer", "name email")
      .populate("company", "name")
      .populate("enrolledStudents", "name indexNumber")
      .sort({ createdAt: -1 });

    res.json({ courses });
  } catch (error) {
    console.error("List courses error:", error);
    res.status(500).json({ error: "Failed to fetch courses" });
  }
};

exports.getCourse = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    const courseFilter = { _id: id, ...req.companyFilter };
    if (req.user.role === "lecturer") {
      courseFilter.lecturer = req.user._id;
    } else if (req.user.role === "student") {
      courseFilter.enrolledStudents = req.user._id;
    }

    const course = await Course.findOne(courseFilter)
      .populate("lecturer", "name email")
      .populate("company", "name")
      .populate("enrolledStudents", "name indexNumber email");

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json({ course });
  } catch (error) {
    console.error("Get course error:", error);
    res.status(500).json({ error: "Failed to fetch course" });
  }
};

exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, isActive } = req.body;
    const update = {};
    if (title) update.title = title;
    if (description !== undefined) update.description = description;
    if (typeof isActive === "boolean") update.isActive = isActive;

    const updateFilter = { _id: id, ...req.companyFilter };
    if (req.user.role === "lecturer") {
      updateFilter.lecturer = req.user._id;
    }

    const course = await Course.findOneAndUpdate(
      updateFilter,
      update,
      { new: true, runValidators: true }
    ).populate("lecturer", "name email");

    if (!course) {
      return res.status(404).json({ error: "Course not found or access denied" });
    }

    res.json({ course });
  } catch (error) {
    console.error("Update course error:", error);
    res.status(500).json({ error: "Failed to update course" });
  }
};

exports.enrollStudents = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentIds } = req.body;

    if (!studentIds || !Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: "Student IDs are required" });
    }

    const students = await User.find({
      _id: { $in: studentIds },
      company: req.user.company,
      role: "student",
      isActive: true,
    });

    if (students.length === 0) {
      return res.status(404).json({ error: "No valid students found" });
    }

    const enrollFilter = { _id: id, ...req.companyFilter };
    if (req.user.role === "lecturer") {
      enrollFilter.lecturer = req.user._id;
    }

    const course = await Course.findOneAndUpdate(
      enrollFilter,
      { $addToSet: { enrolledStudents: { $each: students.map((s) => s._id) } } },
      { new: true }
    )
      .populate("lecturer", "name email")
      .populate("enrolledStudents", "name indexNumber");

    if (!course) {
      return res.status(404).json({ error: "Course not found or access denied" });
    }

    res.json({ course, enrolledCount: students.length });
  } catch (error) {
    console.error("Enroll students error:", error);
    res.status(500).json({ error: "Failed to enroll students" });
  }
};

exports.removeStudent = async (req, res) => {
  try {
    const { id, studentId } = req.params;

    const removeFilter = { _id: id, ...req.companyFilter };
    if (req.user.role === "lecturer") {
      removeFilter.lecturer = req.user._id;
    }

    const course = await Course.findOneAndUpdate(
      removeFilter,
      { $pull: { enrolledStudents: studentId } },
      { new: true }
    )
      .populate("lecturer", "name email")
      .populate("enrolledStudents", "name indexNumber");

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json({ course });
  } catch (error) {
    console.error("Remove student error:", error);
    res.status(500).json({ error: "Failed to remove student" });
  }
};
