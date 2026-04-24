"use strict";

/**
 * faqController.js
 *
 * Handles all FAQ assistant logic:
 *   ask()          — chat endpoint: FAQ lookup → AI fallback → log
 *   escalate()     — convert a query to a support ticket
 *   rateAnswer()   — thumbs-up / thumbs-down feedback on a query
 *   listFAQs()     — paginated list with category / role filter
 *   getFAQ()       — single FAQ
 *   createFAQ()    — admin: add knowledge base entry
 *   updateFAQ()    — admin: edit entry
 *   deleteFAQ()    — admin: remove entry
 *   getQueries()   — admin: paginated query log
 *   getStats()     — admin: aggregate FAQ + query statistics
 */

const FAQ        = require("../models/FAQ");
const FAQQuery   = require("../models/FAQQuery");
const SupportTicket = require("../models/SupportTicket");
const Company    = require("../models/Company");
const { callAI } = require("../services/aiFaqService");
const { FAQ_CATEGORIES, CORPORATE_CATEGORIES, ACADEMIC_CATEGORIES } = FAQ;

// Returns the allowed category Set for a company mode, or null for superadmin (no restriction).
async function _modeFilter(req) {
  if (req.user.role === 'superadmin') return null; // platform admin — no restriction
  const company = await Company.findById(req.user.company).select('mode').lean();
  const mode = company?.mode || 'academic';
  return mode === 'corporate' ? CORPORATE_CATEGORIES : ACADEMIC_CATEGORIES;
}
const { Types: { ObjectId } } = require("mongoose");

// ── Helpers ──────────────────────────────────────────────────────────────────

