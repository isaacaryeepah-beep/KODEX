// ─── Course Validation Middleware ─────────────────────────────────────────────

const VALID_QUALIFICATION_TYPES = [
  'BSc', 'HND', 'Diploma', 'Certificate',
  'MSc', 'MPhil', 'PhD', 'Top-Up', 'Other',
];

const VALID_STUDY_TYPES = [
  'Regular', 'Evening', 'Weekend',
  'Distance', 'Sandwich', 'Part-Time', 'Full-Time',
];

// Validate academic year format: e.g. 2024/2025
function isValidAcademicYear(val) {
  if (!val) return true; // optional
  return /^\d{4}\/\d{4}$/.test(val);
}

exports.validateCreateCourse = (req, res, next) => {
  const {
    title, code,
    academicYear, qualificationType, studyType,
  } = req.body;

  const errors = [];

  if (!title || !title.trim()) errors.push('Course title is required.');
  if (!code  || !code.trim())  errors.push('Course code is required.');

  if (title && title.trim().length > 200) errors.push('Title must be 200 characters or fewer.');
  if (code  && code.trim().length  > 30)  errors.push('Code must be 30 characters or fewer.');

  if (academicYear && !isValidAcademicYear(academicYear)) {
    errors.push('Academic year must be in the format YYYY/YYYY (e.g. 2024/2025).');
  }

  if (qualificationType && !VALID_QUALIFICATION_TYPES.includes(qualificationType)) {
    errors.push(`Invalid qualification type. Allowed: ${VALID_QUALIFICATION_TYPES.join(', ')}.`);
  }

  if (studyType && !VALID_STUDY_TYPES.includes(studyType)) {
    errors.push(`Invalid study type. Allowed: ${VALID_STUDY_TYPES.join(', ')}.`);
  }

  if (errors.length) {
    return res.status(400).json({ success: false, message: errors.join(' '), errors });
  }

  // Sanitise
  req.body.title = req.body.title.trim();
  req.body.code  = req.body.code.trim().toUpperCase();
  if (req.body.description) req.body.description = req.body.description.trim();
  if (req.body.group)       req.body.group        = req.body.group.trim().toUpperCase();
  if (req.body.level)       req.body.level        = req.body.level.trim();

  next();
};

exports.validateEnroll = (req, res, next) => {
  const { studentId } = req.body;
  if (!studentId) {
    return res.status(400).json({ success: false, message: 'studentId is required.' });
  }
  next();
};

exports.VALID_QUALIFICATION_TYPES = VALID_QUALIFICATION_TYPES;
exports.VALID_STUDY_TYPES         = VALID_STUDY_TYPES;
