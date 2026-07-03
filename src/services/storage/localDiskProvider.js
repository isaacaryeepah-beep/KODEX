'use strict';

/**
 * Default driver behind documentStorage.js. Preserves the same on-disk
 * layout the app has always used for large files (assignment briefs and
 * submissions, chat documents, offline exam recordings).
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const UPLOAD_ROOT = path.join(__dirname, '../../../uploads');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * @param {Buffer} buffer
 * @param {object} meta
 * @param {string} meta.folder          subdirectory under uploads/, e.g. "assignment-briefs"
 * @param {string} [meta.filenameHint]
 * @param {string} [meta.ext]           file extension including the dot, e.g. ".pdf"
 * @returns {Promise<{ref:string, provider:string}>} ref is relative to uploads/, safe to store in Mongo
 */
async function storeDocument(buffer, { folder, filenameHint = 'file', ext = '' }) {
  const dir = path.join(UPLOAD_ROOT, folder);
  ensureDir(dir);
  const filename = `${filenameHint}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const filePath = path.join(dir, filename);
  await fs.promises.writeFile(filePath, buffer);
  return { ref: path.join(folder, filename), provider: 'local' };
}

function getDocumentPath(ref) {
  return path.join(UPLOAD_ROOT, ref);
}

async function deleteDocument(ref) {
  if (!ref) return;
  await fs.promises.unlink(getDocumentPath(ref)).catch(() => {});
}

module.exports = { storeDocument, getDocumentPath, deleteDocument, UPLOAD_ROOT };