function parsePage(q) {
  const page  = Math.max(1, parseInt(q.page,  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

async function nextTicketNumber(company) {
  const count = await SupportTicket.countDocuments({ company });
  return `TK-${String(count + 1).padStart(5, "0")}`;
}

// ── ask ───────────────────────────────────────────────────────────────────────

/**
 * POST /api/faq/ask
 *
 * Flow:
 *  1. Search FAQ database (MongoDB full-text)
 *  2. If match found  → return FAQ answer, increment viewCount
 *  3. If no match     → call AI with related FAQs as context
 *  4. Log the query in FAQQuery for admin review
 *  5. Return { source, answer, queryId, confidenceLow }
 */
exports.ask = async (req, res) => {
  try {
    const company = req.user.company;
    const { question, category } = req.body;

    if (!question?.trim()) {
      return res.status(400).json({ error: "question is required" });
    }
    const q = question.trim().slice(0, 500);

    // ── 1. FAQ full-text search ──────────────────────────────────────────
    const faqFilter = { company, isActive: true };

    // Mode filter — only return FAQs that belong to this company's mode
    const allowedCategories = await _modeFilter(req);
    if (allowedCategories) {
      faqFilter.category = { $in: Array.from(allowedCategories) };
    }

    if (category && FAQ_CATEGORIES.includes(category)) {
      // If a specific category is requested, honour it only if it's in the allowed set
      if (!allowedCategories || allowedCategories.has(category)) {
        faqFilter.category = category;
      }
    }

    // Role-based filtering: return FAQs targeting this role or with no restriction
    const role = req.user.role;
    faqFilter.$or = [
      { targetRoles: { $size: 0 } },
      { targetRoles: role },
    ];

    let matchedFAQ = null;

    try {
      const textResults = await FAQ.find(
        { ...faqFilter, $text: { $search: q } },
        { score: { $meta: "textScore" } }
      )
        .sort({ score: { $meta: "textScore" } })
        .limit(1)
        .lean();

      if (textResults.length > 0) {
        matchedFAQ = textResults[0];
      }
    } catch (_) {
      // Text index may not exist yet on a fresh DB — fall through to AI
    }

    // ── 2. FAQ match found ───────────────────────────────────────────────
    if (matchedFAQ) {
      await FAQ.updateOne({ _id: matchedFAQ._id }, { $inc: { viewCount: 1 } });

      const queryDoc = await FAQQuery.create({
        company,
        user:       req.user._id,
        userRole:   role,
        question:   q,
        source:     "faq",
        matchedFAQ: matchedFAQ._id,
        confidenceHigh: true,
      });

      return res.json({
        source:       "faq",
        answer:       matchedFAQ.answer,
        category:     matchedFAQ.category,
        faq:          { _id: matchedFAQ._id, question: matchedFAQ.question },
        queryId:      queryDoc._id,
        confidenceLow: false,
      });
    }

    // ── 3. No FAQ match — call AI ────────────────────────────────────────
    // Pass related FAQs from same category as context (up to 5)
    const contextFAQs = await FAQ.find(faqFilter)
      .select("question answer")
      .limit(5)
      .lean();

    let aiText         = null;
    let confidenceHigh = false;

    try {
      const result = await callAI(q, contextFAQs);
      aiText         = result.text;
      confidenceHigh = result.confidenceHigh;
    } catch (aiErr) {
      console.error("AI FAQ service error:", aiErr.message);
      aiText         = "I'm having trouble connecting to the AI service right now. Please try again shortly, or create a support ticket and our team will assist you.";
      confidenceHigh = false;
    }

    const queryDoc = await FAQQuery.create({
      company,
      user:           req.user._id,
      userRole:       role,
      question:       q,
      source:         "ai",
      aiResponse:     aiText,
      confidenceHigh,
    });

    return res.json({
      source:        "ai",
      answer:        aiText,
      queryId:       queryDoc._id,
      confidenceLow: !confidenceHigh,
    });

  } catch (err) {
    console.error("faq ask:", err);
    res.status(500).json({ error: "Failed to process question" });
  }
};

// ── escalate ──────────────────────────────────────────────────────────────────

/**
 * POST /api/faq/escalate/:queryId
 *
 * Converts an unresolved FAQ query into a SupportTicket.
 * Only the query owner can escalate their own query.
 */
exports.escalate = async (req, res) => {
  try {
    const company = req.user.company;

    const faqQuery = await FAQQuery.findOne({
      _id:     req.params.queryId,
      company,
      user:    req.user._id,
    });
    if (!faqQuery) return res.status(404).json({ error: "Query not found" });

    if (faqQuery.escalatedToTicket) {
      return res.status(409).json({
        error:    "Already escalated",
        ticketId: faqQuery.ticketId,
      });
    }

    const ticketNumber = await nextTicketNumber(company);

    const description = [
      `Original question: ${faqQuery.question}`,
      faqQuery.aiResponse
        ? `\nAI response:\n${faqQuery.aiResponse}`
        : "",
      `\nAsked at: ${faqQuery.createdAt.toISOString()}`,
      `\nSource: ${faqQuery.source}`,
    ].filter(Boolean).join("\n");

    const ticket = await SupportTicket.create({
      company,
      createdBy:   req.user._id,
      ticketNumber,
      subject:     faqQuery.question.slice(0, 250),
      description: description.trim(),
      category:    "general",
      priority:    "medium",
    });

    faqQuery.escalatedToTicket = true;
    faqQuery.ticketId          = ticket._id;
    await faqQuery.save();

    await ticket.populate("createdBy", "name role");
    res.status(201).json({ ticket, message: "Support ticket created" });
  } catch (err) {
    console.error("faq escalate:", err);
    res.status(500).json({ error: "Failed to create support ticket" });
  }
};

// ── rateAnswer ────────────────────────────────────────────────────────────────

/**
 * PATCH /api/faq/rate/:queryId
 * Body: { helpful: true | false }
 */
exports.rateAnswer = async (req, res) => {
  try {
    const company = req.user.company;
    const { helpful } = req.body;

    if (typeof helpful !== "boolean") {
      return res.status(400).json({ error: "helpful must be true or false" });
    }

    const faqQuery = await FAQQuery.findOne({
      _id: req.params.queryId, company, user: req.user._id,
    });
    if (!faqQuery) return res.status(404).json({ error: "Query not found" });

    // If already rated, reverse the old counter before applying new one
    if (faqQuery.wasHelpful === true && !helpful) {
      if (faqQuery.matchedFAQ) {
        await FAQ.updateOne({ _id: faqQuery.matchedFAQ }, { $inc: { helpfulCount: -1, notHelpfulCount: 1 } });
      }
    } else if (faqQuery.wasHelpful === false && helpful) {
      if (faqQuery.matchedFAQ) {
        await FAQ.updateOne({ _id: faqQuery.matchedFAQ }, { $inc: { helpfulCount: 1, notHelpfulCount: -1 } });
      }
    } else if (faqQuery.wasHelpful === null) {
      if (faqQuery.matchedFAQ) {
        await FAQ.updateOne(
          { _id: faqQuery.matchedFAQ },
          { $inc: { [helpful ? "helpfulCount" : "notHelpfulCount"]: 1 } }
        );
      }
    }

    faqQuery.wasHelpful = helpful;
    await faqQuery.save();

    res.json({ rated: true, helpful });
  } catch (err) {
    console.error("faq rate:", err);
    res.status(500).json({ error: "Failed to rate answer" });
  }
};

// ── listFAQs ─────────────────────────────────────────────────────────────────

exports.listFAQs = async (req, res) => {
  try {
    const company = req.user.company;
    const { page, limit, skip } = parsePage(req.query);
    const role = req.user.role;

    const filter = { company, isActive: true };

    // Mode filter — strictly restrict to the company's mode categories
    const allowedCategories = await _modeFilter(req);
    if (allowedCategories) {
      filter.category = { $in: Array.from(allowedCategories) };
    }

    // If a specific category is requested, honour it only when inside the allowed set
    if (req.query.category) {
      if (!allowedCategories || allowedCategories.has(req.query.category)) {
        filter.category = req.query.category;
      }
      // If the requested category is outside the allowed set, ignore the param
      // (the broad mode filter above already restricts results correctly)
    }

    // Non-superadmin users only see FAQs that target their role (or all roles)
    if (role !== 'superadmin') {
      filter.$or = [
        { targetRoles: { $size: 0 } },
        { targetRoles: role },
      ];
    }

    const [faqs, total] = await Promise.all([
      FAQ.find(filter)
        .select("-keywords")
        .sort({ category: 1, question: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FAQ.countDocuments(filter),
    ]);

    res.json({ faqs, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error("list faqs:", err);
    res.status(500).json({ error: "Failed to fetch FAQs" });
  }
};

// ── getFAQ ────────────────────────────────────────────────────────────────────

exports.getFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findOne({ _id: req.params.id, company: req.user.company, isActive: true }).lean();
    if (!faq) return res.status(404).json({ error: "FAQ not found" });
    res.json({ faq });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch FAQ" });
  }
};

// ── createFAQ ─────────────────────────────────────────────────────────────────

exports.createFAQ = async (req, res) => {
  try {
    const company = req.user.company;
    const { question, answer, category, keywords, targetRoles } = req.body;

    if (!question?.trim()) return res.status(400).json({ error: "question is required" });
    if (!answer?.trim())   return res.status(400).json({ error: "answer is required" });

    if (category && !FAQ_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${FAQ_CATEGORIES.join(", ")}` });
    }

    // Enforce mode: category must belong to the company's mode
    if (category && req.user.role !== 'superadmin') {
      const allowedCats = await _modeFilter(req);
      if (allowedCats && !allowedCats.has(category)) {
        return res.status(400).json({ error: `Category "${category}" is not available in your portal's mode.` });
      }
    }

    const faq = await FAQ.create({
      company,
      question:    question.trim(),
      answer:      answer.trim(),
      category:    category || "general",
      keywords:    Array.isArray(keywords)    ? keywords.map(k => String(k).trim()).filter(Boolean) : [],
      targetRoles: Array.isArray(targetRoles) ? targetRoles : [],
      createdBy:   req.user._id,
    });

    res.status(201).json({ faq });
  } catch (err) {
    console.error("create faq:", err);
    res.status(500).json({ error: "Failed to create FAQ" });
  }
};

// ── updateFAQ ─────────────────────────────────────────────────────────────────

exports.updateFAQ = async (req, res) => {
  try {
    const company = req.user.company;
    const faq = await FAQ.findOne({ _id: req.params.id, company });
    if (!faq) return res.status(404).json({ error: "FAQ not found" });

    if (req.body.category !== undefined && !FAQ_CATEGORIES.includes(req.body.category)) {
      return res.status(400).json({ error: `category must be one of: ${FAQ_CATEGORIES.join(", ")}` });
    }
    if (req.body.category !== undefined && req.user.role !== 'superadmin') {
      const allowedCats = await _modeFilter(req);
      if (allowedCats && !allowedCats.has(req.body.category)) {
        return res.status(400).json({ error: `Category "${req.body.category}" is not available in your portal's mode.` });
      }
    }
    const EDITABLE = ["question", "answer", "category", "keywords", "targetRoles", "isActive"];
    for (const key of EDITABLE) {
      if (req.body[key] !== undefined) faq[key] = req.body[key];
    }
    faq.updatedBy = req.user._id;
    await faq.save();

    res.json({ faq });
  } catch (err) {
    console.error("update faq:", err);
    res.status(500).json({ error: "Failed to update FAQ" });
  }
};

// ── deleteFAQ ─────────────────────────────────────────────────────────────────

exports.deleteFAQ = async (req, res) => {
  try {
    const faq = await FAQ.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $set: { isActive: false, updatedBy: req.user._id } }
    );
    if (!faq) return res.status(404).json({ error: "FAQ not found" });
    res.json({ message: "FAQ deactivated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete FAQ" });
  }
};

// ── getQueries (admin) ────────────────────────────────────────────────────────

/**
 * GET /api/faq/admin/queries
 * Query params: source, escalated, helpful, page, limit
 */
exports.getQueries = async (req, res) => {
  try {
    const company = req.user.company;
    const { page, limit, skip } = parsePage(req.query);

    const filter = { company };
    if (req.query.source)    filter.source = req.query.source;
    if (req.query.escalated !== undefined) {
      filter.escalatedToTicket = req.query.escalated === "true";
    }
    if (req.query.helpful !== undefined && req.query.helpful !== "") {
      filter.wasHelpful = req.query.helpful === "true" ? true
        : req.query.helpful === "false" ? false
        : null;
    }
    // Filter to unresolved AI queries (common admin use-case)
    if (req.query.unanswered === "true") {
      filter.source            = "ai";
      filter.escalatedToTicket = false;
    }

    const [queries, total] = await Promise.all([
      FAQQuery.find(filter)
        .populate("user",       "name role email")
        .populate("matchedFAQ", "question category")
        .populate("ticketId",   "ticketNumber status")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FAQQuery.countDocuments(filter),
    ]);

    res.json({ queries, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error("faq queries:", err);
    res.status(500).json({ error: "Failed to fetch queries" });
  }
};

// ── getStats (admin) ──────────────────────────────────────────────────────────

exports.getStats = async (req, res) => {
  try {
    const company = req.user.company;

    const [
      totalFAQs,
      faqsByCategory,
      totalQueries,
      sourceBreakdown,
      escalatedCount,
      helpfulCount,
      topFAQs,
      recentUnresolved,
    ] = await Promise.all([
      FAQ.countDocuments({ company, isActive: true }),

      FAQ.aggregate([
        { $match: { company: new ObjectId(company), isActive: true } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      FAQQuery.countDocuments({ company }),

      FAQQuery.aggregate([
        { $match: { company: new ObjectId(company) } },
        { $group: { _id: "$source", count: { $sum: 1 } } },
      ]),

      FAQQuery.countDocuments({ company, escalatedToTicket: true }),

      FAQQuery.countDocuments({ company, wasHelpful: true }),

      // Top 5 most-viewed FAQs
      FAQ.find({ company, isActive: true })
        .select("question category viewCount helpfulCount notHelpfulCount")
        .sort({ viewCount: -1 })
        .limit(5)
        .lean(),

      // Recent AI-answered queries not yet escalated (needs attention)
      FAQQuery.countDocuments({
        company,
        source:            "ai",
        escalatedToTicket: false,
        confidenceHigh:    false,
      }),
    ]);

    res.json({
      faqs:    { total: totalFAQs, byCategory: faqsByCategory },
      queries: {
        total:            totalQueries,
        bySource:         sourceBreakdown,
        escalated:        escalatedCount,
        helpful:          helpfulCount,
        needsAttention:   recentUnresolved,
      },
      topFAQs,
    });
  } catch (err) {
    console.error("faq stats:", err);
    res.status(500).json({ error: "Failed to fetch FAQ stats" });
  }
};

// ── promoteToFAQ (admin) ──────────────────────────────────────────────────────

/**
 * POST /api/faq/admin/promote/:queryId
 * Converts an AI-answered query into a new FAQ entry, pre-filled with
 * the question and AI response so the admin just needs to review/edit.
 */
exports.promoteToFAQ = async (req, res) => {
  try {
    const company = req.user.company;

    const faqQuery = await FAQQuery.findOne({ _id: req.params.queryId, company });
    if (!faqQuery) return res.status(404).json({ error: "Query not found" });

    const { category, answer } = req.body;

    const faq = await FAQ.create({
      company,
      question:  faqQuery.question,
      answer:    (answer || faqQuery.aiResponse || "").trim(),
      category:  category || "general",
      createdBy: req.user._id,
    });

    res.status(201).json({ faq, message: "Query promoted to FAQ" });
  } catch (err) {
    console.error("promote to faq:", err);
    res.status(500).json({ error: "Failed to promote query" });
  }
};
