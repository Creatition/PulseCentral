/**
 * PulseCentral – server/db.js
 * SQLite database setup and migrations using better-sqlite3.
 */

'use strict';

const path    = require('path');
const fs      = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || './data/pulsecentral.db';

// Ensure the directory for the database file exists
const dbDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.resolve(DB_PATH));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Run all schema migrations.
 * Each migration is idempotent so this can be called on every start.
 */
function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id                TEXT PRIMARY KEY,
      wallet            TEXT NOT NULL DEFAULT '',
      type              TEXT NOT NULL CHECK(type IN ('buy', 'sell')),
      token_address     TEXT NOT NULL DEFAULT '',
      token_symbol      TEXT NOT NULL DEFAULT '',
      token_name        TEXT NOT NULL DEFAULT '',
      date              TEXT NOT NULL,
      token_amount      REAL NOT NULL DEFAULT 0,
      pls_amount        REAL NOT NULL DEFAULT 0,
      usd_value         REAL NOT NULL DEFAULT 0,
      price_per_token_pls REAL NOT NULL DEFAULT 0,
      tx_hash           TEXT NOT NULL DEFAULT '',
      notes             TEXT NOT NULL DEFAULT '',
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_trades_wallet ON trades(wallet);
    CREATE INDEX IF NOT EXISTS idx_trades_token  ON trades(token_address);
    CREATE INDEX IF NOT EXISTS idx_trades_date   ON trades(date);
  `);
}

migrate();

module.exports = db;
