#!/usr/bin/env bash
# backup-mongo.sh — MongoDB backup with optional S3 upload
#
# Usage:
#   ./scripts/backup-mongo.sh
#
# Required env vars (can be set in .env or exported before running):
#   MONGODB_URI        — full MongoDB connection string
#
# Optional env vars:
#   BACKUP_DIR         — local directory for backups (default: /var/backups/dikly)
#   BACKUP_RETAIN_DAYS — how many days of local backups to keep (default: 7)
#   BACKUP_S3_BUCKET   — S3 bucket name, e.g. s3://my-dikly-backups
#                        If set, the archive is uploaded after creation.
#                        Requires: aws-cli configured with IAM credentials.
#
# Recommended cron (runs at 2 AM every day):
#   0 2 * * * /path/to/KODEX/scripts/backup-mongo.sh >> /var/log/dikly-backup.log 2>&1

set -euo pipefail

# ── Config ───────────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/var/backups/dikly}"
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-7}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DUMP_DIR="${BACKUP_DIR}/dump_${TIMESTAMP}"
ARCHIVE="${BACKUP_DIR}/dikly_${TIMESTAMP}.tar.gz"

# ── Pre-flight ────────────────────────────────────────────────────────────────
if [ -z "${MONGODB_URI:-}" ]; then
  echo "[backup] ERROR: MONGODB_URI is not set." >&2
  exit 1
fi

if ! command -v mongodump &>/dev/null; then
  echo "[backup] ERROR: mongodump not found. Install mongodb-database-tools." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

# ── Dump ─────────────────────────────────────────────────────────────────────
echo "[backup] Starting dump → ${DUMP_DIR}"
mongodump --uri="${MONGODB_URI}" --out="${DUMP_DIR}" --quiet

# ── Compress ─────────────────────────────────────────────────────────────────
echo "[backup] Compressing → ${ARCHIVE}"
tar -czf "${ARCHIVE}" -C "${BACKUP_DIR}" "dump_${TIMESTAMP}"
rm -rf "${DUMP_DIR}"

echo "[backup] Archive size: $(du -sh "${ARCHIVE}" | cut -f1)"

# ── Upload to S3 (optional) ──────────────────────────────────────────────────
if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  if ! command -v aws &>/dev/null; then
    echo "[backup] WARNING: BACKUP_S3_BUCKET is set but aws-cli not found. Skipping upload." >&2
  else
    echo "[backup] Uploading to ${BACKUP_S3_BUCKET}/$(basename "${ARCHIVE}")"
    aws s3 cp "${ARCHIVE}" "${BACKUP_S3_BUCKET}/$(basename "${ARCHIVE}")" --quiet
    echo "[backup] Upload complete."
  fi
fi

# ── Rotate old local backups ──────────────────────────────────────────────────
echo "[backup] Removing local backups older than ${RETAIN_DAYS} days"
find "${BACKUP_DIR}" -name "dikly_*.tar.gz" -mtime +"${RETAIN_DAYS}" -delete

echo "[backup] Done: ${ARCHIVE}"
