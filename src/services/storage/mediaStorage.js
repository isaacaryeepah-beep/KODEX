'use strict';

/**
 * Modular image/media storage interface. Every image upload in the app
 * (question bank diagrams, chat images, profile photos) goes through here
 * instead of touching a provider SDK directly — swapping Cloudinary for a
 * different provider later means changing this one file, not every route
 * and controller that uploads an image.
 */

const crypto = require('crypto');
const cloudinaryProvider = require('./cloudinaryProvider');

const PROVIDER_NAME = 'cloudinary';

/**
 * @param {Buffer} buffer               raw image bytes
 * @param {object} meta
 * @param {string} meta.folder          Cloudinary folder, e.g. "dikly/question-bank"
 * @param {string} [meta.filenameHint]  used to build a readable public_id
 * @param {string} [meta.mimeType]
 * @param {number} [meta.fileSize]
 * @returns {Promise<{url:string, publicId:string, provider:string, mimeType:string, fileSize:number}>}
 */
async function uploadImage(buffer, { folder, filenameHint = 'img', mimeType, fileSize } = {}) {
  const publicId = `${filenameHint}-${crypto.randomBytes(8).toString('hex')}`;
  const result = await cloudinaryProvider.uploadBuffer(buffer, {
    folder,
    publicId,
    resourceType: 'image',
  });
  return {
    url:      result.secure_url,
    publicId: result.public_id,
    provider: PROVIDER_NAME,
    mimeType: mimeType || (result.format ? `image/${result.format}` : undefined),
    fileSize: fileSize || result.bytes,
  };
}

async function deleteImage(publicId) {
  if (!publicId) return;
  await cloudinaryProvider.destroy(publicId, { resourceType: 'image' });
}

module.exports = { uploadImage, deleteImage, PROVIDER_NAME };
