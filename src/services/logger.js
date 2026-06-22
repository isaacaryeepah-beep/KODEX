"use strict";

/**
 * logger.js
 *
 * Centralised Winston logger for the DIKLY backend.
 *
 * Transports:
 *   Console  — colorized in development, JSON in production
 *   File     — logs/error.log  (errors only)
 *              logs/combined.log (all levels)
 *
 * Log level defaults to process.env.LOG_LEVEL, or 'info' if unset.
 */

const { createLogger, format, transports } = require("winston");
const path = require("path");

const isProduction = process.env.NODE_ENV === "production" || !!process.env.RENDER;
const logLevel = process.env.LOG_LEVEL || "info";

// Shared format pieces
const timestampFmt = format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" });
const errorStack   = format.errors({ stack: true });

// Console format: colorized in dev, JSON in prod
const consoleFormat = isProduction
  ? format.combine(timestampFmt, errorStack, format.json())
  : format.combine(
      timestampFmt,
      errorStack,
      format.colorize(),
      format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let line = `${timestamp} [${level}] ${message}`;
        if (stack) line += `\n${stack}`;
        const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
        return line + extras;
      })
    );

// File format: always structured JSON
const fileFormat = format.combine(timestampFmt, errorStack, format.json());

// Ensure logs/ directory path is relative to project root (two levels up from src/services/)
const logsDir = path.join(__dirname, "..", "..", "logs");

const logger = createLogger({
  level: logLevel,
  transports: [
    new transports.Console({ format: consoleFormat }),
    new transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      format: fileFormat,
      handleExceptions: false,
    }),
    new transports.File({
      filename: path.join(logsDir, "combined.log"),
      format: fileFormat,
      handleExceptions: false,
    }),
  ],
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Convenience stream for morgan
logger.stream = {
  write(message) {
    // morgan appends a newline; trim it before logging
    logger.http(message.trimEnd());
  },
};

module.exports = logger;
