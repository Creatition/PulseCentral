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
const corsMiddleware = require('./middleware/cors');
const tradesRouter   = require('./routes/trades');
const proxyRouter    = require('./routes/proxy');

const PORT = Number(process.env.PORT) || 3000;

const app = express();

/* ── Middleware ──────────────────────────────────────────── */

app.use(corsMiddleware);
app.use(express.json());

/* ── API routes ──────────────────────────────────────────── */

app.use('/api/trades', tradesRouter);
app.use('/api/proxy',  proxyRouter);

/* ── Static frontend ─────────────────────────────────────── */

// Serve the frontend from the repo root (index.html lives there)
const staticRoot = path.join(__dirname, '..');
app.use(express.static(staticRoot, {
  // Don't serve node_modules or server directory
  index: 'index.html',
}));

// SPA fallback: any unmatched GET returns index.html
app.get('*', (req, res) => {
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
