'use strict';

/**
 * Thin wrapper around the Cloudinary SDK. Nothing outside this file should
 * import `cloudinary` directly — go through mediaStorage.js instead, so the
 * provider can be swapped later without touching every call site.
 */

const cloudinary = require('cloudinary').v2;

const configured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (configured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure:     true,
  });
  console.log('[Cloudinary] ✓ Configured —', process.env.CLOUDINARY_CLOUD_NAME);
} else {
  console.warn('[Cloudinary] WARNING: CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET not set. Media uploads disabled.');
}

// Uploads a buffer via Cloudinary's stream API — never touches local disk.
function uploadBuffer(buffer, { folder, publicId, resourceType = 'image' }) {
  if (!configured) {
    return Promise.reject(new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET.'));
  }
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, public_id: publicId, resource_type: resourceType, overwrite: true },
      (err, result) => (err ? reject(err) : resolve(result))
    );
    stream.end(buffer);
  });
}

function destroy(publicId, { resourceType = 'image' } = {}) {
  if (!configured || !publicId) return Promise.resolve();
  return cloudinary.uploader.destroy(publicId, { resource_type: resourceType }).catch(() => {});
}

module.exports = { configured, uploadBuffer, destroy };
