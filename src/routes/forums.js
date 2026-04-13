"use strict";

/**
 * forums.js
 * Mounted at: /api/forums   (registered in server.js)
 *
 * Course Discussion Forum — threads and posts per course.
 *
 * Access model
 * ------------
 * "participant"  = enrolled student OR staff (lecturer, hod, admin, superadmin)
 * "staff"        = lecturer, hod, admin, superadmin
 *
 * Route summary
 * -------------
 * Threads
 *   GET    /courses/:courseId/threads              list threads (paginated)
 *   POST   /courses/:courseId/threads              create thread
 *   GET    /courses/:courseId/threads/:threadId    view thread + posts (paginated)
 *   PATCH  /courses/:courseId/threads/:threadId    edit title / body / tags (author)
 *   DELETE /courses/:courseId/threads/:threadId    soft-delete (author or staff)
 *   PATCH  /courses/:courseId/threads/:threadId/pin     toggle pin (staff)
 *   PATCH  /courses/:courseId/threads/:threadId/lock    toggle lock (staff)
 *   PATCH  /courses/:courseId/threads/:threadId/solve   toggle solved (thread author or staff)
 *
 * Posts (replies)
 *   POST   /courses/:courseId/threads/:threadId/posts                  reply
 *   PATCH  /courses/:courseId/threads/:threadId/posts/:postId          edit body (author)
 *   DELETE /courses/:courseId/threads/:threadId/posts/:postId          soft-delete (author or staff)
 *   PATCH  /courses/:courseId/threads/:threadId/posts/:postId/upvote   toggle upvote
 *   PATCH  /courses/:courseId/threads/:threadId/posts/:postId/answer   mark/unmark answer (thread author or staff)
 *
 * Academic mode only.
 */

const express  = require("express");
const router   = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole, requireMode }  = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const ForumThread  = require("../models/ForumThread");
const ForumPost    = require("../models/ForumPost");
const Course       = require("../models/Course");

// ── Shared middleware stack ──────────────────────────────────────────────────
const mw = [authenticate, requireMode("academic"), requireActiveSubscription, companyIsolation];

const STAFF_ROLES = ["lecturer", "hod", "admin", "superadmin"];

function isStaff(role) {
  return STAFF_ROLES.includes(role);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve and validate the course; check participant access.
 * Students must be enrolled. Staff always pass.
 * Returns the course doc on success, null (after sending error) on failure.
 */
async function resolveParticipant(req, res, courseId) {
  const company = req.user.company;
  const course  = await Course.findOne({ _id: courseId, company })
    .select("enrolledStudents lecturer")
    .lean();
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return null;
  }
  if (req.user.role === "student") {
    const enrolled = (course.enrolledStudents || []).some(
      id => id.toString() === req.user._id.toString()
    );
    if (!enrolled) {
      res.status(403).json({ error: "You are not enrolled in this course" });
      return null;
    }
  }
  return course;
}

/**
 * Build a safe representation of a deleted post body.
 */
function maskDeleted(post) {
  if (post.isDeleted) {
    return { ...post, body: "[deleted]", upvotes: [], upvoteCount: 0 };
  }
  return post;
}

