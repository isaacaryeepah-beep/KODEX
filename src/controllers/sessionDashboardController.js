const svc              = require('../services/sessionDashboardService');
const reportSvc        = require('../services/sessionReportService');
const { verifyNetworkAccess } = require('../services/networkVerificationService');
const AttendanceRecord = require('../models/AttendanceRecord');

function getCompanyId(req) {
  return req.user.company || req.user.companyId;
}

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
}

exports.getDashboard = async (req, res) => {
  try {
    const data = await svc.getDashboardData(req.params.id, getCompanyId(req));
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.startSession = async (req, res) => {
  try {
    const { session, deviceWarning } = await svc.startSession(
      req.params.id, getCompanyId(req), req.user._id, req.user.role
    );
    return res.json({
      success: true,
      message: 'Session started successfully.',
      data:    session,
      warning: deviceWarning ? 'Classroom device appears to be offline.' : null,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.pauseSession = async (req, res) => {
  try {
    const session = await svc.pauseSession(
      req.params.id, getCompanyId(req), req.user._id, req.user.role
    );
    return res.json({ success: true, message: 'Session paused.', data: session });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.resumeSession = async (req, res) => {
  try {
    const session = await svc.resumeSession(
      req.params.id, getCompanyId(req), req.user._id, req.user.role
    );
    return res.json({ success: true, message: 'Session resumed.', data: session });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.lockSession = async (req, res) => {
  try {
    const session = await svc.lockSession(
      req.params.id, getCompanyId(req), req.user._id, req.user.role
    );
    return res.json({
      success: true,
      message: 'Session locked. No new attendance will be accepted.',
      data:    session,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.unlockSession = async (req, res) => {
  try {
    const session = await svc.unlockSession(
      req.params.id, getCompanyId(req), req.user._id, req.user.role
    );
    return res.json({ success: true, message: 'Session unlocked.', data: session });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.endSession = async (req, res) => {
  try {
    const result = await svc.endSession(
      req.params.id, getCompanyId(req), req.user._id, req.user.role
    );
    return res.json({
      success: true,
      message: 'Session ended.',
      data:    result.session,
      summary: result.summary,
    });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.updateSession = async (req, res) => {
  try {
    const session = await svc.updateSession(
      req.params.id, getCompanyId(req), req.user._id, req.user.role, req.body
    );
    return res.json({ success: true, message: 'Session updated.', data: session });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.getLiveActivity = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const data  = await svc.getLiveActivity(req.params.id, getCompanyId(req), limit);
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.getSuspiciousEvents = async (req, res) => {
  try {
    const SuspiciousEvent = require('../models/SuspiciousEvent');
    const events = await SuspiciousEvent.find({ sessionId: req.params.id })
      .sort({ createdAt: -1 })
      .populate('userId', 'name IndexNumber indexNumber')
      .lean();
    return res.json({ success: true, data: events });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStudentTable = async (req, res) => {
  try {
    const data = await svc.getStudentAttendanceTable(req.params.id, getCompanyId(req));
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.getReport = async (req, res) => {
  try {
    const data = await reportSvc.buildReportData(req.params.id, getCompanyId(req));
    return res.json({ success: true, data });
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.exportPdf = async (req, res) => {
  try {
    const data = await reportSvc.buildReportData(req.params.id, getCompanyId(req));
    reportSvc.generatePdfReport(data, res);
  } catch (err) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

exports.refreshDeviceStatus = async (req, res) => {
  try {
    const status = await svc.getDeviceStatus(getCompanyId(req));
    return res.json({ success: true, data: status });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getNetworkStatus = async (req, res) => {
  try {
    const ip     = getClientIp(req);
    const status = await verifyNetworkAccess(ip, getCompanyId(req));
    return res.json({ success: true, data: { ip, ...status } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.markAttendance = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const userId    = req.user._id;
    const ip        = getClientIp(req);
    const { sessionId, code, deviceFingerprint } = req.body;

    const networkCheck = await verifyNetworkAccess(ip, companyId);

    const result = await svc.validateAttendanceMark({
      sessionId,
      code,
      userId,
      companyId,
      deviceFingerprint,
      ipAddress:     ip,
      networkStatus: networkCheck.status,
    });

    if (!result.valid) {
      if (result.session) {
        await svc.logSuspiciousEvent({
          sessionId:   result.session._id,
          courseId:    result.session.course?._id || result.session.course,
          companyId,
          userId:      result.userId || null,
          deviceId:    deviceFingerprint || null,
          ipAddress:   ip,
          eventType:   result.eventType,
          reason:      result.reason,
          actionTaken: 'blocked',
        });
      }
      return res.status(403).json({ success: false, message: result.reason });
    }

    const record = await AttendanceRecord.create({
      session:   sessionId,
      student:   userId,
      company:   companyId,
      course:    result.session.course?._id || result.session.course,
      method:    'code_mark',
      status:    'present',
      deviceId:  deviceFingerprint || null,
      ipAddress: ip,
      codeUsed:  code,
    });

    return res.status(201).json({
      success: true,
      message: 'Attendance marked successfully.',
      data:    record,
    });
  } catch (err) {
    console.error('[markAttendance]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.resolveSuspiciousEvent = async (req, res) => {
  try {
    const SuspiciousEvent = require('../models/SuspiciousEvent');
    const event = await SuspiciousEvent.findByIdAndUpdate(
      req.params.eventId,
      {
        resolved:   true,
        resolvedBy: req.user._id,
        resolvedAt: new Date(),
        notes:      req.body.notes || null,
      },
      { new: true }
    );
    if (!event) return res.status(404).json({ success: false, message: 'Event not found.' });
    return res.json({ success: true, data: event });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.removeAttendanceRecord = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const session   = await require('../models/AttendanceSession')
      .findOne({ _id: req.params.id, company: companyId }).select('_id').lean();
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    await AttendanceRecord.deleteOne({ _id: req.params.recordId, session: req.params.id });
    return res.json({ success: true, message: 'Attendance record removed.' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.flagAttendanceRecord = async (req, res) => {
  try {
    const record = await AttendanceRecord.findByIdAndUpdate(
      req.params.recordId,
      { $set: { flagged: true, flagNote: req.body.note || 'Manually flagged by lecturer' } },
      { new: true }
    );
    if (!record) return res.status(404).json({ success: false, message: 'Record not found.' });
    return res.json({ success: true, message: 'Record flagged.', data: record });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
