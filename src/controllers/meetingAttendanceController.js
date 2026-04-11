const MeetingAttendance    = require('../models/MeetingAttendance');
const Meeting              = require('../models/Meeting');
const { calculateStatus, sumSessionMinutes } = require('../utils/attendanceCalculator');

// ─── JOIN ─────────────────────────────────────────────────────────────────────
exports.joinAttendance = async (req, res) => {
  try {
    const meeting   = req.meeting;
    const user      = req.user;
    const now       = new Date();
    const ipAddress = req.ip || req.headers['x-forwarded-for']?.split(',')[0];
    const deviceInfo = req.headers['user-agent'] || null;

    let record = await MeetingAttendance.findOne({ meeting: meeting._id, user: user._id });

    if (!record) {
      // First join
      record = await MeetingAttendance.create({
        meeting:   meeting._id,
        company:   meeting.company,
        user:      user._id,
        role:      user.role,
        sessions:  [{ joinedAt: now }],
        joinCount: 1,
        joinedAt:  now,
        lastAction: 'joined',
        attendanceStatus: 'partial',
        ipAddress,
        deviceInfo
      });
    } else {
      // Re-join — add new session
      record.sessions.push({ joinedAt: now });
      record.joinCount  += 1;
      record.lastAction  = 'joined';
      record.ipAddress   = ipAddress;
      await record.save();
    }

    res.json({ success: true, message: 'Attendance join recorded' });
  } catch (err) {
    if (err.code === 11000) {
      return res.json({ success: true, message: 'Already joined' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── LEAVE ────────────────────────────────────────────────────────────────────
exports.leaveAttendance = async (req, res) => {
  try {
    const meeting = req.meeting;
    const user    = req.user;
    const now     = new Date();

    const record = await MeetingAttendance.findOne({ meeting: meeting._id, user: user._id });
    if (!record) return res.status(404).json({ message: 'No attendance record found' });

    // Close the last open session
    const lastSession = record.sessions[record.sessions.length - 1];
    if (lastSession && !lastSession.leftAt) {
      lastSession.leftAt  = now;
      lastSession.minutes = Math.floor((now - new Date(lastSession.joinedAt)) / 60000);
    }

    record.leftAt       = now;
    record.lastAction   = 'left';
    record.totalMinutes = sumSessionMinutes(record.sessions);
    record.attendanceStatus = calculateStatus(
      record.totalMinutes,
      meeting.scheduledStart,
      meeting.scheduledEnd
    );

    await record.save();
    res.json({ success: true, message: 'Attendance leave recorded', totalMinutes: record.totalMinutes });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET ATTENDANCE LIST ──────────────────────────────────────────────────────
exports.getAttendance = async (req, res) => {
  try {
    const meeting = req.meeting;

    // Only creator or admin can view
    const role    = req.user.role?.toLowerCase();
    const isAdmin = ['admin', 'superadmin', 'hod', 'manager'].includes(role);
    const isOwner = meeting.creatorId.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Unauthorized access to this meeting' });
    }

    const records = await MeetingAttendance.find({ meeting: meeting._id })
      .populate('user', 'name email role')
      .sort({ joinedAt: 1 })
      .lean();

    const summary = {
      total:   records.length,
      present: records.filter(r => r.attendanceStatus === 'present').length,
      partial: records.filter(r => r.attendanceStatus === 'partial').length,
      absent:  records.filter(r => r.attendanceStatus === 'absent').length,
    };

    res.json({ success: true, data: records, summary });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── ATTENDANCE REPORT (JSON) ─────────────────────────────────────────────────
exports.attendanceReport = async (req, res) => {
  try {
    const meeting = req.meeting;

    const role    = req.user.role?.toLowerCase();
    const isAdmin = ['admin', 'superadmin', 'hod', 'manager'].includes(role);
    const isOwner = meeting.creatorId.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Unauthorized access to this meeting' });
    }

    const records = await MeetingAttendance.find({ meeting: meeting._id })
      .populate('user', 'name email role')
      .lean();

    const report = {
      meeting: {
        title:          meeting.title,
        scheduledStart: meeting.scheduledStart,
        scheduledEnd:   meeting.scheduledEnd,
        actualStart:    meeting.actualStart,
        actualEnd:      meeting.actualEnd,
        status:         meeting.status,
      },
      participants: records.map(r => ({
        name:             r.user?.name,
        email:            r.user?.email,
        role:             r.role,
        joinedAt:         r.joinedAt,
        leftAt:           r.leftAt,
        totalMinutes:     r.totalMinutes,
        joinCount:        r.joinCount,
        attendanceStatus: r.attendanceStatus,
      })),
      summary: {
        total:   records.length,
        present: records.filter(r => r.attendanceStatus === 'present').length,
        partial: records.filter(r => r.attendanceStatus === 'partial').length,
        absent:  records.filter(r => r.attendanceStatus === 'absent').length,
      }
    };

    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PDF REPORT ───────────────────────────────────────────────────────────────
exports.downloadPDF = async (req, res) => {
  try {
    const meeting = req.meeting;

    const role    = req.user.role?.toLowerCase();
    const isAdmin = ['admin', 'superadmin', 'hod', 'manager'].includes(role);
    const isOwner = meeting.creatorId.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Unauthorized access to this meeting' });
    }

    const records = await MeetingAttendance.find({ meeting: meeting._id })
      .populate('user', 'name email role')
      .lean();

    // Build HTML and convert to PDF using html-pdf or pdfkit
    // Using inline HTML for simplicity — install html-pdf: npm install html-pdf
    const htmlPdf = require('html-pdf');

    const rows = records.map((r, i) => `
      <tr style="background:${i % 2 === 0 ? '#f9fafb' : '#fff'}">
        <td>${i + 1}</td>
        <td>${r.user?.name || 'Unknown'}</td>
        <td>${r.user?.email || '—'}</td>
        <td>${r.role}</td>
        <td>${r.joinedAt ? new Date(r.joinedAt).toLocaleTimeString() : '—'}</td>
        <td>${r.leftAt  ? new Date(r.leftAt).toLocaleTimeString()  : '—'}</td>
        <td>${r.totalMinutes || 0} min</td>
        <td style="color:${r.attendanceStatus === 'present' ? 'green' : r.attendanceStatus === 'partial' ? 'orange' : 'red'};font-weight:600">
          ${r.attendanceStatus?.toUpperCase()}
        </td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; font-size: 12px; }
          h1   { color: #1a56db; margin-bottom: 4px; }
          .meta { color: #6b7280; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; }
          th { background: #1a56db; color: white; padding: 8px; text-align: left; }
          td { padding: 7px 8px; border-bottom: 1px solid #e5e7eb; }
          .summary { margin-top: 20px; display: flex; gap: 20px; }
          .stat { background: #f3f4f6; padding: 10px 16px; border-radius: 6px; }
        </style>
      </head>
      <body>
        <h1>📋 Meeting Attendance Report</h1>
        <div class="meta">
          <strong>${meeting.title}</strong><br>
          Date: ${new Date(meeting.scheduledStart).toLocaleDateString()}<br>
          Start: ${meeting.actualStart ? new Date(meeting.actualStart).toLocaleTimeString() : '—'} &nbsp;|&nbsp;
          End: ${meeting.actualEnd   ? new Date(meeting.actualEnd).toLocaleTimeString()   : '—'}<br>
          Status: ${meeting.status?.toUpperCase()}
        </div>

        <table>
          <thead>
            <tr>
              <th>#</th><th>Name</th><th>Email</th><th>Role</th>
              <th>Joined</th><th>Left</th><th>Duration</th><th>Status</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="summary">
          <div class="stat">Total: <strong>${records.length}</strong></div>
          <div class="stat" style="color:green">Present: <strong>${records.filter(r=>r.attendanceStatus==='present').length}</strong></div>
          <div class="stat" style="color:orange">Partial: <strong>${records.filter(r=>r.attendanceStatus==='partial').length}</strong></div>
          <div class="stat" style="color:red">Absent: <strong>${records.filter(r=>r.attendanceStatus==='absent').length}</strong></div>
        </div>
      </body>
      </html>
    `;

    const options = { format: 'A4', orientation: 'landscape', border: '10mm' };
    htmlPdf.create(html, options).toBuffer((err, buffer) => {
      if (err) return res.status(500).json({ message: 'PDF generation failed', error: err.message });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="meeting-attendance-${meeting._id}.pdf"`);
      res.send(buffer);
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};
