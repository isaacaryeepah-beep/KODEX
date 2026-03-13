const Announcement = require("../models/Announcement");
const mongoose     = require("mongoose");

const CAN_POST = ["admin", "superadmin", "lecturer", "manager"];

// Helper — build the filter for what a given user can SEE
function visibilityFilter(user) {
  const now = new Date();
  const base = {
    company: user.company,
    $or: [{ expiresAt: null }, { expiresAt: { $gte: now } }],
  };

  if (user.role === "lecturer") {
    // Lecturers see their own posts + announcements addressed to lecturers/all by admin
    return { ...base, $or: [{ author: user._id }, { audience: { $in: ["all", "lecturers"] }, author: { $ne: user._id } }] };
  }

  if (user.role === "student") {
    // Students see announcements aimed at "all" or "students"
    return { ...base, audience: { $in: ["all", "students"] } };
  }

  if (["admin", "superadmin", "manager"].includes(user.role)) {
    // Admins/managers see everything in their company
    return base;
  }

  // Any other role — nothing
  return { ...base, _id: null };
}

// GET /api/announcements
exports.list = async (req, res) => {
  try {
    const filter = visibilityFilter(req.user);

    const announcements = await Announcement.find(filter)
      .populate("author", "name role")
      .sort({ pinned: -1, createdAt: -1 })
      .limit(100);

    const userId = req.user._id.toString();
    const mapped = announcements.map(a => ({
      ...a.toObject(),
      isRead: a.readBy.some(id => id.toString() === userId),
      readCount: a.readBy.length,
    }));

    res.json({ announcements: mapped });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch announcements" });
  }
};

// POST /api/announcements
exports.create = async (req, res) => {
  try {
    if (!CAN_POST.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to post announcements" });
    }

    const { title, body, type, audience, pinned, expiresAt } = req.body;
    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({ error: "Title and body are required" });
    }

    // Lecturers can only post to their own students — force audience to "students"
    let resolvedAudience;
    if (req.user.role === "lecturer") {
      resolvedAudience = "students";
    } else {
      resolvedAudience = ["all", "students", "employees", "lecturers"].includes(audience) ? audience : "all";
    }

    const ann = await Announcement.create({
      company:   req.user.company,
      author:    req.user._id,
      title:     title.trim(),
      body:      body.trim(),
      type:      ["info", "warning", "success", "urgent"].includes(type) ? type : "info",
      audience:  resolvedAudience,
      pinned:    req.user.role === "lecturer" ? false : !!pinned,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });

    const populated = await ann.populate("author", "name role");
    res.status(201).json({ announcement: { ...populated.toObject(), isRead: false, readCount: 0 } });
  } catch (err) {
    res.status(500).json({ error: "Failed to create announcement" });
  }
};

// PATCH /api/announcements/:id/read
exports.markRead = async (req, res) => {
  try {
    await Announcement.updateOne(
      { _id: req.params.id, company: req.user.company },
      { $addToSet: { readBy: req.user._id } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as read" });
  }
};

// DELETE /api/announcements/:id
exports.remove = async (req, res) => {
  try {
    if (!CAN_POST.includes(req.user.role)) {
      return res.status(403).json({ error: "Permission denied" });
    }

    const filter = { _id: req.params.id, company: req.user.company };
    // Non-admins can only delete their own
    if (!["admin", "superadmin"].includes(req.user.role)) {
      filter.author = req.user._id;
    }

    const ann = await Announcement.findOneAndDelete(filter);
    if (!ann) return res.status(404).json({ error: "Announcement not found or access denied" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete announcement" });
  }
};

// PATCH /api/announcements/:id/pin — admin only
exports.togglePin = async (req, res) => {
  try {
    if (!["admin", "superadmin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Only admins can pin announcements" });
    }
    const ann = await Announcement.findOne({ _id: req.params.id, company: req.user.company });
    if (!ann) return res.status(404).json({ error: "Not found" });
    ann.pinned = !ann.pinned;
    await ann.save();
    res.json({ pinned: ann.pinned });
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle pin" });
  }
};

// GET /api/announcements/unread-count
exports.unreadCount = async (req, res) => {
  try {
    const filter = visibilityFilter(req.user);
    filter.readBy = { $ne: req.user._id };
    const count = await Announcement.countDocuments(filter);
    res.json({ count });
  } catch (err) {
    res.json({ count: 0 });
  }
};
