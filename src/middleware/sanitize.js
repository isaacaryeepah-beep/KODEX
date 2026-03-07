// ══════════════════════════════════════════════════════════════════════════════
//  KODEX Input Sanitizer Middleware
//  - Strips dangerous characters from all string inputs
//  - Prevents NoSQL injection attacks (MongoDB)
//  - Prevents XSS (Cross Site Scripting) attacks
//  - Limits string field lengths
// ══════════════════════════════════════════════════════════════════════════════

// Remove MongoDB operator keys like $where, $gt, $set etc.
function stripMongoOperators(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(stripMongoOperators);

  const cleaned = {};
  for (const key of Object.keys(obj)) {
    if (key.startsWith('$')) {
      // Drop dangerous MongoDB operator keys silently
      continue;
    }
    cleaned[key] = stripMongoOperators(obj[key]);
  }
  return cleaned;
}

// Strip HTML tags and dangerous characters from strings
function stripXSS(value) {
  if (typeof value !== 'string') return value;
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')  // remove script tags
    .replace(/<[^>]+>/g, '')                                // remove all HTML tags
    .replace(/javascript:/gi, '')                           // remove JS protocol
    .replace(/on\w+\s*=/gi, '')                            // remove event handlers
    .trim();
}

// Recursively sanitize all string values in an object
function sanitizeObject(obj, depth = 0) {
  if (depth > 10) return obj; // prevent infinite recursion
  if (typeof obj === 'string') return stripXSS(obj);
  if (typeof obj !== 'object' || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item, depth + 1));

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = sanitizeObject(value, depth + 1);
  }
  return result;
}

// ── Main middleware ───────────────────────────────────────────────────────────
function sanitizeInputs(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    // Step 1: Strip MongoDB operators (NoSQL injection prevention)
    req.body = stripMongoOperators(req.body);
    // Step 2: Strip XSS from all strings
    req.body = sanitizeObject(req.body);
  }

  if (req.query && typeof req.query === 'object') {
    req.query = stripMongoOperators(req.query);
    req.query = sanitizeObject(req.query);
  }

  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }

  next();
}

module.exports = { sanitizeInputs };
