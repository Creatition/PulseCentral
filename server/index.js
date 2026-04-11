/**
 * PulseCentral – server/index.js
 * Express application entry point.
 * Serves the static frontend and mounts all API routes.
 */

'use strict';

// Load .env (if present) before anything else
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const path    = require('path');
const express = require('express');
const rateLimit = require('express-rate-limit');
const corsMiddleware = require('./middleware/cors');
const tradesRouter   = require('./routes/trades');
const proxyRouter    = require('./routes/proxy');

const PORT = Number(process.env.PORT) || 3000;

const app = express();

/* ── Rate limiting ───────────────────────────────────────── */

/** Trades API: 120 requests per minute per IP (enough for normal UI use). */
const tradesLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
});

/** Proxy / upstream API: 60 requests per minute per IP (prevents scraping). */
const proxyLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please slow down.' },
});

/** Static files: 300 requests per minute per IP. */
const staticLimiter = rateLimit({
  windowMs: 60_000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

/* ── Middleware ──────────────────────────────────────────── */

app.use(corsMiddleware);
app.use(express.json());

/* ── API routes ──────────────────────────────────────────── */

app.use('/api/trades', tradesLimiter, tradesRouter);
app.use('/api/proxy',  proxyLimiter,  proxyRouter);

/* ── Static frontend ─────────────────────────────────────── */

// Serve the frontend from the repo root (index.html lives there)
const staticRoot = path.join(__dirname, '..');
app.use(staticLimiter, express.static(staticRoot, {
  index: 'index.html',
}));

// SPA fallback: any unmatched GET returns index.html
app.get('*', staticLimiter, (req, res) => {
  res.sendFile(path.join(staticRoot, 'index.html'));
});

/* ── Global error handler ────────────────────────────────── */

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[PulseCentral]', err);
  res.status(500).json({ error: 'Internal server error' });
});

/* ── Start ───────────────────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`PulseCentral server running on http://localhost:${PORT}`);
});

module.exports = app;
