/**
 * PulseCentral – server/routes/proxy.js
 * Transparent proxy for upstream APIs (PulseChain Scan + DexScreener).
 * All responses are cached in-memory for CACHE_TTL_MS to reduce upstream
 * rate-limit pressure.
 *
 * Endpoints:
 *   GET /api/proxy/scan       – PulseChain Scan (BlockScout) module API
 *   GET /api/proxy/dexscreener – DexScreener /latest/dex/*
 *   GET /api/proxy/dexchart   – DexScreener chart / OHLCV API
 *   GET /api/proxy/dexprofiles – DexScreener token profiles / boosts
 *   GET /api/proxy/gopluslabs  – GoPlus Security token_security API
 *   GET /api/proxy/scan-v2     – BlockScout v2 REST API (metadata + transfers)
 */

'use strict';

const express = require('express');
const router  = express.Router();

/* ── In-memory cache ─────────────────────────────────────── */

const CACHE_TTL_MS = 30_000; // 30 seconds

/** @type {Map<string, {data: any, expiresAt: number}>} */
const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.data;
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/* ── Upstream fetch helper ───────────────────────────────── */

const TIMEOUT_MS = 15_000;

/**
 * Fetch JSON from an upstream URL, with caching and timeout.
 * @param {string} url
 * @returns {Promise<any>}
 */
async function upstreamFetch(url) {
  const cached = getCached(url);
  if (cached !== null) return cached;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw Object.assign(
        new Error(`Upstream responded with HTTP ${res.status}`),
        { status: res.status }
      );
    }
    const data = await res.json();
    setCache(url, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/* ── Upstream base URLs ──────────────────────────────────── */

const SCAN_BASE       = 'https://api.scan.pulsechain.com/api';
const DSX_BASE        = 'https://api.dexscreener.com/latest/dex';
const DSX_CHART_BASE  = 'https://io.dexscreener.com/dex/chart/amm/v3/pulsechain';
const GOPLUS_BASE     = 'https://api.gopluslabs.io/api/v1';
const SCAN_V2_BASE    = 'https://scan.pulsechain.com/api/v2';
const DSX_PROFILES    = 'https://api.dexscreener.com';

/* ── Route handlers ──────────────────────────────────────── */

/**
 * Rebuild the query string from req.query to pass to the upstream API,
 * excluding any keys specific to our routing (none currently).
 */
function buildQueryString(query) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (Array.isArray(v)) {
      v.forEach(val => params.append(k, val));
    } else {
      params.set(k, v);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Generic proxy handler factory.
 * @param {string} upstreamBase  Base URL of the upstream API
 * @param {(req: express.Request) => string} buildPath  Derive the path+query from the request
 */
function makeProxy(upstreamBase, buildPath) {
  return async (req, res) => {
    const path = buildPath(req);
    const url  = upstreamBase + path;
    try {
      const data = await upstreamFetch(url);
      res.json(data);
    } catch (err) {
      const status = err.status || 502;
      console.error(`[proxy] ${url} → ${status}: ${err.message}`);
      res.status(status).json({ error: err.message });
    }
  };
}

// PulseChain Scan — pass all query params through
router.get('/scan', makeProxy(SCAN_BASE, req => buildQueryString(req.query)));

// DexScreener /latest/dex — wildcard sub-path forwarded to upstream
// e.g. /api/proxy/dexscreener/tokens/0xabc,0xdef → /tokens/0xabc,0xdef
router.get('/dexscreener/*', makeProxy(DSX_BASE, req => {
  const sub = req.params[0] || '';
  const qs  = buildQueryString(req.query);
  return sub ? `/${sub}${qs}` : `/${qs}`;
}));

// DexScreener chart (OHLCV) — pair address in path, params in query
router.get('/dexchart/:pairAddress', makeProxy(DSX_CHART_BASE, req => {
  const qs = buildQueryString(req.query);
  return `/${req.params.pairAddress}${qs}`;
}));

// DexScreener token profiles & boosts — arbitrary path after /dexprofiles
router.get('/dexprofiles/*', makeProxy(DSX_PROFILES, req => {
  // req.params[0] is the wildcard part after /dexprofiles/
  const sub = req.params[0] || '';
  const qs  = buildQueryString(req.query);
  return `/${sub}${qs}`;
}));

// GoPlus Security
router.get('/gopluslabs/*', makeProxy(GOPLUS_BASE, req => {
  const sub = req.params[0] || '';
  const qs  = buildQueryString(req.query);
  return `/${sub}${qs}`;
}));

// BlockScout v2 REST API (token metadata + transfers)
router.get('/scan-v2/*', makeProxy(SCAN_V2_BASE, req => {
  const sub = req.params[0] || '';
  const qs  = buildQueryString(req.query);
  return `/${sub}${qs}`;
}));

module.exports = router;
