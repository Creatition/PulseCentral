/**
 * PulseCentral – app.js
 * Tab routing, theme switching, portfolio loading, markets, and trending rendering.
 */

/* ── Theme switcher ──────────────────────────────────────── */

const THEMES = ['pulsechain', 'hex', 'pulsex', 'incentive'];

const THEME_NAMES = {
  pulsechain: 'PulseChain',
  hex: 'HEX',
  pulsex: 'PulseX',
  incentive: 'Incentive',
};

/**
 * Apply a named theme to the <html> element and persist it in localStorage.
 * Updates the active state of the swatch buttons and the network badge label.
 * @param {string} name  One of: 'pulsechain' | 'hex' | 'pulsex' | 'incentive'
 */
function applyTheme(name) {
  if (!THEMES.includes(name)) name = 'pulsechain';
  document.documentElement.dataset.theme = name;
  try { localStorage.setItem('pc-theme', name); } catch { /* storage unavailable */ }
  document.querySelectorAll('.theme-swatch').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === name);
  });
  const badge = document.querySelector('.network-badge');
  if (badge) badge.textContent = '⛓ ' + (THEME_NAMES[name] || name);
}

// Restore saved theme (or default to pulsechain) before first paint
(function initTheme() {
  let saved = 'pulsechain';
  try { saved = localStorage.getItem('pc-theme') || 'pulsechain'; } catch { /* ignore */ }
  applyTheme(saved);
})();

// Wire swatch click handlers
document.querySelectorAll('.theme-swatch').forEach(btn => {
  btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
});

/* ── Formatters ─────────────────────────────────────────── */