function parsePage(query) {
  const page  = Math.max(1, parseInt(query.page,  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// ════════════════════════════════════════════════════════════════════════════
// THREAD ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// GET /courses/:courseId/threads  — list threads
// ---------------------------------------------------------------------------
router.get("/courses/:courseId/threads", ...mw, async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    if (!(await resolveParticipant(req, res, courseId))) return;

    const { page, limit, skip } = parsePage(req.query);

    const filter = { company, course: courseId, isDeleted: false };
    if (req.query.type) filter.type = req.query.type;
    if (req.query.search) {
      filter.title = { $regex: req.query.search.trim(), $options: "i" };
    }

    const [threads, total] = await Promise.all([
      ForumThread.find(filter)
        .populate("author", "name role")
        .sort({ isPinned: -1, lastReplyAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ForumThread.countDocuments(filter),
    ]);

    res.json({ threads, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error("list threads:", err);
    res.status(500).json({ error: "Failed to fetch threads" });
  }
});

// ---------------------------------------------------------------------------
// POST /courses/:courseId/threads  — create thread
// ---------------------------------------------------------------------------
router.post("/courses/:courseId/threads", ...mw, async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    if (!(await resolveParticipant(req, res, courseId))) return;

    const { title, body, type = "discussion", tags } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    const validTypes = ForumThread.THREAD_TYPES;
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${validTypes.join(", ")}` });
    }

    // Only staff may post announcements
    if (type === "announcement" && !isStaff(req.user.role)) {
      return res.status(403).json({ error: "Only staff may create announcement threads" });
    }

    const thread = await ForumThread.create({
      company,
      course:    courseId,
      author:    req.user._id,
      title:     title.trim(),
      body:      (body || "").trim(),
      type,
      tags:      Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [],
      lastReplyAt: new Date(),
    });

    await thread.populate("author", "name role");

    res.status(201).json({ thread });
  } catch (err) {
    console.error("create thread:", err);
    res.status(500).json({ error: "Failed to create thread" });
  }
});

// ---------------------------------------------------------------------------
// GET /courses/:courseId/threads/:threadId  — view thread + posts
// ---------------------------------------------------------------------------
router.get("/courses/:courseId/threads/:threadId", ...mw, async (req, res) => {
  try {
    const { courseId, threadId } = req.params;
    const company                = req.user.company;

    if (!(await resolveParticipant(req, res, courseId))) return;

    const thread = await ForumThread.findOne({ _id: threadId, company, course: courseId, isDeleted: false })
      .populate("author", "name role")
      .lean();
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    // Increment view count (fire-and-forget, non-critical)
    ForumThread.updateOne({ _id: threadId }, { $inc: { viewCount: 1 } }).catch(() => {});

    const { page, limit, skip } = parsePage(req.query);

    const postFilter = { company, thread: threadId };
    const [posts, total] = await Promise.all([
      ForumPost.find(postFilter)
        .populate("author", "name role")
        .populate("parentPost", "author body")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ForumPost.countDocuments(postFilter),
    ]);

    const myId = req.user._id.toString();
    const safePosts = posts.map(p => {
      const masked = maskDeleted(p);
      return {
        ...masked,
        hasUpvoted: (masked.upvotes || []).some(id => id.toString() === myId),
      };
    });

    res.json({
      thread,
      posts: safePosts,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error("view thread:", err);
    res.status(500).json({ error: "Failed to fetch thread" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/threads/:threadId  — edit thread (author)
// ---------------------------------------------------------------------------
router.patch("/courses/:courseId/threads/:threadId", ...mw, async (req, res) => {
  try {
    const { courseId, threadId } = req.params;
    const company                = req.user.company;

    if (!(await resolveParticipant(req, res, courseId))) return;

    const thread = await ForumThread.findOne({ _id: threadId, company, course: courseId, isDeleted: false });
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    if (thread.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You can only edit your own threads" });
    }

    const { title, body, tags } = req.body;
    if (title !== undefined) thread.title = title.trim();
    if (body  !== undefined) thread.body  = body.trim();
    if (Array.isArray(tags))  thread.tags  = tags.map(t => String(t).trim()).filter(Boolean);
    thread.editedAt = new Date();

    await thread.save();
    await thread.populate("author", "name role");

    res.json({ thread });
  } catch (err) {
    console.error("edit thread:", err);
    res.status(500).json({ error: "Failed to edit thread" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /courses/:courseId/threads/:threadId  — soft-delete (author or staff)
// ---------------------------------------------------------------------------
router.delete("/courses/:courseId/threads/:threadId", ...mw, async (req, res) => {
  try {
    const { courseId, threadId } = req.params;
    const company                = req.user.company;

    if (!(await resolveParticipant(req, res, courseId))) return;

    const thread = await ForumThread.findOne({ _id: threadId, company, course: courseId, isDeleted: false });
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    const isOwner = thread.author.toString() === req.user._id.toString();
    if (!isOwner && !isStaff(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to delete this thread" });
    }

    thread.isDeleted = true;
    await thread.save();

    res.json({ message: "Thread deleted" });
  } catch (err) {
    console.error("delete thread:", err);
    res.status(500).json({ error: "Failed to delete thread" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/threads/:threadId/pin  — toggle pin (staff)
// ---------------------------------------------------------------------------
router.patch("/courses/:courseId/threads/:threadId/pin", ...mw, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    const { courseId, threadId } = req.params;
    const company                = req.user.company;

    const thread = await ForumThread.findOne({ _id: threadId, company, course: courseId, isDeleted: false });
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    thread.isPinned = !thread.isPinned;
    await thread.save();

    res.json({ isPinned: thread.isPinned });
  } catch (err) {
    console.error("toggle pin:", err);
    res.status(500).json({ error: "Failed to toggle pin" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/threads/:threadId/lock  — toggle lock (staff)
// ---------------------------------------------------------------------------
router.patch("/courses/:courseId/threads/:threadId/lock", ...mw, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    const { courseId, threadId } = req.params;
    const company                = req.user.company;

    const thread = await ForumThread.findOne({ _id: threadId, company, course: courseId, isDeleted: false });
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    thread.isLocked = !thread.isLocked;
    await thread.save();

    res.json({ isLocked: thread.isLocked });
  } catch (err) {
    console.error("toggle lock:", err);
    res.status(500).json({ error: "Failed to toggle lock" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/threads/:threadId/solve  — toggle solved (thread author or staff)
// ---------------------------------------------------------------------------
router.patch("/courses/:courseId/threads/:threadId/solve", ...mw, async (req, res) => {
  try {
    const { courseId, threadId } = req.params;
    const company                = req.user.company;

    if (!(await resolveParticipant(req, res, courseId))) return;

    const thread = await ForumThread.findOne({ _id: threadId, company, course: courseId, isDeleted: false });
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    if (thread.type !== "question") {
      return res.status(400).json({ error: "Only question threads can be marked as solved" });
    }

    const isOwner = thread.author.toString() === req.user._id.toString();
    if (!isOwner && !isStaff(req.user.role)) {
      return res.status(403).json({ error: "Only the thread author or staff can mark this as solved" });
    }

    thread.isSolved = !thread.isSolved;
    await thread.save();

    res.json({ isSolved: thread.isSolved });
  } catch (err) {
    console.error("toggle solve:", err);
    res.status(500).json({ error: "Failed to toggle solved status" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST (REPLY) ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// POST /courses/:courseId/threads/:threadId/posts  — reply
// ---------------------------------------------------------------------------
router.post("/courses/:courseId/threads/:threadId/posts", ...mw, async (req, res) => {
  try {
    const { courseId, threadId } = req.params;
    const company                = req.user.company;

    if (!(await resolveParticipant(req, res, courseId))) return;

    const thread = await ForumThread.findOne({ _id: threadId, company, course: courseId, isDeleted: false });
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    if (thread.isLocked && !isStaff(req.user.role)) {
      return res.status(403).json({ error: "This thread is locked" });
    }

    const { body, parentPost } = req.body;
    if (!body?.trim()) {
      return res.status(400).json({ error: "body is required" });
    }

    // Validate parentPost belongs to the same thread if provided
    if (parentPost) {
      const parent = await ForumPost.findOne({ _id: parentPost, thread: threadId, isDeleted: false })
        .select("_id").lean();
      if (!parent) return res.status(400).json({ error: "parentPost not found in this thread" });
    }

    const post = await ForumPost.create({
      company,
      course:     courseId,
      thread:     threadId,
      author:     req.user._id,
      body:       body.trim(),
      parentPost: parentPost || null,
    });

    // Update thread cached counters
    await ForumThread.updateOne(
      { _id: threadId },
      { $inc: { replyCount: 1 }, $set: { lastReplyAt: new Date() } }
    );

    await post.populate("author", "name role");

    res.status(201).json({ post });
  } catch (err) {
    console.error("create post:", err);
    res.status(500).json({ error: "Failed to create post" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/threads/:threadId/posts/:postId/upvote  — toggle upvote
// Must be declared BEFORE /:postId to avoid Express shadowing.
// ---------------------------------------------------------------------------
router.patch("/courses/:courseId/threads/:threadId/posts/:postId/upvote", ...mw, async (req, res) => {
  try {
    const { courseId, threadId, postId } = req.params;
    const company                        = req.user.company;

    if (!(await resolveParticipant(req, res, courseId))) return;

    const post = await ForumPost.findOne({ _id: postId, company, thread: threadId, isDeleted: false });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const userId  = req.user._id;
    const already = post.upvotes.some(id => id.toString() === userId.toString());

    if (already) {
      post.upvotes    = post.upvotes.filter(id => id.toString() !== userId.toString());
      post.upvoteCount = Math.max(0, post.upvoteCount - 1);
    } else {
      post.upvotes.push(userId);
      post.upvoteCount += 1;
    }

    await post.save();

    res.json({ upvoteCount: post.upvoteCount, hasUpvoted: !already });
  } catch (err) {
    console.error("toggle upvote:", err);
    res.status(500).json({ error: "Failed to toggle upvote" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/threads/:threadId/posts/:postId/answer  — mark/unmark answer
// Must be declared BEFORE /:postId to avoid shadowing.
// ---------------------------------------------------------------------------
router.patch("/courses/:courseId/threads/:threadId/posts/:postId/answer", ...mw, async (req, res) => {
  try {
    const { courseId, threadId, postId } = req.params;
    const company                        = req.user.company;

    if (!(await resolveParticipant(req, res, courseId))) return;

    const thread = await ForumThread.findOne({ _id: threadId, company, course: courseId, isDeleted: false });
    if (!thread) return res.status(404).json({ error: "Thread not found" });

    if (thread.type !== "question") {
      return res.status(400).json({ error: "Answer marking is only available on question threads" });
    }

    const isOwner = thread.author.toString() === req.user._id.toString();
    if (!isOwner && !isStaff(req.user.role)) {
      return res.status(403).json({ error: "Only the thread author or staff can mark an answer" });
    }

    const post = await ForumPost.findOne({ _id: postId, company, thread: threadId, isDeleted: false });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const newIsAnswer = !post.isAnswer;

    // Unmark any previously accepted answer if we are marking a new one
    if (newIsAnswer) {
      await ForumPost.updateMany({ thread: threadId, isAnswer: true }, { $set: { isAnswer: false } });
    }

    post.isAnswer = newIsAnswer;
    await post.save();

    // Sync thread.isSolved
    await ForumThread.updateOne({ _id: threadId }, { $set: { isSolved: newIsAnswer } });

    res.json({ isAnswer: post.isAnswer, threadSolved: newIsAnswer });
  } catch (err) {
    console.error("mark answer:", err);
    res.status(500).json({ error: "Failed to mark answer" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /courses/:courseId/threads/:threadId/posts/:postId  — edit post (author)
// ---------------------------------------------------------------------------
router.patch("/courses/:courseId/threads/:threadId/posts/:postId", ...mw, async (req, res) => {
  try {
    const { courseId, threadId, postId } = req.params;
    const company                        = req.user.company;

    if (!(await resolveParticipant(req, res, courseId))) return;

    const post = await ForumPost.findOne({ _id: postId, company, thread: threadId, isDeleted: false });
    if (!post) return res.status(404).json({ error: "Post not found" });

    if (post.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You can only edit your own posts" });
    }

    const { body } = req.body;
    if (!body?.trim()) {
      return res.status(400).json({ error: "body is required" });
    }

    post.body     = body.trim();
    post.editedAt = new Date();
    await post.save();

    await post.populate("author", "name role");
    res.json({ post });
  } catch (err) {
    console.error("edit post:", err);
    res.status(500).json({ error: "Failed to edit post" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /courses/:courseId/threads/:threadId/posts/:postId  — soft-delete
// ---------------------------------------------------------------------------
router.delete("/courses/:courseId/threads/:threadId/posts/:postId", ...mw, async (req, res) => {
  try {
    const { courseId, threadId, postId } = req.params;
    const company                        = req.user.company;

    if (!(await resolveParticipant(req, res, courseId))) return;

    const post = await ForumPost.findOne({ _id: postId, company, thread: threadId, isDeleted: false });
    if (!post) return res.status(404).json({ error: "Post not found" });

    const isOwner = post.author.toString() === req.user._id.toString();
    if (!isOwner && !isStaff(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission to delete this post" });
    }

    post.isDeleted = true;
    post.deletedBy = req.user._id;
    post.deletedAt = new Date();
    await post.save();

    // Decrement thread reply count
    await ForumThread.updateOne(
      { _id: threadId },
      { $inc: { replyCount: -1 } }
    );

    res.json({ message: "Post deleted" });
  } catch (err) {
    console.error("delete post:", err);
    res.status(500).json({ error: "Failed to delete post" });
  }
});

module.exports = router;
