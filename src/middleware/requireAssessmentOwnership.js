"use strict";

/**
 * requireAssessmentOwnership
 *
 * A factory middleware that verifies:
 *   1. The assessment (quiz / snap-quiz / assignment / question bank item / AI draft)
 *      exists and belongs to the authenticated user's company.
 *   2. The authenticated lecturer is the `createdBy` owner of that assessment.
 *   3. The lecturer is still actively assigned to the assessment's course.
 *
 * Depends on:
 *   - authenticate        (req.user populated)
 *   - requireCompanyScope (req.companyId populated)
 *
 * On success, attaches to req:
 *   req.assessment  — the loaded assessment document
 *   req.course      — the related Course document (if not already on req)
 *
 * Admin / superadmin bypass:
 *   Full access — ownership and course assignment are not checked.
 *
 * Usage
 * ─────
 *   const ownsQuiz = requireAssessmentOwnership(NormalQuiz, {
 *     getAssessmentId: (req) => req.params.quizId,
 *   });
 *   router.put("/:quizId", authenticate, requireCompanyScope, ownsQuiz, updateHandler);
 *
 *   // For assignments:
 *   const ownsAssignment = requireAssessmentOwnership(Assignment);
 *   router.delete("/:id", authenticate, requireCompanyScope, ownsAssignment, deleteHandler);
 *
 *   // For AI drafts (no course assignment check needed):
 *   const ownsDraft = requireAssessmentOwnership(AIQuestionDraft, { skipCourseCheck: true });
 *   router.get("/:id", authenticate, requireCompanyScope, ownsDraft, getHandler);
 */

const mongoose = require("mongoose");
const { assertLecturerOwnsAssessment, LecturerNotAssignedError } = require("../utils/academicScope");
const { ResourceNotFoundError, TenantMismatchError }             = require("../utils/tenantScope");

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * @param {mongoose.Model} Model            - The Mongoose model for the assessment.
 * @param {Object}         [options]
 * @param {Function}       [options.getAssessmentId]  - (req) → string|ObjectId. Defaults to req.params.id.
 * @param {string}         [options.courseField]      - Field on the assessment pointing to its Course. Default "course".
 * @param {boolean}        [options.skipCourseCheck]  - Skip the course-assignment check (for AI drafts, bank items). Default false.
 * @param {string|Object}  [options.select]           - Mongoose select projection when loading the assessment.
 * @param {string|Object}  [options.populate]         - Mongoose populate config.
 */
const requireAssessmentOwnership = (Model, options = {}) => {
  const {
    getAssessmentId = (req) => req.params.id,
    courseField     = "course",
    skipCourseCheck = false,
    select          = null,
    populate        = null,
  } = options;

  if (!Model) {
    throw new Error("requireAssessmentOwnership: Model is required");
  }

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const assessmentId = getAssessmentId(req);
      const companyId    = req.companyId || req.user.company;

      if (!assessmentId || !mongoose.Types.ObjectId.isValid(assessmentId)) {
        return res.status(404).json({ error: `${Model.modelName} not found` });
      }

      // Load the assessment — always scope to the company.
      // Assessment models use `company` for tenant field (standard convention).
      let query = Model.findOne({ _id: assessmentId, company: companyId });
      if (select)   query = query.select(select);
      if (populate) query = query.populate(populate);

      const assessment = await query.exec();

      if (!assessment) {
        return res.status(404).json({ error: `${Model.modelName} not found` });
      }

      req.assessment = assessment;

      // Admin/superadmin: skip ownership and course checks.
      if (req.user.role === "superadmin" || req.user.role === "admin") {
        return next();
      }

      // Lecturers must own the assessment.
      // If skipCourseCheck is true (AI drafts, question bank items), only
      // the createdBy check runs — no CourseLecturerAssignment lookup needed.
      try {
        if (skipCourseCheck) {
          const creator = assessment.createdBy?.toString();
          if (creator !== req.user._id.toString()) {
            return res.status(403).json({
              error: "You do not have permission to access this resource",
            });
          }
        } else {
          await assertLecturerOwnsAssessment(
            assessment,
            req.user._id,
            companyId,
            courseField
          );
        }
      } catch (err) {
        if (
          err instanceof LecturerNotAssignedError ||
          err instanceof TenantMismatchError
        ) {
          return res.status(403).json({ error: err.message });
        }
        if (err instanceof ResourceNotFoundError) {
          return res.status(404).json({ error: err.message });
        }
        throw err;
      }

      next();
    } catch (err) {
      console.error("[requireAssessmentOwnership]", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = requireAssessmentOwnership;
