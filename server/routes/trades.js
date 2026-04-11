/**
 * PulseCentral – server/routes/trades.js
 * REST CRUD endpoints for trade records stored in SQLite.
 *
 * Endpoints:
 *   GET    /api/trades          – list all trades (optional ?wallet= filter)
 *   POST   /api/trades          – create a new trade
 *   PUT    /api/trades/:id      – update an existing trade
 *   DELETE /api/trades/:id      – delete a trade
 */

'use strict';

const express = require('express');
const db      = require('../db');
const router  = express.Router();

/* ── helpers ─────────────────────────────────────────────── */

/** Map a SQLite row to the TradeRecord shape expected by the frontend. */
function rowToRecord(row) {
  return {
    id:               row.id,
    wallet:           row.wallet,
    type:             row.type,
    tokenAddress:     row.token_address,
    tokenSymbol:      row.token_symbol,
    tokenName:        row.token_name,
    date:             row.date,
    tokenAmount:      row.token_amount,
    plsAmount:        row.pls_amount,
    usdValue:         row.usd_value,
    pricePerTokenPls: row.price_per_token_pls,
    txHash:           row.tx_hash,
    notes:            row.notes,
  };
}

/** Generate a short unique ID (same algorithm as the original TradesDB). */
function generateId() {
  const rand = Math.random().toString(36).slice(2, 5);
  return Date.now().toString(36) + rand + Math.random().toString(36).slice(2, 5);
}

/** Validate and coerce the body fields for a trade record. Returns an object or throws. */
function parseTrade(body) {
  const { type, tokenAddress, tokenSymbol, tokenName, date, tokenAmount, plsAmount, usdValue, pricePerTokenPls, txHash, notes, wallet } = body;

  if (!['buy', 'sell'].includes(type)) {
    throw Object.assign(new Error("Field 'type' must be 'buy' or 'sell'"), { status: 400 });
  }
  if (!date || isNaN(Date.parse(date))) {
    throw Object.assign(new Error("Field 'date' must be a valid ISO-8601 date string"), { status: 400 });
  }

  return {
    wallet:           String(wallet           || '').toLowerCase(),
    type,
    token_address:    String(tokenAddress     || '').toLowerCase(),
    token_symbol:     String(tokenSymbol      || ''),
    token_name:       String(tokenName        || ''),
    date:             String(date),
    token_amount:     Number(tokenAmount)      || 0,
    pls_amount:       Number(plsAmount)        || 0,
    usd_value:        Number(usdValue)         || 0,
    price_per_token_pls: Number(pricePerTokenPls) || 0,
    tx_hash:          String(txHash           || ''),
    notes:            String(notes            || ''),
  };
}

/* ── GET /api/trades ─────────────────────────────────────── */

router.get('/', (req, res) => {
  const { wallet } = req.query;
  let rows;
  if (wallet) {
    rows = db.prepare(
      'SELECT * FROM trades WHERE wallet = ? ORDER BY date ASC'
    ).all(String(wallet).toLowerCase());
  } else {
    rows = db.prepare('SELECT * FROM trades ORDER BY date ASC').all();
  }
  res.json(rows.map(rowToRecord));
});

/* ── POST /api/trades ────────────────────────────────────── */

router.post('/', (req, res) => {
  let fields;
  try {
    fields = parseTrade(req.body);
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const id = generateId();
  db.prepare(`
    INSERT INTO trades
      (id, wallet, type, token_address, token_symbol, token_name,
       date, token_amount, pls_amount, usd_value, price_per_token_pls,
       tx_hash, notes)
    VALUES
      (@id, @wallet, @type, @token_address, @token_symbol, @token_name,
       @date, @token_amount, @pls_amount, @usd_value, @price_per_token_pls,
       @tx_hash, @notes)
  `).run({ id, ...fields });

  const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  res.status(201).json(rowToRecord(row));
});

/* ── PUT /api/trades/:id ─────────────────────────────────── */

router.put('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Trade not found' });
  }

  let fields;
  try {
    // Merge with existing values so partial updates are supported
    fields = parseTrade({ ...rowToRecord(existing), ...req.body });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  db.prepare(`
    UPDATE trades SET
      wallet = @wallet,
      type = @type,
      token_address = @token_address,
      token_symbol = @token_symbol,
      token_name = @token_name,
      date = @date,
      token_amount = @token_amount,
      pls_amount = @pls_amount,
      usd_value = @usd_value,
      price_per_token_pls = @price_per_token_pls,
      tx_hash = @tx_hash,
      notes = @notes
    WHERE id = @id
  `).run({ id, ...fields });

  const row = db.prepare('SELECT * FROM trades WHERE id = ?').get(id);
  res.json(rowToRecord(row));
});

/* ── DELETE /api/trades/:id ──────────────────────────────── */

router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT id FROM trades WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Trade not found' });
  }
  db.prepare('DELETE FROM trades WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
