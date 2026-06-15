"use strict";

/**
 * pdfHelpers.js
 *
 * Shared PDF generation helpers for PDFKit-based report controllers.
 * Extracted from reportController.js and adminReportController.js to
 * eliminate duplicated drawing functions.
 *
 * Each function takes a PDFKit `doc` instance as its first argument.
 */

// ─── Simple Header (reportController style) ─────────────────────────────────

/**
 * Draw a plain centered report header with title, optional institution name,
 * and a "Generated:" timestamp line.
 */
function drawSimpleHeader(doc, title, institution) {
  doc.fontSize(22).font("Helvetica-Bold").text(title, { align: "center" });
  doc.moveDown(0.3);
  if (institution) {
    doc.fontSize(12).font("Helvetica").text(institution, { align: "center" });
    doc.moveDown(0.3);
  }
  doc.fontSize(9).font("Helvetica").fillColor("#666666")
    .text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
  doc.fillColor("#000000");
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor("#cccccc").stroke();
  doc.moveDown(1);
}

// ─── Branded Header (adminReportController style) ────────────────────────────

/**
 * Draw a branded coloured-banner header with title and optional institution name.
 */
function drawBrandedHeader(doc, title, institution, options = {}) {
  const { bgColor = "#4f46e5", textColor = "#ffffff", bannerHeight = 90 } = options;
  doc.rect(0, 0, doc.page.width, bannerHeight).fill(bgColor);
  doc.fillColor(textColor).fontSize(24).font("Helvetica-Bold")
    .text(title, 50, 25, { align: "center" });
  if (institution) {
    doc.fontSize(11).font("Helvetica")
      .text(institution, 50, 55, { align: "center" });
  }
  doc.fillColor("#000000");
  doc.y = bannerHeight + 20;
  doc.fontSize(9).font("Helvetica").fillColor("#888888")
    .text(`Generated: ${new Date().toLocaleString()}`, { align: "right" });
  doc.fillColor("#000000");
  doc.moveDown(1);
}

// ─── Section Title ───────────────────────────────────────────────────────────

/**
 * Draw a section title bar with background colour.
 */
function drawSectionTitle(doc, title, options = {}) {
  const { bgColor = "#f3f4f6", textColor = "#1f2937", height = 26 } = options;
  const y = doc.y;
  doc.rect(50, y, doc.page.width - 100, height).fill(bgColor);
  doc.fillColor(textColor).fontSize(13).font("Helvetica-Bold")
    .text(title, 58, y + 6);
  doc.fillColor("#000000");
  doc.y = y + height + 8;
}

// ─── Table Drawing ───────────────────────────────────────────────────────────

/**
 * Draw a table header row (coloured background, bold white text).
 *
 * @param {object} doc
 * @param {Array<{text:string, width:number}>} columns
 * @param {number} y - vertical position
 * @param {object} [options]
 * @returns {number} new y position after the header
 */
function drawTableHeader(doc, columns, y, options = {}) {
  const { bgColor = "#4f46e5", textColor = "#ffffff", height = 20 } = options;
  doc.rect(50, y - 2, doc.page.width - 100, height).fill(bgColor);
  doc.fillColor(textColor).fontSize(8).font("Helvetica-Bold");
  let x = 54;
  columns.forEach(({ text, width }) => {
    doc.text(text, x, y + 2, { width: width - 8, height: height - 4, ellipsis: true });
    x += width;
  });
  doc.fillColor("#000000");
  return y + height;
}

/**
 * Draw a single table row. Supports alternating background, bold text, custom font size.
 *
 * @param {object} doc
 * @param {Array<{text:string, width:number}>} columns
 * @param {number} y
 * @param {object} [options] - { bold, bg, fontSize, rowHeight, startX }
 * @returns {number} new y position
 */
