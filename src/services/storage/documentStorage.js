'use strict';

/**
 * Modular storage interface for large, non-media files: assignment briefs
 * and submissions, chat documents (PDF/Word), and offline exam recording
 * chunks. Images go through mediaStorage.js (Cloudinary) instead — this
 * module is only for everything too large/unsuited for an image CDN.
 *
 * Local disk is the only driver today. It works, but on a platform with an
 * ephemeral filesystem (e.g. Render's standard web service) these files
 * won't survive a redeploy or restart. To move to Cloudflare R2 or another
 * object store later: write an r2Provider.js exposing the same
 * {storeDocument, getDocumentPath/Stream, deleteDocument} shape as
 * localDiskProvider.js, then swap the DRIVER require below. No call site
 * (routes, controllers) needs to change.
 */

const fs = require('fs');
const localDiskProvider = require('./localDiskProvider');

const DRIVER = localDiskProvider;

async function storeDocument(buffer, meta) {
  return DRIVER.storeDocument(buffer, meta);
}

function getDocumentStream(ref) {
  return fs.createReadStream(DRIVER.getDocumentPath(ref));
}

function getDocumentPath(ref) {
  return DRIVER.getDocumentPath(ref);
}

function documentExists(ref) {
  if (!ref) return false;
  return fs.existsSync(DRIVER.getDocumentPath(ref));
}

async function deleteDocument(ref) {
  return DRIVER.deleteDocument(ref);
}

module.exports = { storeDocument, getDocumentStream, getDocumentPath, documentExists, deleteDocument };
