const mongoose = require("mongoose");
const StudentRoster = require("../models/StudentRoster");
const Course = require("../models/Course");
const User = require("../models/User");

exports.uploadRoster = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { students } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ error: "Students list is required. Provide an array of { studentId, name }." });
    }

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    const course = await Course.findOne({
      _id: courseId,
      company: req.user.company,
      lecturer: req.user._id,
    });

    if (!course) {
      return res.status(404).json({ error: "Course not found or you don't have access to it" });
    }

    const invalid = students.filter((s) => !s.studentId || typeof s.studentId !== "string");
    if (invalid.length > 0) {
      return res.status(400).json({ error: "Each student must have a studentId field" });
    }

    const results = { added: 0, duplicates: 0, autoEnrolled: 0, errors: [] };

    for (const student of students) {
      const normalizedId = student.studentId.trim().toUpperCase();
      try {
        const rosterEntry = await StudentRoster.create({
          studentId: normalizedId,
          name: student.name ? student.name.trim() : "",
          course: course._id,
          company: req.user.company,
          addedBy: req.user._id,
        });
        results.added++;

        const existingUser = await User.findOne({
          indexNumber: normalizedId,
          company: req.user.company,
          role: "student",
        });
        if (existingUser) {
          rosterEntry.registered = true;
          rosterEntry.registeredUser = existingUser._id;
          await rosterEntry.save();

          await Course.updateOne(
            { _id: course._id },
            { $addToSet: { enrolledStudents: existingUser._id } }
          );
          results.autoEnrolled++;
        }
      } catch (err) {
        if (err.code === 11000) {
          results.duplicates++;
        } else {
          results.errors.push({ studentId: student.studentId, error: err.message });
        }
      }
    }

    res.status(201).json({
      message: `Roster updated: ${results.added} added, ${results.duplicates} already existed, ${results.autoEnrolled} already-registered students auto-enrolled`,
      results,
    });
  } catch (error) {
    console.error("Upload roster error:", error);
    res.status(500).json({ error: "Failed to upload student roster" });
  }
};

exports.getRoster = async (req, res) => {
  try {
    const { courseId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    const filter = { _id: courseId, company: req.user.company };
    if (req.user.role === "lecturer") {
      filter.lecturer = req.user._id;
    }

    const course = await Course.findOne(filter);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const roster = await StudentRoster.find({ course: courseId, company: req.user.company })
      .populate("addedBy", "name email")
      .populate("registeredUser", "name indexNumber")
      .sort({ studentId: 1 });

    res.json({ roster, course: { id: course._id, title: course.title, code: course.code } });
  } catch (error) {
    console.error("Get roster error:", error);
    res.status(500).json({ error: "Failed to fetch roster" });
  }
};

exports.removeFromRoster = async (req, res) => {
  try {
    const { courseId, rosterId } = req.params;

    if (req.user.role === "lecturer") {
      const course = await Course.findOne({ _id: courseId, company: req.user.company, lecturer: req.user._id });
      if (!course) {
        return res.status(404).json({ error: "Course not found or access denied" });
      }
    }

    const entry = await StudentRoster.findOneAndDelete({
      _id: rosterId,
      course: courseId,
      company: req.user.company,
    });

    if (!entry) {
      return res.status(404).json({ error: "Roster entry not found" });
    }

    res.json({ message: "Student removed from roster" });
  } catch (error) {
    console.error("Remove from roster error:", error);
    res.status(500).json({ error: "Failed to remove student from roster" });
  }
};

exports.clearRoster = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findOne({
      _id: courseId,
      company: req.user.company,
      lecturer: req.user._id,
    });

    if (!course) {
      return res.status(404).json({ error: "Course not found or access denied" });
    }

    const result = await StudentRoster.deleteMany({ course: courseId, company: req.user.company });

    res.json({ message: `Cleared ${result.deletedCount} entries from roster` });
  } catch (error) {
    console.error("Clear roster error:", error);
    res.status(500).json({ error: "Failed to clear roster" });
  }
};