function drawTableRow(doc, columns, y, options = {}) {
  const { bold = false, bg = null, fontSize = 9, rowHeight = 20, startX = 50 } = options;

  if (bg) {
    doc.rect(startX, y - 2, doc.page.width - 100, rowHeight).fill(bg);
    doc.fillColor("#000000");
  }

  doc.fontSize(fontSize).font(bold ? "Helvetica-Bold" : "Helvetica");
  let x = startX;
  columns.forEach(({ text, width }) => {
    doc.text(text || "", x + 4, y, { width: width - 8, height: rowHeight, ellipsis: true });
    x += width;
  });

  return y + rowHeight;
}

// ─── Page Break Check ────────────────────────────────────────────────────────

/**
 * Check if the cursor exceeds the page bottom margin. If so, add a new page
 * and optionally re-draw table header columns.
 *
 * @param {object} doc
 * @param {number} y - current cursor y
 * @param {object} [options] - { margin, columns (re-draw header) }
 * @returns {number} adjusted y position
 */
function checkPage(doc, y, options = {}) {
  const margin = typeof options === "number" ? options : (options.margin || 60);
  const columns = typeof options === "object" ? options.columns : null;

  if (y > doc.page.height - margin) {
    doc.addPage();
    if (columns) {
      return drawTableHeader(doc, columns, 50);
    }
    return 50;
  }
  return y;
}

// ─── Summary Boxes ───────────────────────────────────────────────────────────

/**
 * Draw a single metric summary box (label + large value).
 * Tracks position via `doc._summaryX` / `doc._summaryY` for flowing layout.
 */
function drawSummaryBox(doc, label, value, options = {}) {
  const { boxW = 120, boxH = 50, bgColor = "#f3f4f6" } = options;
  const x = doc._summaryX || 50;
  const y = doc._summaryY || doc.y;

  doc.rect(x, y, boxW, boxH).fill(bgColor);
  doc.fillColor("#6b7280").fontSize(8).font("Helvetica")
    .text(label, x, y + 8, { width: boxW, align: "center" });
  doc.fillColor("#111827").fontSize(16).font("Helvetica-Bold")
    .text(String(value), x, y + 22, { width: boxW, align: "center" });
  doc.fillColor("#000000");

  doc._summaryX = x + boxW + 12;
  if (doc._summaryX + boxW > doc.page.width - 50) {
    doc._summaryX = 50;
    doc._summaryY = y + boxH + 8;
  }
}

/**
 * Draw a row of metric summary boxes (adminReportController style — bordered, evenly spaced).
 *
 * @param {object} doc
 * @param {Array<{label:string, value:string|number}>} items
 */
function drawSummaryRow(doc, items, options = {}) {
  const { maxBoxW = 130, gap = 10 } = options;
  const totalW = doc.page.width - 100;
  const boxW = Math.min(maxBoxW, (totalW - (items.length - 1) * gap) / items.length);
  const startX = 50;
  const y = doc.y;

  items.forEach((item, i) => {
    const x = startX + i * (boxW + gap);
    doc.rect(x, y, boxW, 52).lineWidth(1).strokeColor("#e5e7eb").stroke();
    doc.fillColor("#6b7280").fontSize(8).font("Helvetica")
      .text(item.label, x, y + 8, { width: boxW, align: "center" });
    doc.fillColor("#111827").fontSize(18).font("Helvetica-Bold")
      .text(String(item.value), x, y + 24, { width: boxW, align: "center" });
    doc.fillColor("#000000");
  });

  doc.y = y + 62;
}

// ─── Utility: Reset summary position ─────────────────────────────────────────

/**
 * Reset the flowing summary-box position tracker.
 * Call this before starting a new row of drawSummaryBox calls.
 */
function resetSummaryPosition(doc) {
  doc._summaryX = 50;
  doc._summaryY = doc.y;
}

module.exports = {
  drawSimpleHeader,
  drawBrandedHeader,
  drawSectionTitle,
  drawTableHeader,
  drawTableRow,
  checkPage,
  drawSummaryBox,
  drawSummaryRow,
  resetSummaryPosition,
};
