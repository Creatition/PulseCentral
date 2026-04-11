/**
 * PulseCentral – trades.js
 * Trade log CRUD (backend API) and FIFO profit/loss engine.
 *
 * TradesDB methods are async — they communicate with the Express
 * backend at /api/trades.  When USE_BACKEND is false in config.js,
 * the module gracefully degrades to an in-memory store so the app
 * still works when opened directly as a file.
 */

/* ── TradesDB ────────────────────────────────────────────── */

/**
 * Persistent store for trade records backed by the Express API.
 * Falls back to an in-memory store when the backend is unavailable.
 *
 * TradeRecord: {
 *   id              string   — unique id
 *   wallet          string   — lowercase wallet address (optional)
 *   type            'buy'|'sell'
 *   tokenAddress    string   — lowercase 0x address
 *   tokenSymbol     string
 *   tokenName       string
 *   date            string   — ISO-8601 UTC
 *   tokenAmount     number   — token units traded
 *   plsAmount       number   — PLS spent (buy) or received (sell)
 *   usdValue        number   — USD value at trade time (0 if unknown)
 *   pricePerTokenPls number  — derived: plsAmount / tokenAmount
 *   txHash          string   — on-chain tx hash (empty for manual entries)
 *   notes           string
 * }
 */
const TradesDB = (() => {
  const USE_BACKEND = (typeof PulseCentralConfig !== 'undefined') && PulseCentralConfig.USE_BACKEND;
  const API_BASE    = USE_BACKEND ? ((typeof PulseCentralConfig !== 'undefined' ? PulseCentralConfig.API_BASE : '') || '') : '';
  const ENDPOINT    = `${API_BASE}/api/trades`;

  /* ── in-memory fallback ────────────────────────────────── */
  let _fallbackTrades = [];
  let _idCounter = 0;

  function _generateId() {
    return Date.now().toString(36) + (++_idCounter).toString(36) + Math.random().toString(36).slice(2, 5);
  }

  /* ── backend helpers ───────────────────────────────────── */

  async function _apiFetch(path, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(ENDPOINT + path, {
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        ...options,
      });
      if (res.status === 204) return null;
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  /* ── public API (all async) ────────────────────────────── */

  /**
   * Return all trades, optionally filtered by wallet address.
   * @param {string} [wallet]
   * @returns {Promise<TradeRecord[]>}
   */
  async function getTrades(wallet) {
    if (!USE_BACKEND) return _fallbackTrades.slice();
    const qs = wallet ? `?wallet=${encodeURIComponent(wallet.toLowerCase())}` : '';
    return await _apiFetch(qs);
  }

  /**
   * Add a new trade record and return the saved record (with server-assigned id).
   * @param {object} trade
   * @returns {Promise<TradeRecord>}
   */
  async function addTrade(trade) {
    if (!USE_BACKEND) {
      const newTrade = { ...trade, id: _generateId() };
      _fallbackTrades.push(newTrade);
      return newTrade;
    }
    return await _apiFetch('', {
      method: 'POST',
      body: JSON.stringify(trade),
    });
  }

  /**
   * Update fields of an existing trade by id.
   * @param {string} id
   * @param {object} updates
   * @returns {Promise<TradeRecord>}
   */
  async function editTrade(id, updates) {
    if (!USE_BACKEND) {
      const idx = _fallbackTrades.findIndex(t => t.id === id);
      if (idx === -1) return null;
      _fallbackTrades[idx] = { ..._fallbackTrades[idx], ...updates, id };
      return _fallbackTrades[idx];
    }
    return await _apiFetch(`/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  }

  /**
   * Delete a trade by id.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async function deleteTrade(id) {
    if (!USE_BACKEND) {
      _fallbackTrades = _fallbackTrades.filter(t => t.id !== id);
      return;
    }
    await _apiFetch(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  /**
   * Return a Set of all txHash values already present in the trade log.
   * Used for duplicate detection during wallet import.
   * @param {string} [wallet]
   * @returns {Promise<Set<string>>}
   */
  async function getImportedTxHashes(wallet) {
    const trades = await getTrades(wallet);
    return new Set(trades.map(t => t.txHash).filter(Boolean));
  }

  return { getTrades, addTrade, editTrade, deleteTrade, getImportedTxHashes };
})();

/* ── FIFO P&L engine ─────────────────────────────────────── */

/**
 * Compute realized and unrealized P&L for all trades using FIFO cost basis.
 *
 * Example (from the spec):
 *   Buy  3,000,000 PLS worth of PLSX  ($20 USD)
 *   Sell 5,000,000 PLS worth of PLSX  ($35 USD)
 *   → realizedPls = +2,000,000   realizedUsd = +$15
 *
 * @param {object[]} trades        All trade records from TradesDB.getTrades()
 * @param {Map<string,object>} livePriceMap  Map<lowercaseAddress, DexScreener pair>
 * @returns {{ summary: object, byToken: object[] }}
 */
function computeProfits(trades, livePriceMap) {
  // Group trades by token address
  const grouped = new Map();
  for (const trade of trades) {
    const addr = (trade.tokenAddress || '').toLowerCase();
    if (!addr) continue;
    if (!grouped.has(addr)) {
      grouped.set(addr, {
        tokenAddress: addr,
        tokenSymbol:  trade.tokenSymbol || '',
        tokenName:    trade.tokenName   || '',
        trades: [],
      });
    }
    grouped.get(addr).trades.push(trade);
  }

  let totalRealizedUsd   = 0;
  let totalRealizedPls   = 0;
  let totalUnrealizedUsd = 0;
  const byToken = [];

  for (const [addr, info] of grouped) {
    // Sort by date ascending for correct FIFO ordering
    const sorted = [...info.trades].sort((a, b) => new Date(a.date) - new Date(b.date));

    // FIFO buy queue: each lot tracks remaining token units + per-unit costs
    const buyQueue = [];

    let totalBuyPls    = 0, totalBuyUsd    = 0, totalBuyTokens    = 0;
    let totalSellPls   = 0, totalSellUsd   = 0, totalSellTokens   = 0;
    let realizedPls    = 0, realizedUsd    = 0;

    for (const trade of sorted) {
      const tokenAmt = Number(trade.tokenAmount) || 0;
      const plsAmt   = Number(trade.plsAmount)   || 0;
      const usdVal   = Number(trade.usdValue)     || 0;

      if (trade.type === 'buy') {
        totalBuyPls    += plsAmt;
        totalBuyUsd    += usdVal;
        totalBuyTokens += tokenAmt;
        buyQueue.push({
          remaining:    tokenAmt,
          plsPerToken:  tokenAmt > 0 ? plsAmt / tokenAmt : 0,
          usdPerToken:  tokenAmt > 0 ? usdVal / tokenAmt : 0,
        });
      } else {
        // sell — FIFO-match against oldest buy lots
        totalSellPls    += plsAmt;
        totalSellUsd    += usdVal;
        totalSellTokens += tokenAmt;

        const sellPlsPerToken = tokenAmt > 0 ? plsAmt / tokenAmt : 0;
        const sellUsdPerToken = tokenAmt > 0 ? usdVal / tokenAmt : 0;

        let toMatch = tokenAmt;
        while (toMatch > 0 && buyQueue.length > 0) {
          const lot     = buyQueue[0];
          const matched = Math.min(lot.remaining, toMatch);
          realizedPls  += matched * (sellPlsPerToken - lot.plsPerToken);
          realizedUsd  += matched * (sellUsdPerToken - lot.usdPerToken);
          lot.remaining -= matched;
          toMatch       -= matched;
          if (lot.remaining <= 0) buyQueue.shift();
        }
      }
    }

    // Remaining unsold tokens (sum of all un-matched buy lots)
    const remainingTokens = buyQueue.reduce((s, l) => s + l.remaining, 0);

    // Weighted-average cost basis of remaining tokens
    let avgCostUsd = 0, avgCostPls = 0;
    if (remainingTokens > 0) {
      avgCostUsd = buyQueue.reduce((s, l) => s + l.remaining * l.usdPerToken, 0) / remainingTokens;
      avgCostPls = buyQueue.reduce((s, l) => s + l.remaining * l.plsPerToken, 0) / remainingTokens;
    }

    // Unrealized P&L uses live DexScreener price
    const livePair      = livePriceMap.get(addr);
    const livePrice     = Number(livePair?.priceUsd || 0);
    const unrealizedUsd = remainingTokens > 0 && livePrice > 0
      ? remainingTokens * (livePrice - avgCostUsd)
      : 0;

    // Overall return %: (realized + unrealized) / total invested in USD
    const returnPct = totalBuyUsd > 0
      ? ((realizedUsd + unrealizedUsd) / totalBuyUsd) * 100
      : 0;

    totalRealizedUsd   += realizedUsd;
    totalRealizedPls   += realizedPls;
    totalUnrealizedUsd += unrealizedUsd;

    byToken.push({
      tokenAddress:   addr,
      tokenSymbol:    info.tokenSymbol,
      tokenName:      info.tokenName,
      totalBuyPls,    totalBuyUsd,
      totalSellPls,   totalSellUsd,
      realizedUsd,    realizedPls,
      remainingTokens,
      avgCostUsd,     avgCostPls,
      unrealizedUsd,  livePrice,
      returnPct,
      tradeCount:     info.trades.length,
    });
  }

  return {
    summary: {
      totalRealizedUsd,
      totalRealizedPls,
      totalUnrealizedUsd,
      tokenCount: byToken.length,
    },
    byToken,
  };
}
