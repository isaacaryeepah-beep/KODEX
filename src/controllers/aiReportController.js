'use strict';

const { generateReport } = require('../services/aiReportService');
const AIReport = require('../models/AIReport');
const { getCompanyId } = require('../utils/controllerHelpers');

// POST /api/ai-reports/generate
exports.generate = async (req, res) => {
  try {
    const companyId    = req.user.role === 'superadmin' ? null : getCompanyId(req);
    const { type, parameters = {}, forceRefresh = false } = req.body;

    if (!type) return res.status(400).json({ success: false, message: 'report type is required' });

    // Role-based access control
    const role = req.user.role;
    const allowed = getAllowedTypes(role);
    if (!allowed.includes(type)) {
      return res.status(403).json({ success: false, message: `Report type '${type}' is not available for your role.` });
    }

    const result = await generateReport({
      type,
      companyId,
      parameters: { ...parameters, role },
      userId: req.user._id,
      forceRefresh: !!forceRefresh,
    });

    return res.json({ success: true, report: result });
  } catch (err) {
    console.error('[aiReport generate]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/ai-reports
exports.list = async (req, res) => {
  try {
    const companyId = req.user.role === 'superadmin' ? undefined : getCompanyId(req);
    const { type, limit = 10 } = req.query;

    const filter = {};
    if (companyId) filter.company = companyId;
    if (type)      filter.type    = type;

    const reports = await AIReport.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 10, 50))
      .select('type summary createdAt parameters requestedBy')
      .populate('requestedBy', 'name role')
      .lean();

    return res.json({ success: true, reports });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/ai-reports/:id
exports.getOne = async (req, res) => {
  try {
    const companyId = req.user.role === 'superadmin' ? undefined : getCompanyId(req);
    const filter = { _id: req.params.id };
    if (companyId) filter.company = companyId;

    const report = await AIReport.findOne(filter)
      .populate('requestedBy', 'name role')
      .lean();

    if (!report) return res.status(404).json({ success: false, message: 'Report not found.' });
    return res.json({ success: true, report });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/ai-reports/:id
exports.deleteOne = async (req, res) => {
  try {
    const companyId = req.user.role === 'superadmin' ? undefined : getCompanyId(req);
    const filter = { _id: req.params.id };
    if (companyId) filter.company = companyId;

    const r = await AIReport.findOneAndDelete(filter);
    if (!r) return res.status(404).json({ success: false, message: 'Report not found.' });
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ── Role → allowed types mapping ──────────────────────────────────────────────
function getAllowedTypes(role) {
  switch (role) {
    case 'superadmin':
      return ['platform_health', 'weekly_digest', 'custom_query'];
    case 'admin':
      return ['at_risk_students', 'class_health', 'department_overview', 'exam_readiness', 'weekly_digest', 'workforce_attendance', 'leave_anomaly', 'shift_compliance', 'custom_query'];
    case 'hod':
      return ['at_risk_students', 'class_health', 'department_overview', 'exam_readiness', 'weekly_digest', 'custom_query'];
    case 'lecturer':
      return ['at_risk_students', 'class_health', 'exam_readiness', 'custom_query'];
    case 'manager':
      return ['workforce_attendance', 'leave_anomaly', 'shift_compliance', 'weekly_digest', 'custom_query'];
    case 'student':
      return ['exam_readiness'];
    default:
      return ['custom_query'];
  }
}

exports.getAllowedTypes = getAllowedTypes;
