/**
 * sessionReportService.js
 *
 * Generates session attendance reports in both JSON and PDF format.
 * PDF uses pdfkit (npm install pdfkit).
 *
 * Usage:
 *   const { buildReportData, generatePdfReport } = require('./sessionReportService');
 *   const data = await buildReportData(sessionId, companyId);
 *   generatePdfReport(data, res); // streams PDF to response
 */

const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord  = require('../models/AttendanceRecord');
const SuspiciousEvent   = require('../models/SuspiciousEvent');
const Course            = require('../models/Course');
const User              = require('../models/User');
const Device            = require('../models/Device');

// ─── Build full report data object ───────────────────────────────────────────
async function buildReportData(sessionId, companyId) {
  const session = await AttendanceSession.findOne({ _id: sessionId, company: companyId })
    .populate('course',    'title code level group departmentId qualificationType studyType semester academicYear')
    .populate('createdBy', 'name email department')
    .lean();

  if (!session) throw Object.assign(new Error('Session not found.'), { status: 404 });

  const courseId = session.course?._id || session.course;

  const [
    markedRecords,
    enrolledCount,
    suspiciousEvents,
    device,
  ] = await Promise.all([
    AttendanceRecord.find({ session: sessionId })
      .populate('student', 'name IndexNumber indexNumber studentLevel studentGroup qualificationType studyType')
      .lean(),
    Course.findById(courseId).select('enrolledStudents').lean()
      .then(c => c?.enrolledStudents?.length || 0),
    SuspiciousEvent.find({ sessionId })
      .populate('userId', 'name IndexNumber indexNumber')
      .lean(),
    Device.findOne({ companyId, isActive: true })
      .select('deviceName deviceId lastHeartbeat apSSID assignedRoom')
      .lean(),
  ]);

  const markedCount = markedRecords.length;
  const absent      = Math.max(0, enrolledCount - markedCount);
  const pct         = enrolledCount > 0 ? Math.round((markedCount / enrolledCount) * 100) : 0;

  // Duration in minutes
  let durationMinutes = null;
  if (session.startedAt && session.stoppedAt) {
    durationMinutes = Math.round(
      (new Date(session.stoppedAt) - new Date(session.startedAt)) / 60000
    );
  }

  return {
    session: {
      id:        session._id,
      title:     session.title,
      status:    session.status,
      venue:     session.venue,
      startedAt: session.startedAt,
      stoppedAt: session.stoppedAt,
      duration:  durationMinutes,
      networkEnforcement: session.networkEnforcement,
      codeRotationSeconds: session.codeRotationSeconds,
    },
    course: session.course,
    lecturer: session.createdBy,
    device: device ? {
      name:         device.deviceName,
      id:           device.deviceId,
      lastHeartbeat: device.lastHeartbeat,
      room:         device.assignedRoom,
      apSSID:       device.apSSID,
    } : null,
    summary: {
      expected:   enrolledCount,
      marked:     markedCount,
      absent,
      percentage: pct,
      suspicious: suspiciousEvents.length,
      unresolvedSuspicious: suspiciousEvents.filter(e => !e.resolved).length,
    },
    markedStudents:  markedRecords,
    suspiciousEvents,
    generatedAt:     new Date(),
  };
}