const fmt = {
  /** Format a USD price with smart decimal places */
  price(val) {
    const n = Number(val);
    if (!n || isNaN(n)) return '—';
    if (n >= 1000)  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (n >= 1)     return '$' + n.toFixed(4);
    if (n >= 0.001) return '$' + n.toFixed(6);
    return '$' + n.toExponential(4);
  },

  /** Format a USD value (balance × price) */
  usd(val) {
    const n = Number(val);
    if (!n || isNaN(n)) return '—';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /** Format a large number (volume, liquidity) */
  large(val) {
    const n = Number(val);
    if (!n || isNaN(n)) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
    return '$' + n.toFixed(2);
  },

  /** Format token balance with commas */
  balance(val) {
    const n = Number(val);
    if (!n || isNaN(n)) return '0';
    if (n >= 1000)  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (n >= 1)     return n.toFixed(4);
    if (n >= 0.001) return n.toFixed(6);
    return n.toExponential(4);
  },

  /** Format 24h change percentage */
  change(val) {
    const n = Number(val);
    if (isNaN(n)) return { text: '—', cls: 'change-neutral' };
    const sign = n >= 0 ? '+' : '';
    return {
      text: `${sign}${n.toFixed(2)}%`,
      cls:  n > 0 ? 'change-positive' : n < 0 ? 'change-negative' : 'change-neutral',
    };
  },

  /** Format a PLS amount (large integer, no $ sign) */
  pls(val) {
    const n = Number(val);
    if (!n || isNaN(n)) return '—';
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B PLS';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M PLS';
    if (n >= 1e3) return n.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' PLS';
    return n.toFixed(2) + ' PLS';
  },

  /** Format a signed USD profit/loss value (e.g. +$15.00 or -$3.50) */
  signedUsd(val) {
    const n = Number(val);
    if (isNaN(n)) return '—';
    const sign = n >= 0 ? '+' : '-';
    const abs  = Math.abs(n);
    return sign + '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /** Format a signed PLS profit/loss value (e.g. +2M PLS or -500K PLS) */
  signedPls(val) {
    const n = Number(val);
    if (isNaN(n)) return '—';
    const sign = n >= 0 ? '+' : '-';
    const abs  = Math.abs(n);
    let body;
    if (abs >= 1e9)      body = (abs / 1e9).toFixed(2) + 'B';
    else if (abs >= 1e6) body = (abs / 1e6).toFixed(2) + 'M';
    else if (abs >= 1e3) body = abs.toLocaleString('en-US', { maximumFractionDigits: 0 });
    else                 body = abs.toFixed(2);
    return sign + body + ' PLS';
  },
};

/* ── DOM helpers ────────────────────────────────────────── */

const $ = id => document.getElementById(id);
const setHidden  = (el, hidden) => el.classList.toggle('hidden', hidden);
const setVisible = (el, visible) => setHidden(el, !visible);

/** Returns true if the given string is a valid EVM address (0x + 40 hex chars) */
const isValidAddress = addr => /^0x[0-9a-fA-F]{40}$/.test(addr);

/** Wrapped PLS (WPLS) contract address — used to look up the PLS/USD price */
const WPLS_ADDRESS = '0xa1077a294dde1b09bb078844df40758a5D0f9a27';

/** Build a token logo element (img if URL available, placeholder otherwise) */
function buildTokenLogo(logoUrl, symbol) {
  if (logoUrl) {
    const img = document.createElement('img');
    img.src = logoUrl;
    img.alt = symbol;
    img.className = 'token-logo';
    img.onerror = () => {
      const ph = buildPlaceholder(symbol);
      img.replaceWith(ph);
    };
    return img;
  }
  return buildPlaceholder(symbol);
}

function buildPlaceholder(symbol) {
  const div = document.createElement('div');
  div.className = 'token-logo-placeholder';
  div.textContent = (symbol || '?').slice(0, 3).toUpperCase();
  return div;
}

/** Render a <td> with change colouring */
function changeTd(pct) {
  const td = document.createElement('td');
  td.className = 'align-right';
  const { text, cls } = fmt.change(pct);
  td.innerHTML = `<span class="${cls}">${text}</span>`;
  return td;
}

/* ── Tab navigation ─────────────────────────────────────── */

const tabBtns   = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

let activeTab = 'home';
let marketsLoaded   = false;
let trendingLoaded  = false;

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(name) {
  activeTab = name;
  tabBtns.forEach(b => {
    const active = b.dataset.tab === name;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', active);
  });
  tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${name}`));

  if (name === 'home'      && !homeLoaded)    loadHomeTab();
  if (name === 'markets'   && !marketsLoaded)  loadMarkets();
  if (name === 'trending'  && !trendingLoaded) loadTrending();
  if (name === 'watchlist')                    renderWatchlistTab();
  if (name === 'profits')                      renderProfitsTab();
}

/* ── Home tab (Landing Page) ─────────────────────────────── */

let homeLoaded       = false;
let homeRefreshTimer = null;

/**
 * Build an SVG sparkline from a DexScreener pair's priceChange data.
 * Uses the h24, h6, h1, m5 change percentages to approximate 5 historical
 * price points and draws a filled area + line chart.
 * @param {object|null} pair  DexScreener pair object
 * @returns {string}  SVG markup string
 */
function buildSparklineSvg(pair) {
  const W = 200, H = 56;
  const currentPrice = Number(pair?.priceUsd || 0);

  if (!currentPrice) {
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="var(--border-light)" stroke-width="1.5" stroke-dasharray="4 3"/>
    </svg>`;
  }

  // Reconstruct approximate price at each historical point (oldest → newest)
  const pctChanges = [
    Number(pair?.priceChange?.h24 || 0),
    Number(pair?.priceChange?.h6  || 0),
    Number(pair?.priceChange?.h1  || 0),
    Number(pair?.priceChange?.m5  || 0),
    0,
  ];
  const prices = pctChanges.map((c, i) => {
    if (i === 4) return currentPrice;
    const factor = 1 + c / 100;
    return factor > 0.01 ? currentPrice / factor : currentPrice;
  });

  const minP  = Math.min(...prices);
  const maxP  = Math.max(...prices);
  const range = maxP - minP || currentPrice * 0.02;
  const pad   = 6;

  const pts = prices.map((p, i) => [
    (i / (prices.length - 1)) * W,
    H - pad - ((p - minP) / range) * (H - pad * 2),
  ]);

  const linePath = pts.map((p, i) =>
    `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
  ).join(' ');

  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;

  const isUp  = Number(pair?.priceChange?.h24 || 0) >= 0;
  const color = isUp ? '#22c55e' : '#ef4444';
  const gid   = `sg${Math.random().toString(36).slice(2, 8)}`;

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${areaPath}" fill="url(#${gid})"/>
    <path d="${linePath}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/**
 * Build a coin card DOM element for one core token.
 * @param {string} symbol  Token symbol (e.g. 'WPLS')
 * @param {object|null} pair  DexScreener pair object, or null if unavailable
 * @returns {HTMLElement}
 */
function buildCoinCard(symbol, pair) {
  const card = document.createElement('article');
  card.className = 'coin-card';

  const token     = pair?.baseToken || { symbol, name: symbol };
  const price     = Number(pair?.priceUsd || 0);
  const change24h = Number(pair?.priceChange?.h24 || 0);
  const vol24h    = pair?.volume?.h24;
  const liq       = pair?.liquidity?.usd;
  const logoUrl   = pair?.info?.imageUrl || null;
  const { text: changeText, cls: changeCls } = fmt.change(change24h);
  const isUp      = change24h >= 0;

  card.classList.toggle('coin-card-up',   isUp);
  card.classList.toggle('coin-card-down', !isUp);

  // Header: logo + name + 24h badge
  const header = document.createElement('div');
  header.className = 'coin-card-header';

  const logoWrap = document.createElement('div');
  logoWrap.className = 'coin-logo-wrap';
  logoWrap.appendChild(buildTokenLogo(logoUrl, symbol));

  const info = document.createElement('div');
  info.className = 'coin-info';
  info.innerHTML = `
    <div class="coin-name">${escHtml(token.name || symbol)}</div>
    <div class="coin-symbol">${escHtml(symbol)}</div>
  `;

  const changeBadge = document.createElement('div');
  changeBadge.className = `coin-change ${changeCls}`;
  changeBadge.textContent = changeText;

  header.append(logoWrap, info, changeBadge);

  // Price
  const priceEl = document.createElement('div');
  priceEl.className = 'coin-price';
  priceEl.textContent = price ? fmt.price(price) : '—';

  // Sparkline chart
  const chart = document.createElement('div');
  chart.className = 'coin-chart';
  chart.innerHTML = buildSparklineSvg(pair);

  // Stats row
  const stats = document.createElement('div');
  stats.className = 'coin-stats';
  stats.innerHTML = `
    <div class="coin-stat">
      <span class="coin-stat-label">Vol 24h</span>
      <span class="coin-stat-value">${fmt.large(vol24h)}</span>
    </div>
    <div class="coin-stat">
      <span class="coin-stat-label">Liquidity</span>
      <span class="coin-stat-value">${fmt.large(liq)}</span>
    </div>
  `;

  card.append(header, priceEl, chart, stats);
  return card;
}

/**
 * Render all core coin cards into the home grid.
 * @param {Array<{symbol: string, pair: object|null}>} coinData
 */
function renderHomeCoinCards(coinData) {
  const grid = $('home-coins-grid');
  grid.innerHTML = '';
  coinData.forEach(({ symbol, pair }) => {
    grid.appendChild(buildCoinCard(symbol, pair));
  });
}

/**
 * Load core coin data and display it on the Home tab.
 * Also starts the 60-second auto-refresh timer.
 */
async function loadHomeTab() {
  homeLoaded = true;
  if (homeRefreshTimer) clearInterval(homeRefreshTimer);

  setHidden($('home-error'), true);
  setVisible($('home-loading'), true);
  setHidden($('home-coins-grid'), true);
  setHidden($('home-footer'), true);

  try {
    const coinData = await API.getCoreCoinPairs();
    renderHomeCoinCards(coinData);
    updateHomeTimestamp();
    setHidden($('home-loading'), true);
    setVisible($('home-coins-grid'), true);
    setVisible($('home-footer'), true);

    // Auto-refresh prices every 60 seconds
    homeRefreshTimer = setInterval(async () => {
      try {
        const fresh = await API.getCoreCoinPairs();
        renderHomeCoinCards(fresh);
        updateHomeTimestamp();
      } catch (err) {
        console.error('[PulseCentral] Home auto-refresh failed:', err);
      }
    }, 60_000);
  } catch (err) {
    setHidden($('home-loading'), true);
    $('home-error').textContent = `Error loading market data: ${err.message}`;
    setVisible($('home-error'), true);
  }
}

function updateHomeTimestamp() {
  const el = $('home-last-updated');
  if (el) el.textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

$('home-refresh-btn').addEventListener('click', () => {
  homeLoaded = false;
  loadHomeTab();
});

// Auto-load the home tab on first page load
loadHomeTab();

/* ── Portfolio tab ──────────────────────────────────────── */

const loadBtn    = $('load-portfolio-btn');
const loadBtnTxt = $('load-portfolio-btn-text');
const loadSpinner= $('load-portfolio-spinner');
const walletInput= $('wallet-input');

let hideSmallBalances = true;      // default: hide coins < $0.05
let cachedPortfolioTokens  = [];   // enriched token list from last load
let cachedPlsBalance = 0;
let cachedPlsPrice   = 0;

$('hide-small-balances').addEventListener('change', e => {
  hideSmallBalances = e.target.checked;
  if (cachedPortfolioTokens.length || cachedPlsBalance) {
    renderPortfolioTable(cachedPortfolioTokens, cachedPlsBalance, cachedPlsPrice);
  }
});

loadBtn.addEventListener('click', () => {
  const address = walletInput.value.trim();
  if (!address) {
    showPortfolioError('Please enter a wallet address.');
    return;
  }
  if (!isValidAddress(address)) {
    showPortfolioError('Invalid Ethereum/PulseChain address format. Must start with 0x and be 42 characters.');
    return;
  }
  loadPortfolio(address);
});

walletInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') loadBtn.click();
});

/* Save Wallet button — updates appearance based on watchlist state */
const saveWalletBtn = $('save-wallet-btn');

function updateSaveWalletBtn() {
  const addr = walletInput.value.trim();
  const saved = addr && Watchlist.hasWallet(addr);
  saveWalletBtn.classList.toggle('saved', saved);
  saveWalletBtn.textContent = saved ? '★ Saved' : '☆ Save';
  saveWalletBtn.title = saved ? 'Remove wallet from Watchlist' : 'Save wallet to Watchlist';
}

walletInput.addEventListener('input', updateSaveWalletBtn);

saveWalletBtn.addEventListener('click', () => {
  const addr = walletInput.value.trim();
  if (!addr) { showPortfolioError('Enter a wallet address first.'); return; }
  if (!isValidAddress(addr)) {
    showPortfolioError('Invalid address format. Must start with 0x and be 42 characters.');
    return;
  }
  if (Watchlist.hasWallet(addr)) {
    Watchlist.removeWallet(addr);
  } else {
    Watchlist.addWallet(addr);
  }
  updateSaveWalletBtn();
});

function setPortfolioLoading(loading) {
  loadBtn.disabled = loading;
  setHidden(loadBtnTxt, loading);
  setHidden(loadSpinner, !loading);
}

function showPortfolioError(msg) {
  const el = $('portfolio-error');
  el.textContent = msg;
  setVisible(el, true);
}
function hidePortfolioError() {
  setHidden($('portfolio-error'), true);
}

async function loadPortfolio(address) {
  hidePortfolioError();
  setPortfolioLoading(true);
  setHidden($('portfolio-summary'), true);
  setHidden($('portfolio-toolbar'), true);
  setHidden($('portfolio-table-wrap'), true);
  setVisible($('portfolio-empty'), true);
  setHidden($('group-context-banner'), true);

  try {
    // Fetch PLS balance and token list in parallel
    const [plsBalance, tokens] = await Promise.all([
      API.getPlsBalance(address),
      API.getTokenList(address),
    ]);

    // Filter tokens with a non-zero balance
    const activeTokens = tokens.filter(t => t.balance > 0);

    // Fetch DEX price data for all token contract addresses
    const addresses = activeTokens.map(t => t.contractAddress);
    const pairMap   = await API.getPairsByAddresses(addresses);

    // Enrich tokens with price data
    const enriched = activeTokens.map(t => {
      const pair  = pairMap.get(t.contractAddress.toLowerCase());
      const price = Number(pair?.priceUsd || 0);
      const change24h = Number(pair?.priceChange?.h24 || 0);
      const value = price * t.balance;
      const logoUrl = pair?.info?.imageUrl || null;
      return { ...t, price, change24h, value, logoUrl };
    });

    // Sort by USD value descending
    enriched.sort((a, b) => b.value - a.value);

    // Compute total value (PLS value approximated from WPLS pair if available)
    const wplsPair  = pairMap.get('0xa1077a294dde1b09bb078844df40758a5d0f9a27');
    const plsPrice  = Number(wplsPair?.priceUsd || 0);
    const plsValue  = plsBalance * plsPrice;
    const totalUsd  = enriched.reduce((s, t) => s + t.value, 0) + plsValue;

    // Cache for re-render when toggle changes
    cachedPortfolioTokens = enriched;
    cachedPlsBalance      = plsBalance;
    cachedPlsPrice        = plsPrice;

    renderPortfolioSummary(totalUsd, enriched.length + 1, plsBalance, plsPrice);
    renderPortfolioTable(enriched, plsBalance, plsPrice);

    setHidden($('portfolio-empty'), true);
    setVisible($('portfolio-summary'), true);
    setVisible($('portfolio-toolbar'), true);
    setVisible($('portfolio-table-wrap'), true);
  } catch (err) {
    showPortfolioError(`Error loading portfolio: ${err.message}`);
  } finally {
    setPortfolioLoading(false);
  }
}

function renderPortfolioSummary(totalUsd, tokenCount, plsBalance, plsPrice) {
  $('summary-total-usd').textContent    = fmt.usd(totalUsd);
  $('summary-token-count').textContent  = tokenCount;
  $('summary-pls-balance').textContent  = fmt.balance(plsBalance) + ' PLS';
  if (plsPrice) {
    $('summary-pls-balance').title = `≈ ${fmt.usd(plsBalance * plsPrice)}`;
  }
}

function renderPortfolioTable(tokens, plsBalance, plsPrice) {
  const DUST_THRESHOLD = 0.05;
  const tbody = $('portfolio-tbody');
  tbody.innerHTML = '';

  // Apply small-balance filter to tokens (PLS native is always shown)
  const visibleTokens = hideSmallBalances
    ? tokens.filter(t => t.value >= DUST_THRESHOLD)
    : tokens;

  const hiddenCount = tokens.length - visibleTokens.length;
  const countEl = $('hidden-coins-count');
  if (hideSmallBalances && hiddenCount > 0) {
    countEl.textContent = `(${hiddenCount} coin${hiddenCount !== 1 ? 's' : ''} hidden)`;
    setVisible(countEl, true);
  } else {
    setHidden(countEl, true);
  }

  // PLS native row (first)
  const plsRow = buildPortfolioRow(
    1,
    { symbol: 'PLS', name: 'PulseChain', logoUrl: null },
    plsBalance,
    plsPrice,
    0 // change unavailable for native
  );
  tbody.appendChild(plsRow);

  visibleTokens.forEach((t, i) => {
    tbody.appendChild(buildPortfolioRow(i + 2, t, t.balance, t.price, t.change24h));
  });
}

function buildPortfolioRow(index, token, balance, price, change24h) {
  const tr = document.createElement('tr');

  // # index
  const tdIdx = document.createElement('td');
  tdIdx.className = 'row-index';
  tdIdx.textContent = index;

  // Token name
  const tdToken = document.createElement('td');
  const tokenCell = document.createElement('div');
  tokenCell.className = 'token-cell';
  tokenCell.appendChild(buildTokenLogo(token.logoUrl, token.symbol));
  const nameSpan = document.createElement('span');
  nameSpan.className = 'token-name';
  nameSpan.textContent = token.name || token.symbol;
  tokenCell.appendChild(nameSpan);
  tdToken.appendChild(tokenCell);

  // Symbol
  const tdSym = document.createElement('td');
  tdSym.innerHTML = `<span class="token-symbol">${token.symbol}</span>`;

  // Balance
  const tdBal = document.createElement('td');
  tdBal.className = 'align-right';
  tdBal.textContent = fmt.balance(balance);

  // Price
  const tdPrice = document.createElement('td');
  tdPrice.className = 'align-right';
  tdPrice.textContent = price ? fmt.price(price) : '—';

  // Value
  const tdValue = document.createElement('td');
  tdValue.className = 'align-right';
  tdValue.textContent = price ? fmt.usd(balance * price) : '—';

  // 24h change
  tr.append(tdIdx, tdToken, tdSym, tdBal, tdPrice, tdValue, changeTd(change24h));
  return tr;
}

/* ── Markets tab ────────────────────────────────────────── */

let allMarketPairs  = [];
let marketSortCol   = 'volume';
let marketSortDir   = 'desc';

async function loadMarkets() {
  marketsLoaded = true;
  setHidden($('markets-error'), true);
  setHidden($('markets-table-wrap'), true);
  setVisible($('markets-loading'), true);

  try {
    allMarketPairs = await API.getTopPulsechainPairs();
    renderMarketsTable();
  } catch (err) {
    $('markets-error').textContent = `Error loading market data: ${err.message}`;
    setVisible($('markets-error'), true);
  } finally {
    setHidden($('markets-loading'), true);
  }
}

$('markets-refresh-btn').addEventListener('click', () => {
  marketsLoaded = false;
  loadMarkets();
});

$('market-search').addEventListener('input', () => renderMarketsTable());

// Sortable column headers
document.querySelectorAll('.data-table th.sortable').forEach(th => {
  th.addEventListener('click', () => {
    const col = th.dataset.sort;
    if (marketSortCol === col) {
      marketSortDir = marketSortDir === 'desc' ? 'asc' : 'desc';
    } else {
      marketSortCol = col;
      marketSortDir = 'desc';
    }
    // Update UI
    document.querySelectorAll('.data-table th.sortable').forEach(h => {
      h.classList.remove('sort-asc', 'sort-desc');
    });
    th.classList.add(`sort-${marketSortDir}`);
    renderMarketsTable();
  });
});

function sortPairs(pairs) {
  return [...pairs].sort((a, b) => {
    let av, bv;
    switch (marketSortCol) {
      case 'price':     av = Number(a.priceUsd || 0);             bv = Number(b.priceUsd || 0);             break;
      case 'change':    av = Number(a.priceChange?.h24 || 0);     bv = Number(b.priceChange?.h24 || 0);     break;
      case 'volume':    av = Number(a.volume?.h24 || 0);          bv = Number(b.volume?.h24 || 0);          break;
      case 'liquidity': av = Number(a.liquidity?.usd || 0);       bv = Number(b.liquidity?.usd || 0);       break;
      default:          av = bv = 0;
    }
    return marketSortDir === 'desc' ? bv - av : av - bv;
  });
}

function renderMarketsTable() {
  const query = $('market-search').value.trim().toLowerCase();
  let pairs = allMarketPairs;

  if (query) {
    pairs = pairs.filter(p => {
      const name = (p.baseToken?.name || '').toLowerCase();
      const sym  = (p.baseToken?.symbol || '').toLowerCase();
      return name.includes(query) || sym.includes(query);
    });
  }

  pairs = sortPairs(pairs);

  const tbody = $('markets-tbody');
  tbody.innerHTML = '';
  pairs.slice(0, 100).forEach((pair, i) => {
    tbody.appendChild(buildMarketRow(i + 1, pair));
  });

  setVisible($('markets-table-wrap'), true);
}

function buildMarketRow(index, pair) {
  const tr = document.createElement('tr');

  const token   = pair.baseToken || {};
  const logoUrl = pair.info?.imageUrl || null;

  // #
  const tdIdx = document.createElement('td');
  tdIdx.className = 'row-index';
  tdIdx.textContent = index;

  // Token
  const tdToken = document.createElement('td');
  const cell    = document.createElement('div');
  cell.className = 'token-cell';
  cell.appendChild(buildTokenLogo(logoUrl, token.symbol));
  const nameEl = document.createElement('span');
  nameEl.className = 'token-name';
  nameEl.textContent = token.name || token.symbol;
  cell.appendChild(nameEl);
  tdToken.appendChild(cell);

  // Symbol
  const tdSym = document.createElement('td');
  tdSym.innerHTML = `<span class="token-symbol">${token.symbol || '—'}</span>`;

  // Price
  const tdPrice = document.createElement('td');
  tdPrice.className = 'align-right';
  tdPrice.textContent = fmt.price(pair.priceUsd);

  // 24h change
  const tdChange = changeTd(pair.priceChange?.h24);

  // Volume 24h
  const tdVol = document.createElement('td');
  tdVol.className = 'align-right';
  tdVol.textContent = fmt.large(pair.volume?.h24);

  // Liquidity
  const tdLiq = document.createElement('td');
  tdLiq.className = 'align-right';
  tdLiq.textContent = fmt.large(pair.liquidity?.usd);

  // Star (watch) button
  const tdStar = document.createElement('td');
  tdStar.className = 'align-center';
  const starBtn = document.createElement('button');
  starBtn.className = 'star-btn';
  const tokenAddr  = (pair.baseToken?.address || '').toLowerCase();
  const isWatched  = Watchlist.hasToken(tokenAddr);
  starBtn.textContent = isWatched ? '★' : '☆';
  starBtn.classList.toggle('active', isWatched);
  starBtn.title = isWatched ? 'Remove from Watchlist' : 'Add to Watchlist';
  starBtn.setAttribute('aria-label', isWatched ? 'Remove from Watchlist' : 'Add to Watchlist');
  starBtn.addEventListener('click', () => {
    if (Watchlist.hasToken(tokenAddr)) {
      Watchlist.removeToken(tokenAddr);
      starBtn.textContent = '☆';
      starBtn.classList.remove('active');
      starBtn.title = 'Add to Watchlist';
    } else {
      Watchlist.addToken({
        address: tokenAddr,
        symbol:  token.symbol || '',
        name:    token.name   || token.symbol || '',
        logoUrl: pair.info?.imageUrl || null,
      });
      starBtn.textContent = '★';
      starBtn.classList.add('active');
      starBtn.title = 'Remove from Watchlist';
    }
  });
  tdStar.appendChild(starBtn);

  tr.append(tdIdx, tdToken, tdSym, tdPrice, tdChange, tdVol, tdLiq, tdStar);
  return tr;
}

/* ── Trending tab ───────────────────────────────────────── */

async function loadTrending() {
  trendingLoaded = true;
  setHidden($('trending-error'), true);
  setHidden($('trending-grid'), true);
  setVisible($('trending-loading'), true);

  try {
    const pairs = await API.getTopPulsechainPairs();
    // For trending: sort by 24h volume and show top 24
    const trending = [...pairs]
      .sort((a, b) => Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0))
      .slice(0, 24);
    renderTrendingGrid(trending);
    setHidden($('trending-loading'), true);
    setVisible($('trending-grid'), true);
  } catch (err) {
    setHidden($('trending-loading'), true);
    $('trending-error').textContent = `Error loading trending data: ${err.message}`;
    setVisible($('trending-error'), true);
  }
}

function renderTrendingGrid(pairs) {
  const grid = $('trending-grid');
  grid.innerHTML = '';

  pairs.forEach(pair => {
    const token   = pair.baseToken || {};
    const logoUrl = pair.info?.imageUrl || null;
    const { text: changeText, cls: changeCls } = fmt.change(pair.priceChange?.h24);

    const card = document.createElement('div');
    card.className = 'trending-card';

    card.innerHTML = `
      <div class="trending-card-header">
        <div class="token-logo-placeholder" style="font-size:0.7rem;width:32px;height:32px">
          ${(token.symbol || '?').slice(0, 3)}
        </div>
        <div>
          <div class="trending-name">${escHtml(token.name || token.symbol || '—')}</div>
          <div class="trending-symbol">${escHtml(token.symbol || '—')}</div>
        </div>
      </div>
      <div class="trending-price">${fmt.price(pair.priceUsd)}</div>
      <div class="trending-meta">
        <span class="${changeCls}">${changeText}</span>
        <span>Vol ${fmt.large(pair.volume?.h24)}</span>
        <span>Liq ${fmt.large(pair.liquidity?.usd)}</span>
      </div>
      <div class="trending-badge">🔥 Trending</div>
    `;

    // Replace placeholder with actual logo if available
    if (logoUrl) {
      const img = document.createElement('img');
      img.src = logoUrl;
      img.alt = token.symbol;
      img.className = 'token-logo';
      img.style.cssText = 'width:32px;height:32px;border-radius:50%';
      img.onerror = () => img.remove();
      card.querySelector('.token-logo-placeholder').replaceWith(img);
    }

    grid.appendChild(card);
  });
}

/* ── Watchlist module ────────────────────────────────────── */

/**
 * All watchlist state lives in localStorage under 'pc-watchlist'.
 * Shape: { wallets: string[], tokens: {address, symbol, name, logoUrl}[] }
 */
const Watchlist = (() => {
  const KEY = 'pc-watchlist';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          wallets: Array.isArray(parsed.wallets) ? parsed.wallets : [],
          tokens:  Array.isArray(parsed.tokens)  ? parsed.tokens  : [],
        };
      }
    } catch { /* ignore */ }
    return { wallets: [], tokens: [] };
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }

  function addWallet(addr) {
    const data = load();
    const norm = addr.toLowerCase();
    if (!data.wallets.map(w => w.toLowerCase()).includes(norm)) {
      data.wallets.push(addr);
      save(data);
    }
  }

  function removeWallet(addr) {
    const data = load();
    const norm = addr.toLowerCase();
    data.wallets = data.wallets.filter(w => w.toLowerCase() !== norm);
    save(data);
  }

  function hasWallet(addr) {
    return load().wallets.map(w => w.toLowerCase()).includes(addr.toLowerCase());
  }

  function addToken(token) {
    const data = load();
    const norm = token.address.toLowerCase();
    if (!data.tokens.find(t => t.address.toLowerCase() === norm)) {
      data.tokens.push({ ...token, address: norm });
      save(data);
    }
  }

  function removeToken(address) {
    const data = load();
    const norm = address.toLowerCase();
    data.tokens = data.tokens.filter(t => t.address.toLowerCase() !== norm);
    save(data);
  }

  function hasToken(address) {
    const norm = address.toLowerCase();
    return load().tokens.some(t => t.address.toLowerCase() === norm);
  }

  function getWallets() { return load().wallets; }
  function getTokens()  { return load().tokens; }

  return { addWallet, removeWallet, hasWallet, addToken, removeToken, hasToken, getWallets, getTokens };
})();

/* ── Portfolio Groups module ─────────────────────────────── */

/**
 * Portfolio groups are stored in localStorage under 'pc-groups'.
 * Shape: { groups: { id, name, addresses: { addr, label }[] }[] }
 */
const PortfolioGroups = (() => {
  const KEY = 'pc-groups';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch { /* ignore */ }
    return [];
  }

  function save(groups) {
    try { localStorage.setItem(KEY, JSON.stringify(groups)); } catch { /* ignore */ }
  }

  function getGroups() { return load(); }

  function addGroup(name, addresses) {
    const groups = load();
    const id = crypto.randomUUID();
    groups.push({ id, name, addresses });
    save(groups);
    return id;
  }

  function updateGroup(id, name, addresses) {
    const groups = load();
    const idx = groups.findIndex(g => g.id === id);
    if (idx !== -1) { groups[idx] = { id, name, addresses }; save(groups); }
  }

  function removeGroup(id) {
    const groups = load().filter(g => g.id !== id);
    save(groups);
  }

  function getGroup(id) {
    return load().find(g => g.id === id) || null;
  }

  return { getGroups, addGroup, updateGroup, removeGroup, getGroup };
})();

/* ── Portfolio Groups UI ─────────────────────────────────── */

// In-modal address list being edited
let groupModalAddresses = []; // [{addr, label}]

function renderGroupsList() {
  const groups = PortfolioGroups.getGroups();
  const container = $('groups-list');
  container.innerHTML = '';

  groups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'group-card';
    card.setAttribute('role', 'listitem');

    const icon = document.createElement('span');
    icon.className = 'group-card-icon';
    icon.textContent = '🗂';

    const info = document.createElement('div');
    info.className = 'group-card-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'group-card-name';
    nameEl.textContent = group.name;

    const meta = document.createElement('div');
    meta.className = 'group-card-meta';
    const labels = group.addresses.map(a => a.label || a.addr.slice(0, 8) + '…').join(', ');
    meta.textContent = `${group.addresses.length} address${group.addresses.length !== 1 ? 'es' : ''}: ${labels}`;
    meta.title = group.addresses.map(a => a.label ? `${a.label}: ${a.addr}` : a.addr).join('\n');

    info.append(nameEl, meta);

    const actions = document.createElement('div');
    actions.className = 'group-card-actions';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'wl-load-btn';
    loadBtn.textContent = '▶ Load';
    loadBtn.title = 'Load combined portfolio for this group';
    loadBtn.addEventListener('click', () => loadGroupPortfolio(group));

    const editBtn = document.createElement('button');
    editBtn.className = 'wl-load-btn';
    editBtn.textContent = '✎ Edit';
    editBtn.title = 'Edit group';
    editBtn.addEventListener('click', () => openGroupModal(group));

    const removeBtn = document.createElement('button');
    removeBtn.className = 'wl-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Delete group';
    removeBtn.addEventListener('click', () => {
      if (!confirm(`Delete group "${group.name}"?`)) return;
      PortfolioGroups.removeGroup(group.id);
      renderGroupsList();
    });

    actions.append(loadBtn, editBtn, removeBtn);
    card.append(icon, info, actions);
    container.appendChild(card);
  });
}

async function loadGroupPortfolio(group) {
  if (group.addresses.length === 0) {
    showPortfolioError('This group has no addresses. Add at least one address first.');
    return;
  }

  hidePortfolioError();
  setPortfolioLoading(true);
  setHidden($('portfolio-summary'), true);
  setHidden($('portfolio-table-wrap'), true);
  setVisible($('portfolio-empty'), true);
  setHidden($('group-context-banner'), true);

  try {
    // Fetch PLS balance + token list for every address in the group in parallel
    const results = await Promise.all(
      group.addresses.map(({ addr }) =>
        Promise.all([API.getPlsBalance(addr), API.getTokenList(addr)])
      )
    );

    // Aggregate PLS and tokens across all addresses
    let totalPlsBalance = 0;
    const tokenMap = new Map(); // contractAddress (lower) -> {token object}

    results.forEach(([plsBalance, tokens]) => {
      totalPlsBalance += plsBalance;
      tokens.filter(t => t.balance > 0).forEach(t => {
        const key = t.contractAddress.toLowerCase();
        if (tokenMap.has(key)) {
          tokenMap.get(key).balance += t.balance;
        } else {
          tokenMap.set(key, { ...t, balance: t.balance });
        }
      });
    });

    const activeTokens = [...tokenMap.values()];

    // Fetch DEX price data
    const addresses = activeTokens.map(t => t.contractAddress);
    const pairMap   = await API.getPairsByAddresses(addresses);

    // Enrich with price data
    const enriched = activeTokens.map(t => {
      const pair  = pairMap.get(t.contractAddress.toLowerCase());
      const price     = Number(pair?.priceUsd   || 0);
      const change24h = Number(pair?.priceChange?.h24 || 0);
      const value     = price * t.balance;
      const logoUrl   = pair?.info?.imageUrl || null;
      return { ...t, price, change24h, value, logoUrl };
    });

    enriched.sort((a, b) => b.value - a.value);

    const wplsPair = pairMap.get('0xa1077a294dde1b09bb078844df40758a5D0f9a27');
    const plsPrice = Number(wplsPair?.priceUsd || 0);
    const plsValue = totalPlsBalance * plsPrice;
    const totalUsd = enriched.reduce((s, t) => s + t.value, 0) + plsValue;

    renderPortfolioSummary(totalUsd, enriched.length + 1, totalPlsBalance, plsPrice);
    renderPortfolioTable(enriched, totalPlsBalance, plsPrice);

    setHidden($('portfolio-empty'), true);
    setVisible($('portfolio-summary'), true);
    setVisible($('portfolio-table-wrap'), true);

    // Show group context banner
    const banner    = $('group-context-banner');
    const nameEl    = $('group-context-name');
    nameEl.textContent = '';
    nameEl.appendChild(document.createTextNode('🗂 '));
    const strong = document.createElement('strong');
    strong.textContent = group.name;
    nameEl.appendChild(strong);
    $('group-context-addresses').textContent =
      `${group.addresses.length} wallet${group.addresses.length !== 1 ? 's' : ''} combined`;
    setVisible(banner, true);

    // Clear single-wallet input to avoid confusion
    walletInput.value = '';
    updateSaveWalletBtn();
  } catch (err) {
    showPortfolioError(`Error loading group portfolio: ${err.message}`);
  } finally {
    setPortfolioLoading(false);
  }
}

/* ── Group modal ─────────────────────────────────────────── */

function openGroupModal(group = null) {
  groupModalAddresses = group ? group.addresses.map(a => ({ ...a })) : [];
  $('group-id').value = group ? group.id : '';
  $('group-name-input').value = group ? group.name : '';
  $('group-modal-title').textContent = group ? 'Edit Portfolio Group' : 'New Portfolio Group';
  $('group-addr-input').value = '';
  $('group-addr-label-input').value = '';
  hideGroupModalError();
  renderGroupAddrList();
  setVisible($('group-modal-overlay'), true);
  $('group-name-input').focus();
}

function closeGroupModal() {
  setHidden($('group-modal-overlay'), true);
}

function showGroupModalError(msg) {
  const el = $('group-modal-error');
  el.textContent = msg;
  setVisible(el, true);
}

function hideGroupModalError() {
  setHidden($('group-modal-error'), true);
}

function renderGroupAddrList() {
  const list = $('group-addr-list');
  list.innerHTML = '';

  if (groupModalAddresses.length === 0) {
    const li = document.createElement('li');
    li.className = 'wl-empty';
    li.style.cssText = 'padding:0.5rem 0;font-size:0.85rem;';
    li.textContent = 'No addresses added yet.';
    list.appendChild(li);
    return;
  }

  groupModalAddresses.forEach((entry, idx) => {
    const li = document.createElement('li');
    li.className = 'group-addr-item';

    if (entry.label) {
      const labelEl = document.createElement('span');
      labelEl.className = 'group-addr-item-label';
      labelEl.textContent = entry.label;
      labelEl.title = entry.label;
      li.appendChild(labelEl);
    }

    const addrEl = document.createElement('span');
    addrEl.className = 'group-addr-item-addr';
    addrEl.textContent = entry.addr;
    addrEl.title = entry.addr;
    li.appendChild(addrEl);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'wl-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove address';
    removeBtn.type = 'button';
    removeBtn.addEventListener('click', () => {
      const norm = entry.addr.toLowerCase();
      groupModalAddresses = groupModalAddresses.filter(a => a.addr.toLowerCase() !== norm);
      renderGroupAddrList();
    });
    li.appendChild(removeBtn);

    list.appendChild(li);
  });
}

function addGroupAddress() {
  const addrRaw  = $('group-addr-input').value.trim();
  const labelRaw = $('group-addr-label-input').value.trim();

  if (!addrRaw) { showGroupModalError('Enter a wallet address to add.'); return; }
  if (!isValidAddress(addrRaw)) {
    showGroupModalError('Invalid address format. Must start with 0x and be 42 characters.');
    return;
  }
  const norm = addrRaw.toLowerCase();
  if (groupModalAddresses.some(a => a.addr.toLowerCase() === norm)) {
    showGroupModalError('This address is already in the group.');
    return;
  }

  hideGroupModalError();
  groupModalAddresses.push({ addr: addrRaw, label: labelRaw });
  $('group-addr-input').value = '';
  $('group-addr-label-input').value = '';
  renderGroupAddrList();
  $('group-addr-input').focus();
}

$('create-group-btn').addEventListener('click', () => openGroupModal());
$('group-modal-close').addEventListener('click', closeGroupModal);
$('group-modal-cancel').addEventListener('click', closeGroupModal);
$('group-modal-overlay').addEventListener('click', e => {
  if (e.target === $('group-modal-overlay')) closeGroupModal();
});
$('group-add-addr-btn').addEventListener('click', addGroupAddress);
$('group-addr-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); addGroupAddress(); }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('group-modal-overlay').classList.contains('hidden')) closeGroupModal();
});

$('group-modal-save').addEventListener('click', () => {
  hideGroupModalError();
  const name = $('group-name-input').value.trim();
  if (!name) { showGroupModalError('Please enter a group name.'); return; }
  if (groupModalAddresses.length === 0) { showGroupModalError('Add at least one wallet address.'); return; }

  const id = $('group-id').value;
  if (id) {
    PortfolioGroups.updateGroup(id, name, groupModalAddresses);
  } else {
    PortfolioGroups.addGroup(name, groupModalAddresses);
  }

  closeGroupModal();
  renderGroupsList();
});

// Render groups on page load
renderGroupsList();



$('wl-refresh-btn').addEventListener('click', () => loadWatchlistTokenPrices());

async function renderWatchlistTab() {
  renderWatchlistWallets();
  await loadWatchlistTokenPrices();
}

function renderWatchlistWallets() {
  const wallets = Watchlist.getWallets();
  $('wl-wallet-count').textContent = wallets.length;
  const list  = $('wl-wallets-list');
  const empty = $('wl-wallets-empty');
  list.innerHTML = '';

  setVisible(empty, wallets.length === 0);
  setHidden(list, wallets.length === 0);

  wallets.forEach(addr => {
    const li = document.createElement('li');
    li.className = 'wl-wallet-item';

    const addrSpan = document.createElement('span');
    addrSpan.className = 'wl-wallet-addr';
    addrSpan.textContent = addr;
    addrSpan.title = addr;

    const actions = document.createElement('div');
    actions.className = 'wl-wallet-actions';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'wl-load-btn';
    loadBtn.textContent = '▶ Load';
    loadBtn.addEventListener('click', () => {
      walletInput.value = addr;
      updateSaveWalletBtn();
      switchTab('portfolio');
      loadPortfolio(addr);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'wl-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove from Watchlist';
    removeBtn.addEventListener('click', () => {
      Watchlist.removeWallet(addr);
      renderWatchlistWallets();
      updateSaveWalletBtn();
    });

    actions.append(loadBtn, removeBtn);
    li.append(addrSpan, actions);
    list.appendChild(li);
  });
}

async function loadWatchlistTokenPrices() {
  const tokens = Watchlist.getTokens();
  $('wl-token-count').textContent = tokens.length;
  const empty   = $('wl-tokens-empty');
  const loading = $('wl-tokens-loading');
  const wrap    = $('wl-tokens-table-wrap');

  if (tokens.length === 0) {
    setVisible(empty, true);
    setHidden(loading, true);
    setHidden(wrap, true);
    return;
  }

  setHidden(empty, true);
  setVisible(loading, true);
  setHidden(wrap, true);

  try {
    const addresses = tokens.map(t => t.address);
    const pairMap   = await API.getPairsByAddresses(addresses);
    renderWatchlistTokens(tokens, pairMap);
    setHidden(loading, true);
    setVisible(wrap, true);
  } catch {
    setHidden(loading, true);
    renderWatchlistTokens(tokens, new Map());
    setVisible(wrap, true);
  }
}

function renderWatchlistTokens(tokens, pairMap) {
  const tbody = $('wl-tokens-tbody');
  tbody.innerHTML = '';

  tokens.forEach(token => {
    const pair      = pairMap.get(token.address.toLowerCase());
    const price     = Number(pair?.priceUsd || 0);
    const change24h = Number(pair?.priceChange?.h24 || 0);
    const vol24h    = pair?.volume?.h24;
    const logoUrl   = pair?.info?.imageUrl || token.logoUrl || null;

    const tr = document.createElement('tr');

    // Token name + logo
    const tdToken = document.createElement('td');
    const cell    = document.createElement('div');
    cell.className = 'token-cell';
    cell.appendChild(buildTokenLogo(logoUrl, token.symbol));
    const nameEl  = document.createElement('span');
    nameEl.className = 'token-name';
    nameEl.textContent = token.name || token.symbol;
    cell.appendChild(nameEl);
    tdToken.appendChild(cell);

    // Symbol
    const tdSym = document.createElement('td');
    tdSym.innerHTML = `<span class="token-symbol">${escHtml(token.symbol || '—')}</span>`;

    // Price
    const tdPrice = document.createElement('td');
    tdPrice.className = 'align-right';
    tdPrice.textContent = price ? fmt.price(price) : '—';

    // 24h change
    const tdChange = changeTd(change24h);

    // Volume
    const tdVol = document.createElement('td');
    tdVol.className = 'align-right';
    tdVol.textContent = fmt.large(vol24h);

    // Remove button
    const tdRemove = document.createElement('td');
    tdRemove.className = 'align-center';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'wl-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove from Watchlist';
    removeBtn.addEventListener('click', () => {
      Watchlist.removeToken(token.address);
      // Refresh watchlist tab and re-render market star buttons
      loadWatchlistTokenPrices();
      $('wl-token-count').textContent = Watchlist.getTokens().length;
      // Update any visible star button in the Markets table
      document.querySelectorAll('.star-btn').forEach(btn => {
        const row = btn.closest('tr');
        if (!row) return;
        const sym = row.querySelector('.token-symbol')?.textContent;
        if (sym && sym === token.symbol) {
          btn.textContent = '☆';
          btn.classList.remove('active');
          btn.title = 'Add to Watchlist';
        }
      });
    });
    tdRemove.appendChild(removeBtn);

    tr.append(tdToken, tdSym, tdPrice, tdChange, tdVol, tdRemove);
    tbody.appendChild(tr);
  });
}

/* ── Security helper ────────────────────────────────────── */

/** Escape HTML special chars to prevent XSS when using innerHTML */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ── Profits tab ─────────────────────────────────────────── */

/** CSS class name for a signed numeric value */
function plSignClass(val) {
  const n = Number(val);
  if (n > 0) return 'change-positive';
  if (n < 0) return 'change-negative';
  return 'change-neutral';
}

/** Convert a UTC ISO string to the value format required by datetime-local inputs */
function toDatetimeLocal(isoStr) {
  const d = new Date(isoStr);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ── Profits tab rendering ──────────────────────────────── */

async function renderProfitsTab() {
  const trades = TradesDB.getTrades();

  $('profits-trade-count').textContent = trades.length;
  setHidden($('profits-error'), true);

  renderTradeLog(trades);

  if (trades.length === 0) {
    setVisible($('profits-token-empty'), true);
    setHidden($('profits-token-loading'), true);
    setHidden($('profits-token-table-wrap'), true);
    renderProfitsSummary({ totalRealizedUsd: 0, totalRealizedPls: 0, totalUnrealizedUsd: 0, tokenCount: 0 });
    return;
  }

  setHidden($('profits-token-empty'), true);
  setVisible($('profits-token-loading'), true);
  setHidden($('profits-token-table-wrap'), true);

  try {
    const uniqueAddresses = [...new Set(trades.map(t => (t.tokenAddress || '').toLowerCase()).filter(Boolean))];
    const livePriceMap    = await API.getPairsByAddresses(uniqueAddresses);
    const { summary, byToken } = computeProfits(trades, livePriceMap);
    renderProfitsSummary(summary);
    renderTokenBreakdown(byToken);
    setHidden($('profits-token-loading'), true);
    setVisible($('profits-token-table-wrap'), true);
  } catch (err) {
    setHidden($('profits-token-loading'), true);
    const { summary, byToken } = computeProfits(trades, new Map());
    renderProfitsSummary(summary);
    renderTokenBreakdown(byToken);
    if (byToken.length > 0) setVisible($('profits-token-table-wrap'), true);
    $('profits-error').textContent = `Could not fetch live prices: ${err.message}. Unrealized P&L may be unavailable.`;
    setVisible($('profits-error'), true);
  }
}

function renderProfitsSummary(summary) {
  const { totalRealizedUsd, totalRealizedPls, totalUnrealizedUsd, tokenCount } = summary;

  const rusdEl = $('profits-realized-usd');
  rusdEl.textContent = totalRealizedUsd !== 0 ? fmt.signedUsd(totalRealizedUsd) : '—';
  rusdEl.className   = 'summary-value ' + plSignClass(totalRealizedUsd);

  const rplsEl = $('profits-realized-pls');
  rplsEl.textContent = totalRealizedPls !== 0 ? fmt.signedPls(totalRealizedPls) : '—';
  rplsEl.className   = 'summary-value ' + plSignClass(totalRealizedPls);

  const uusdEl = $('profits-unrealized-usd');
  uusdEl.textContent = totalUnrealizedUsd !== 0 ? fmt.signedUsd(totalUnrealizedUsd) : '—';
  uusdEl.className   = 'summary-value ' + plSignClass(totalUnrealizedUsd);

  $('profits-token-count').textContent = tokenCount || '—';
}

function renderTokenBreakdown(byToken) {
  const tbody = $('profits-token-tbody');
  tbody.innerHTML = '';

  byToken.forEach(info => {
    const tr = document.createElement('tr');

    // Token name + symbol
    const tdToken = document.createElement('td');
    const nameDiv = document.createElement('div');
    nameDiv.className = 'token-cell';
    const nameSpan = document.createElement('span');
    nameSpan.className = 'token-name';
    nameSpan.textContent = info.tokenName || info.tokenSymbol;
    nameDiv.appendChild(nameSpan);
    if (info.tokenSymbol && info.tokenSymbol !== info.tokenName) {
      const symSpan = document.createElement('span');
      symSpan.className = 'token-symbol';
      symSpan.textContent = info.tokenSymbol;
      nameDiv.appendChild(document.createTextNode(' '));
      nameDiv.appendChild(symSpan);
    }
    tdToken.appendChild(nameDiv);

    const makeTd = text => {
      const td = document.createElement('td');
      td.className = 'align-right';
      td.textContent = text;
      return td;
    };

    const makeSignedTd = (val, formatter) => {
      const td = document.createElement('td');
      td.className = 'align-right';
      const span = document.createElement('span');
      span.className = plSignClass(val);
      span.textContent = formatter(val);
      td.appendChild(span);
      return td;
    };

    const { text: retText, cls: retCls } = fmt.change(info.returnPct);
    const tdRet = document.createElement('td');
    tdRet.className = 'align-right';
    const retSpan = document.createElement('span');
    retSpan.className = retCls;
    retSpan.textContent = retText;
    tdRet.appendChild(retSpan);

    tr.append(
      tdToken,
      makeTd(fmt.pls(info.totalBuyPls)),
      makeTd(fmt.usd(info.totalBuyUsd)),
      makeTd(fmt.pls(info.totalSellPls)),
      makeTd(fmt.usd(info.totalSellUsd)),
      makeSignedTd(info.realizedUsd, v => fmt.signedUsd(v)),
      makeSignedTd(info.realizedPls, v => fmt.signedPls(v)),
      makeSignedTd(info.unrealizedUsd, v => fmt.signedUsd(v)),
      tdRet,
    );
    tbody.appendChild(tr);
  });
}

function renderTradeLog(trades) {
  const tbody = $('profits-log-tbody');
  const empty = $('profits-log-empty');
  const wrap  = $('profits-log-table-wrap');

  tbody.innerHTML = '';
  setVisible(empty, trades.length === 0);
  setHidden(wrap, trades.length === 0);
  if (trades.length === 0) return;

  // Newest first in the log
  const sorted = [...trades].sort((a, b) => new Date(b.date) - new Date(a.date));

  sorted.forEach(trade => {
    const tr = document.createElement('tr');

    // Date
    const tdDate = document.createElement('td');
    tdDate.style.cssText = 'font-size:0.82rem;white-space:nowrap';
    tdDate.textContent = new Date(trade.date).toLocaleString();

    // Token
    const tdToken = document.createElement('td');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'token-name';
    nameSpan.textContent = trade.tokenName || trade.tokenSymbol;
    tdToken.appendChild(nameSpan);

    // Type badge
    const tdType = document.createElement('td');
    tdType.innerHTML = `<span class="trade-badge trade-badge-${escHtml(trade.type)}">${escHtml(trade.type.toUpperCase())}</span>`;

    // Token amount
    const tdAmt = document.createElement('td');
    tdAmt.className = 'align-right';
    tdAmt.textContent = fmt.balance(trade.tokenAmount);

    // PLS amount
    const tdPls = document.createElement('td');
    tdPls.className = 'align-right';
    tdPls.textContent = fmt.pls(trade.plsAmount);

    // USD value
    const tdUsd = document.createElement('td');
    tdUsd.className = 'align-right';
    tdUsd.textContent = trade.usdValue ? fmt.usd(trade.usdValue) : '—';

    // Notes
    const tdNotes = document.createElement('td');
    tdNotes.className = 'trade-notes';
    tdNotes.textContent = trade.notes || '';
    tdNotes.title = trade.notes || '';

    // Actions
    const tdActions = document.createElement('td');
    tdActions.className = 'align-center';

    const editBtn = document.createElement('button');
    editBtn.className = 'wl-load-btn';
    editBtn.textContent = '✎ Edit';
    editBtn.addEventListener('click', () => openTradeModal(trade));

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'wl-remove-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Delete trade';
    deleteBtn.addEventListener('click', () => {
      if (!confirm(`Delete this ${trade.type} trade for ${trade.tokenSymbol}?`)) return;
      TradesDB.deleteTrade(trade.id);
      renderProfitsTab();
    });

    const actDiv = document.createElement('div');
    actDiv.className = 'wl-wallet-actions';
    actDiv.append(editBtn, deleteBtn);
    tdActions.appendChild(actDiv);

    tr.append(tdDate, tdToken, tdType, tdAmt, tdPls, tdUsd, tdNotes, tdActions);
    tbody.appendChild(tr);
  });
}

/* ── Add/Edit Trade modal ────────────────────────────────── */

// Populate the known-token datalist once
(function populateKnownTokensDatalist() {
  const dl = $('known-tokens-datalist');
  API.KNOWN_TOKENS.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t.address;
    opt.label = `${t.symbol}  —  ${t.address}`;
    dl.appendChild(opt);
  });
})();

// Auto-fill symbol/name when user picks a known token address
$('trade-token-address').addEventListener('input', () => {
  const val = $('trade-token-address').value.trim().toLowerCase();
  const known = API.KNOWN_TOKENS.find(t => t.address.toLowerCase() === val);
  if (known) {
    if (!$('trade-token-symbol').value) $('trade-token-symbol').value = known.symbol;
    if (!$('trade-token-name').value)   $('trade-token-name').value   = known.name || known.symbol;
  }
});

// Fetch current DexScreener price and multiply by token amount to suggest USD value
$('fetch-price-btn').addEventListener('click', async () => {
  const addr      = $('trade-token-address').value.trim();
  const tokenAmt  = Number($('trade-token-amount').value) || 0;
  const btn       = $('fetch-price-btn');

  if (!addr) { showTradeFormError('Enter a token address first.'); return; }

  btn.textContent = '…';
  btn.disabled = true;
  try {
    const pairMap = await API.getPairsByAddresses([addr]);
    const pair    = pairMap.get(addr.toLowerCase());
    const price   = Number(pair?.priceUsd || 0);
    if (price && tokenAmt > 0) {
      $('trade-usd-value').value = (price * tokenAmt).toFixed(4);
    } else if (price) {
      $('trade-usd-value').value = price.toFixed(6);
    } else {
      showTradeFormError('No price data found for this token on DexScreener.');
    }
  } catch (err) {
    showTradeFormError(`Price fetch failed: ${err.message}`);
  } finally {
    btn.textContent = '↻';
    btn.disabled = false;
  }
});

function openTradeModal(trade = null) {
  const form = $('trade-form');
  form.reset();
  hideTradeFormError();

  if (trade) {
    $('trade-modal-title').textContent    = 'Edit Trade';
    $('trade-id').value                   = trade.id;
    $('trade-token-address').value        = trade.tokenAddress;
    $('trade-token-symbol').value         = trade.tokenSymbol;
    $('trade-token-name').value           = trade.tokenName || '';
    const typeRadio = form.querySelector(`input[name="trade-type"][value="${trade.type}"]`);
    if (typeRadio) typeRadio.checked = true;
    $('trade-date').value                 = trade.date ? toDatetimeLocal(trade.date) : '';
    $('trade-token-amount').value         = trade.tokenAmount;
    $('trade-pls-amount').value           = trade.plsAmount;
    $('trade-usd-value').value            = trade.usdValue || '';
    $('trade-notes').value                = trade.notes || '';
  } else {
    $('trade-modal-title').textContent = 'Add Trade';
    $('trade-id').value = '';
    // Default date to current local time (truncated to minutes)
    const now = new Date();
    now.setSeconds(0, 0);
    $('trade-date').value = toDatetimeLocal(now.toISOString());
  }

  setVisible($('trade-modal-overlay'), true);
  $('trade-token-address').focus();
}

function closeTradeModal() {
  setHidden($('trade-modal-overlay'), true);
}

function showTradeFormError(msg) {
  const el = $('trade-form-error');
  el.textContent = msg;
  setVisible(el, true);
}

function hideTradeFormError() {
  setHidden($('trade-form-error'), true);
}

// Open modal via toolbar button
$('add-trade-btn').addEventListener('click', () => openTradeModal());

// Close modal
$('trade-modal-close').addEventListener('click', closeTradeModal);
$('trade-modal-cancel').addEventListener('click', closeTradeModal);
$('trade-modal-overlay').addEventListener('click', e => {
  if (e.target === $('trade-modal-overlay')) closeTradeModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('trade-modal-overlay').classList.contains('hidden')) closeTradeModal();
});

// Form submit — add or edit a trade
$('trade-form').addEventListener('submit', e => {
  e.preventDefault();
  hideTradeFormError();

  const tokenAddress = $('trade-token-address').value.trim();
  const tokenSymbol  = $('trade-token-symbol').value.trim();
  const tokenName    = $('trade-token-name').value.trim();
  const type         = document.querySelector('input[name="trade-type"]:checked')?.value;
  const dateVal      = $('trade-date').value;
  const tokenAmount  = Number($('trade-token-amount').value);
  const plsAmount    = Number($('trade-pls-amount').value);
  const usdValue     = Number($('trade-usd-value').value) || 0;
  const notes        = $('trade-notes').value.trim();
  const id           = $('trade-id').value;

  // Validation
  if (!tokenAddress)  { showTradeFormError('Token address is required.'); return; }
  if (!isValidAddress(tokenAddress)) {
    showTradeFormError('Invalid token address — must start with 0x and be 42 characters.');
    return;
  }
  if (!tokenSymbol)   { showTradeFormError('Token symbol is required.'); return; }
  if (!type)          { showTradeFormError('Select a trade type.'); return; }
  if (!dateVal)       { showTradeFormError('Date is required.'); return; }
  if (!tokenAmount || tokenAmount <= 0) { showTradeFormError('Token amount must be greater than 0.'); return; }
  if (!plsAmount  || plsAmount  <= 0)  { showTradeFormError('PLS amount must be greater than 0.'); return; }

  const tradeData = {
    tokenAddress:    tokenAddress.toLowerCase(),
    tokenSymbol,
    tokenName:       tokenName || tokenSymbol,
    type,
    date:            new Date(dateVal).toISOString(),
    tokenAmount,
    plsAmount,
    usdValue,
    pricePerTokenPls: tokenAmount > 0 ? plsAmount / tokenAmount : 0,
    notes,
  };

  if (id) {
    TradesDB.editTrade(id, tradeData);
  } else {
    TradesDB.addTrade(tradeData);
  }

  closeTradeModal();
  if (activeTab === 'profits') renderProfitsTab();
});

/* ── Import from Wallet modal ────────────────────────────── */

/**
 * Discovered trades from the most recent wallet fetch.
 * Array of trade objects returned by API.parseWalletTrades().
 * @type {Array<object>}
 */
let _importCandidates = [];

function openImportModal() {
  showImportStep('input');
  $('import-wallet-input').value = '';
  $('import-step1-error').textContent = '';
  setHidden($('import-step1-error'), true);
  setVisible($('import-modal-overlay'), true);
  $('import-wallet-input').focus();
}

function closeImportModal() {
  setHidden($('import-modal-overlay'), true);
}

/** Show one of the three import steps and hide the others */
function showImportStep(step) {
  setVisible($('import-step-input'),   step === 'input');
  setVisible($('import-step-preview'), step === 'preview');
  setVisible($('import-step-done'),    step === 'done');
}

function showImportError(msg) {
  const el = $('import-step1-error');
  el.textContent = msg;
  setVisible(el, true);
}

$('import-wallet-btn').addEventListener('click', openImportModal);
$('import-modal-close').addEventListener('click', closeImportModal);
$('import-modal-cancel').addEventListener('click', closeImportModal);
$('import-modal-overlay').addEventListener('click', e => {
  if (e.target === $('import-modal-overlay')) closeImportModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('import-modal-overlay').classList.contains('hidden')) closeImportModal();
});

$('import-back-btn').addEventListener('click', () => showImportStep('input'));
$('import-done-close').addEventListener('click', () => {
  closeImportModal();
  if (activeTab === 'profits') renderProfitsTab();
});

/** Update the "Import Selected (N)" button count */
function updateImportSelectedCount() {
  const checked = $('import-preview-tbody').querySelectorAll('input[type="checkbox"]:checked').length;
  $('import-selected-count').textContent = checked;
}

/** Select-all checkbox logic */
$('import-select-all').addEventListener('change', function () {
  $('import-preview-tbody')
    .querySelectorAll('input[type="checkbox"]')
    .forEach(cb => { cb.checked = this.checked; });
  updateImportSelectedCount();
});

$('import-wallet-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('import-fetch-btn').click();
});

/** Fetch trades from the blockchain and show the preview step */
$('import-fetch-btn').addEventListener('click', async () => {
  const address = $('import-wallet-input').value.trim();
  setHidden($('import-step1-error'), true);

  if (!address) {
    showImportError('Please enter a wallet address.');
    return;
  }
  if (!/^0x[0-9a-fA-F]{40}$/i.test(address)) {
    showImportError('Invalid address — must start with 0x and be 42 characters.');
    return;
  }

  const btn     = $('import-fetch-btn');
  const btnTxt  = $('import-fetch-btn-text');
  const spinner = $('import-fetch-spinner');
  btn.disabled  = true;
  btnTxt.textContent = 'Fetching…';
  setVisible(spinner, true);

  try {
    _importCandidates = await API.parseWalletTrades(address);
    renderImportPreview(_importCandidates);
    showImportStep('preview');
  } catch (err) {
    showImportError(`Failed to fetch trades: ${err.message}`);
  } finally {
    btn.disabled = false;
    btnTxt.textContent = 'Fetch Trades';
    setHidden(spinner, true);
  }
});

/** Render the preview table from discovered trade candidates */
function renderImportPreview(candidates) {
  const alreadyImported = TradesDB.getImportedTxHashes();
  const tbody           = $('import-preview-tbody');
  tbody.innerHTML       = '';

  const infoEl = $('import-preview-info');
  const warnEl = $('import-duplicate-warning');

  if (candidates.length === 0) {
    infoEl.textContent = 'No trades could be detected for this wallet. Only swaps involving native PLS are supported.';
    setHidden(warnEl, true);
    $('import-confirm-btn').disabled = true;
    updateImportSelectedCount();
    return;
  }

  let dupCount = 0;
  candidates.forEach((trade, idx) => {
    const isDup = alreadyImported.has(trade.txHash);
    if (isDup) dupCount++;

    const tr = document.createElement('tr');
    if (isDup) tr.classList.add('import-row-dup');

    // Checkbox
    const tdCb = document.createElement('td');
    tdCb.className = 'align-center';
    const cb = document.createElement('input');
    cb.type        = 'checkbox';
    cb.dataset.idx = idx;
    cb.checked     = !isDup;   // pre-uncheck duplicates
    cb.addEventListener('change', updateImportSelectedCount);
    tdCb.appendChild(cb);

    // Date
    const tdDate = document.createElement('td');
    tdDate.textContent = new Date(trade.date).toLocaleDateString();

    // Token
    const tdToken = document.createElement('td');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'token-name';
    nameSpan.textContent = trade.tokenName || trade.tokenSymbol;
    const symSpan = document.createElement('span');
    symSpan.className = 'token-symbol';
    symSpan.textContent = ' ' + trade.tokenSymbol;
    tdToken.appendChild(nameSpan);
    tdToken.appendChild(symSpan);

    // Type badge
    const tdType = document.createElement('td');
    const importBadge = document.createElement('span');
    importBadge.className = `trade-badge trade-badge-${trade.type === 'buy' ? 'buy' : 'sell'}`;
    importBadge.textContent = trade.type.toUpperCase();
    tdType.appendChild(importBadge);

    // Token amount
    const tdAmt = document.createElement('td');
    tdAmt.className = 'align-right';
    tdAmt.textContent = fmt.balance(trade.tokenAmount);

    // PLS amount
    const tdPls = document.createElement('td');
    tdPls.className = 'align-right';
    tdPls.textContent = fmt.pls(trade.plsAmount);

    // Status
    const tdStatus = document.createElement('td');
    tdStatus.textContent = isDup ? '⚠ Already imported' : 'New';
    if (isDup) tdStatus.style.color = 'var(--warning)';

    tr.append(tdCb, tdDate, tdToken, tdType, tdAmt, tdPls, tdStatus);
    tbody.appendChild(tr);
  });

  infoEl.textContent = `Found ${candidates.length} trade${candidates.length !== 1 ? 's' : ''}.`;
  if (dupCount > 0) {
    warnEl.textContent = `${dupCount} trade${dupCount !== 1 ? 's' : ''} appear to already be in your trade log and are pre-deselected.`;
    setVisible(warnEl, true);
  } else {
    setHidden(warnEl, true);
  }

  $('import-confirm-btn').disabled = false;
  // Set select-all to checked only if all non-duplicate rows are checked
  const allCbs = [...$('import-preview-tbody').querySelectorAll('input[type="checkbox"]')];
  $('import-select-all').checked = allCbs.length > 0 && allCbs.every(cb => cb.checked);
  updateImportSelectedCount();
}

/** Import the checked trades from the preview into TradesDB */
$('import-confirm-btn').addEventListener('click', () => {
  const checkboxes = $('import-preview-tbody').querySelectorAll('input[type="checkbox"]:checked');
  let count = 0;
  checkboxes.forEach(cb => {
    const trade = _importCandidates[Number(cb.dataset.idx)];
    if (!trade) return;
    TradesDB.addTrade({
      tokenAddress:     trade.tokenAddress,
      tokenSymbol:      trade.tokenSymbol,
      tokenName:        trade.tokenName,
      type:             trade.type,
      date:             trade.date,
      tokenAmount:      trade.tokenAmount,
      plsAmount:        trade.plsAmount,
      usdValue:         trade.usdValue || 0,
      pricePerTokenPls: trade.pricePerTokenPls || 0,
      notes:            trade.notes || '',
      txHash:           trade.txHash || '',
    });
    count++;
  });

  $('import-done-text').textContent =
    count > 0
      ? `${count} trade${count !== 1 ? 's' : ''} imported successfully. USD values are set to 0 — you can edit individual trades to add historical USD values.`
      : 'No trades were imported.';
  showImportStep('done');
});

/* ── CSV export ──────────────────────────────────────────── */

$('export-csv-btn').addEventListener('click', () => {
  const trades = TradesDB.getTrades();
  if (!trades.length) {
    alert('No trades to export.');
    return;
  }

  const headers = ['Date', 'Token Address', 'Symbol', 'Name', 'Type',
                   'Token Amount', 'PLS Amount', 'USD Value', 'PLS/Token', 'Notes'];

  const rows = [...trades]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map(t => [
      t.date, t.tokenAddress, t.tokenSymbol, t.tokenName, t.type,
      t.tokenAmount, t.plsAmount, t.usdValue || '', t.pricePerTokenPls || '', t.notes || '',
    ]);

  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pulsecentral-trades-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
