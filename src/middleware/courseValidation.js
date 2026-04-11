// ─── Course Validation Middleware ─────────────────────────────────────────────

/**
 * Validates the request body for createCourse.
 * Ensures all required academic fields are present and sane.
 */
exports.validateCourse = (req, res, next) => {
  const { title, code } = req.body;

  const errors = [];

  if (!title || !title.trim()) errors.push('Course title is required.');
  if (!code  || !code.trim())  errors.push('Course code is required.');

  if (title && title.trim().length > 200) {
    errors.push('Course title must be 200 characters or fewer.');
  }

  if (code && code.trim().length > 30) {
    errors.push('Course code must be 30 characters or fewer.');
  }

  if (errors.length) {
    return res.status(400).json({ error: errors.join(' ') });
  }

  // Sanitise
  req.body.title = req.body.title.trim();
  req.body.code  = req.body.code.trim().toUpperCase();
  if (req.body.description) req.body.description = req.body.description.trim();
  if (req.body.group)        req.body.group        = req.body.group.trim().toUpperCase();

  next();
};

/**
 * Validates the request body for enrollStudent.
 */
exports.validateEnroll = (req, res, next) => {
  const { studentId } = req.body;
  if (!studentId) {
    return res.status(400).json({ error: 'studentId is required.' });
  }
  next();
};