// ─── Stream PDF report to Express response ────────────────────────────────────
function generatePdfReport(data, res) {
  let PDFDocument;
  try {
    PDFDocument = require('pdfkit');
  } catch (_) {
    // pdfkit not installed — return JSON instead
    res.setHeader('Content-Type', 'application/json');
    return res.json({ success: true, data, pdfNote: 'Install pdfkit (npm install pdfkit) to enable PDF export.' });
  }

  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="session-report-${data.session.id}.pdf"`
  );
  doc.pipe(res);

  const c = data.course;
  const s = data.session;
  const l = data.lecturer;
  const sum = data.summary;

  // ── Header ─────────────────────────────────────────────────────────────────
  doc.fontSize(18).font('Helvetica-Bold').text('KODEX Attendance Report', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(13).font('Helvetica').text(`${c?.title || 'Unknown Course'} — ${c?.code || ''}`, { align: 'center' });
  if (c?.qualificationType || c?.studyType) {
    doc.fontSize(11).fillColor('#555').text(
      [c?.qualificationType, c?.studyType, c?.level ? `Level ${c.level}` : '', c?.group ? `Group ${c.group}` : ''].filter(Boolean).join(' · '),
      { align: 'center' }
    );
  }
  doc.fillColor('#000').moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);

  // ── Session info ───────────────────────────────────────────────────────────
  doc.fontSize(11).font('Helvetica-Bold').text('Session Information');
  doc.font('Helvetica').fontSize(10);
  const rows = [
    ['Title',     s.title     || '—'],
    ['Status',    s.status    || '—'],
    ['Venue',     s.venue     || '—'],
    ['Lecturer',  l?.name     || '—'],
    ['Started',   s.startedAt ? new Date(s.startedAt).toLocaleString() : '—'],
    ['Ended',     s.stoppedAt ? new Date(s.stoppedAt).toLocaleString() : '—'],
    ['Duration',  s.duration != null ? `${s.duration} minutes` : '—'],
    ['Department', c?.departmentId || '—'],
    ['Semester',  c?.semester || '—'],
    ['Acad. Year', c?.academicYear || '—'],
    ['Network Enforcement', s.networkEnforcement ? 'Yes' : 'No'],
    ['Code Rotation', s.codeRotationSeconds ? `${s.codeRotationSeconds}s` : '—'],
    ['Device',    data.device?.name || 'Not configured'],
  ];
  rows.forEach(([key, val]) => {
    doc.text(`${key}: `, { continued: true }).font('Helvetica-Bold').text(val).font('Helvetica');
  });

  doc.moveDown(0.8);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);

  // ── Summary ────────────────────────────────────────────────────────────────
  doc.fontSize(11).font('Helvetica-Bold').text('Attendance Summary');
  doc.moveDown(0.3);
  const summaryBoxes = [
    ['Expected', sum.expected],
    ['Present',  sum.marked],
    ['Absent',   sum.absent],
    ['Rate',     sum.percentage + '%'],
    ['Suspicious', sum.suspicious],
  ];
  let x = 50;
  const boxW = 90, boxH = 50;
  summaryBoxes.forEach(([label, val]) => {
    doc.rect(x, doc.y, boxW, boxH).stroke();
    doc.fontSize(9).text(label, x + 5, doc.y + 5, { width: boxW - 10, align: 'center' });
    doc.fontSize(18).font('Helvetica-Bold').text(String(val), x + 5, doc.y + 18, { width: boxW - 10, align: 'center' });
    x += boxW + 8;
  });
  doc.moveDown(4);
  doc.font('Helvetica');

  doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
  doc.moveDown(0.5);

  // ── Present students ───────────────────────────────────────────────────────
  doc.fontSize(11).font('Helvetica-Bold').text(`Students Marked Present (${sum.marked})`);
  doc.moveDown(0.3);

  if (data.markedStudents.length === 0) {
    doc.fontSize(10).font('Helvetica').text('No students marked present.');
  } else {
    // Table header
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('#', 50, doc.y, { width: 25 });
    doc.text('Name', 75, doc.y - doc.currentLineHeight(), { width: 200 });
    doc.text('Index Number', 280, doc.y - doc.currentLineHeight(), { width: 140 });
    doc.text('Time', 425, doc.y - doc.currentLineHeight(), { width: 120 });
    doc.moveDown(0.2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9);

    data.markedStudents.forEach((rec, i) => {
      const name = rec.student?.name || '—';
      const idx  = rec.student?.IndexNumber || rec.student?.indexNumber || '—';
      const time = rec.createdAt ? new Date(rec.createdAt).toLocaleTimeString() : '—';
      const y    = doc.y;
      doc.text(String(i + 1), 50, y, { width: 25 });
      doc.text(name,  75, y, { width: 200 });
      doc.text(idx,  280, y, { width: 140 });
      doc.text(time, 425, y, { width: 120 });
      doc.moveDown(0.3);
      if (doc.y > 750) doc.addPage();
    });
  }

  doc.moveDown(0.8);

  // ── Suspicious events ──────────────────────────────────────────────────────
  if (data.suspiciousEvents.length > 0) {
    doc.addPage();
    doc.fontSize(11).font('Helvetica-Bold').text(`Suspicious Events (${sum.suspicious})`);
    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9);
    data.suspiciousEvents.forEach((ev, i) => {
      const name = ev.userId?.name || 'Unknown';
      const idx  = ev.userId?.IndexNumber || ev.userId?.indexNumber || '';
      doc.font('Helvetica-Bold').text(`${i + 1}. ${ev.eventType?.replace(/_/g, ' ')}`, { continued: true });
      doc.font('Helvetica').text(`  — ${name}${idx ? ` (${idx})` : ''}`);
      doc.text(`   ${ev.reason}`).fillColor('#888').text(`   ${new Date(ev.createdAt).toLocaleString()}`).fillColor('#000');
      doc.moveDown(0.3);
      if (doc.y > 750) doc.addPage();
    });
  }

  // ── Footer ─────────────────────────────────────────────────────────────────
  doc.moveDown(1);
  doc.fontSize(9).fillColor('#888').text(
    `Report generated: ${new Date(data.generatedAt).toLocaleString()} — KODEX Smart Attendance`,
    { align: 'center' }
  );

  doc.end();
}

module.exports = { buildReportData, generatePdfReport };
