/**
 * PulseCentral – server/middleware/cors.js
 * Configures Cross-Origin Resource Sharing using the `cors` package.
 * Reads allowed origins from the ALLOWED_ORIGIN environment variable.
 */

'use strict';

const cors = require('cors');

/**
 * Parse the ALLOWED_ORIGIN env var into a list of allowed origins.
 * Supports a single origin string or a comma-separated list.
 * Defaults to the same port the server runs on if not set.
 */
function buildAllowedOrigins() {
  const raw = process.env.ALLOWED_ORIGIN || '';
  if (!raw || raw === '*') return true; // wildcard: allow all

  return raw.split(',').map(o => o.trim()).filter(Boolean);
}

const allowedOrigins = buildAllowedOrigins();

module.exports = cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
});
