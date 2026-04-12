'use strict';

const express = require('express');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── In-memory response cache ───────────────────────────────── */

const cache     = new Map();
const CACHE_TTL = 30_000; // 30 seconds

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) { cache.delete(key); return null; }
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// Periodically sweep expired cache entries to bound memory usage
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache) {
    if (now - entry.ts > CACHE_TTL) cache.delete(key);
  }
}, 60_000).unref();

/* ── Path sanitisation ──────────────────────────────────────── */

/**
 * Strip `..` segments and any embedded protocol/host characters from a
 * user-supplied sub-path so the constructed upstream URL always stays on
 * the expected host.  Returns null when the sanitised path looks unsafe.
 */
function sanitisePath(raw) {
  if (typeof raw !== 'string') return null;
  // Remove null bytes and collapse any leading slashes
  const cleaned = raw.replace(/\0/g, '').replace(/^\/+/, '');
  // Reject strings that still contain `..` sequences after splitting
  const segments = cleaned.split('/');
  if (segments.some(s => s === '..')) return null;
  // Reject anything that could smuggle a different host (@, scheme colon)
  if (/[@:]/.test(cleaned)) return null;
  return cleaned;
}

/* ── Shared proxy helper ─────────────────────────────────────── */

/**
 * Forward a GET request to `upstreamUrl`, cache the JSON response,
 * and send it back to the browser.
 */
async function proxyJson(res, upstreamUrl) {
  const cached = getCached(upstreamUrl);
  if (cached) return res.json(cached);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PulseCentral/1.0)',
        'Accept':     'application/json',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: `Upstream returned HTTP ${upstream.status}` });
    }

    const data = await upstream.json();
    setCached(upstreamUrl, data);
    res.json(data);
  } catch (err) {
    console.error('[PulseCentral proxy]', upstreamUrl, err.message);
    res.status(502).json({ error: 'Proxy request failed', detail: err.message });
  }
}

/**
 * Rebuild a query string from Express req.query so we can append it to the
 * upstream URL without inadvertently double-encoding or dropping parameters.
 */
function qs(req) {
  const str = new URLSearchParams(req.query).toString();
  return str ? '?' + str : '';
}

/* ── Proxy routes ────────────────────────────────────────────── */

// PulseChain Scan v1 (BlockScout) API
// Frontend: /api/scan?module=account&action=balance&address=0x…
app.get('/api/scan', (req, res) => {
  proxyJson(res, `https://api.scan.pulsechain.com/api${qs(req)}`);
});

// DexScreener main API  (handles /latest/dex/…, /token-profiles/…, /token-boosts/…)
// Frontend: /api/dex/latest/dex/tokens/…  or  /api/dex/token-profiles/latest/v1
app.get('/api/dex/*', (req, res) => {
  const subPath = sanitisePath(req.params[0]);
  if (subPath === null) return res.status(400).json({ error: 'Invalid path' });
  proxyJson(res, `https://api.dexscreener.com/${subPath}${qs(req)}`);
});

// DexScreener chart / OHLCV API  (io.dexscreener.com)
// Frontend: /api/dex-io/dex/chart/amm/v3/pulsechain/<pairAddr>?res=D&cb=0
app.get('/api/dex-io/*', (req, res) => {
  const subPath = sanitisePath(req.params[0]);
  if (subPath === null) return res.status(400).json({ error: 'Invalid path' });
  proxyJson(res, `https://io.dexscreener.com/${subPath}${qs(req)}`);
});

// DexTools shared-data pair API
// Frontend: /api/dextools?address=<pair>&chain=pulse&audit=true&locks=true
app.get('/api/dextools', (req, res) => {
  proxyJson(res, `https://www.dextools.io/shared/data/pair${qs(req)}`);
});

// PulseChain Scan v2 REST API  (scan.pulsechain.com/api/v2/…)
// Frontend: /api/scan-v2/tokens/<addr>   or   /api/scan-v2/tokens/<addr>/transfers
app.get('/api/scan-v2/*', (req, res) => {
  const subPath = sanitisePath(req.params[0]);
  if (subPath === null) return res.status(400).json({ error: 'Invalid path' });
  proxyJson(res, `https://scan.pulsechain.com/api/v2/${subPath}${qs(req)}`);
});

// GoPlus Security API
// Frontend: /api/goplus/api/v1/token_security/369?contract_addresses=<addr>
app.get('/api/goplus/*', (req, res) => {
  const subPath = sanitisePath(req.params[0]);
  if (subPath === null) return res.status(400).json({ error: 'Invalid path' });
  proxyJson(res, `https://api.gopluslabs.io/${subPath}${qs(req)}`);
});

/* ── Static file serving ─────────────────────────────────────── */

// Serve the entire repo root (index.html, js/, css/, assets/)
app.use(express.static(path.join(__dirname, '..')));

/* ── Start server ────────────────────────────────────────────── */

app.listen(PORT, () => {
  console.log(`PulseCentral running at http://localhost:${PORT}`);
});
