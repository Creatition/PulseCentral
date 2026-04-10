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

/** Unicode subscript digit characters 0–9, used for compact price notation */
const SUBSCRIPT_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

const fmt = {
  /** Format a USD price with smart decimal places.
   *  For very small prices (< 0.001) uses compact zero notation:
   *  e.g. 0.000001234 → $0.0₄1234  (subscript = zeros after "0.0") */
  price(val) {
    const n = Number(val);
    if (!n || isNaN(n)) return '—';
    if (n >= 1000)  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (n >= 1)     return '$' + n.toFixed(4);
    if (n >= 0.001) return '$' + n.toFixed(6);
    // Compact zero notation for tiny prices
    const exp = Math.floor(Math.log10(n));
    const subscriptN = Math.abs(exp) - 2;
    const mantissa = n.toExponential(3).split('e')[0].replace('.', '').replace(/0+$/, '') || '0';
    const subscript = String(subscriptN).split('').map(d => SUBSCRIPT_DIGITS[+d]).join('');
    return '$0.0' + subscript + mantissa;
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

// Logo click → home
document.querySelector('.logo').addEventListener('click', () => switchTab('home'));

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
  if (name === 'portfolio')                    renderSavedWalletsInPortfolio();
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

  // PLS (native) — always display as PLS / PulseChain
  const displaySymbol = (symbol === 'PLS' || symbol === 'WPLS') ? 'PLS' : symbol;
  const displayName   = (symbol === 'PLS' || symbol === 'WPLS') ? 'PulseChain' : (token.name || symbol);

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
    <div class="coin-name">${escHtml(displayName)}</div>
    <div class="coin-symbol">${escHtml(displaySymbol)}</div>
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

  // Open DexScreener pair page when card is clicked
  if (pair?.pairAddress) {
    card.addEventListener('click', () => {
      window.open(`https://dexscreener.com/pulsechain/${pair.pairAddress}`, '_blank', 'noopener');
    });
  }

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
let cachedPlsLogoUrl = null;       // logo URL for native PLS (from WPLS pair)
let cachedPlsPairAddress = null;   // pair address for native PLS (from WPLS pair)

$('hide-small-balances').addEventListener('change', e => {
  hideSmallBalances = e.target.checked;
  if (cachedPortfolioTokens.length || cachedPlsBalance) {
    renderPortfolioTable(cachedPortfolioTokens, cachedPlsBalance, cachedPlsPrice, cachedPlsLogoUrl, cachedPlsPairAddress);
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
  renderSavedWalletsInPortfolio();
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
      const pairAddress = pair?.pairAddress || null;
      return { ...t, price, change24h, value, logoUrl, pairAddress };
    });

    // Sort by USD value descending
    enriched.sort((a, b) => b.value - a.value);

    // Compute total value (PLS value approximated from WPLS pair if available)
    const wplsPair  = pairMap.get('0xa1077a294dde1b09bb078844df40758a5d0f9a27');
    const plsPrice  = Number(wplsPair?.priceUsd || 0);
    const plsLogoUrl = wplsPair?.info?.imageUrl || null;
    const plsPairAddress = wplsPair?.pairAddress || null;
    const plsValue  = plsBalance * plsPrice;
    const totalUsd  = enriched.reduce((s, t) => s + t.value, 0) + plsValue;

    // Cache for re-render when toggle changes
    cachedPortfolioTokens = enriched;
    cachedPlsBalance      = plsBalance;
    cachedPlsPrice        = plsPrice;
    cachedPlsLogoUrl      = plsLogoUrl;
    cachedPlsPairAddress  = plsPairAddress;

    renderPortfolioSummary(totalUsd, enriched.length + 1, plsBalance, plsPrice);
    renderPortfolioTable(enriched, plsBalance, plsPrice, plsLogoUrl, plsPairAddress);

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

function renderPortfolioTable(tokens, plsBalance, plsPrice, plsLogoUrl, plsPairAddress = null) {
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

  // PLS native row (first) — uses WPLS pair logo and price
  const plsRow = buildPortfolioRow(
    1,
    { symbol: 'PLS', name: 'PulseChain', logoUrl: plsLogoUrl || null },
    plsBalance,
    plsPrice,
    0, // change unavailable for native
    plsPairAddress
  );
  tbody.appendChild(plsRow);

  visibleTokens.forEach((t, i) => {
    tbody.appendChild(buildPortfolioRow(i + 2, t, t.balance, t.price, t.change24h, t.pairAddress));
  });
}

function buildPortfolioRow(index, token, balance, price, change24h, pairAddress = null) {
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

  // Open DexScreener pair page when row is clicked
  if (pairAddress) {
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => {
      window.open(`https://dexscreener.com/pulsechain/${pairAddress}`, '_blank', 'noopener');
    });
  }

  return tr;
}

/* ── Markets tab ────────────────────────────────────────── */

let allMarketPairs  = [];

async function loadMarkets() {
  marketsLoaded = true;
  setHidden($('markets-error'), true);
  setHidden($('markets-grid'), true);
  setVisible($('markets-loading'), true);

  try {
    allMarketPairs = await API.getTopPulsechainPairs();
    renderMarketsGrid();
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

$('market-search').addEventListener('input', () => renderMarketsGrid());

function renderMarketsGrid() {
  const query = $('market-search').value.trim().toLowerCase();
  let pairs = allMarketPairs;

  if (query) {
    pairs = pairs.filter(p => {
      const name = (p.baseToken?.name || '').toLowerCase();
      const sym  = (p.baseToken?.symbol || '').toLowerCase();
      const addr = (p.baseToken?.address || '').toLowerCase();
      return name.includes(query) || sym.includes(query) || addr.includes(query);
    });
  }

  const grid = $('markets-grid');
  grid.innerHTML = '';
  pairs.slice(0, 100).forEach((pair, i) => {
    grid.appendChild(buildMarketCard(i + 1, pair));
  });

  setVisible(grid, true);
}

function buildMarketCard(index, pair) {
  const token    = pair.baseToken || {};
  const logoUrl  = pair.info?.imageUrl || null;
  const price    = pair.priceUsd;
  const change24h = pair.priceChange?.h24;
  const vol24h   = pair.volume?.h24;
  const mcap     = pair.marketCap || pair.fdv;
  const liq      = pair.liquidity?.usd;
  const { text: changeText, cls: changeCls } = fmt.change(change24h);
  const isUp     = Number(change24h || 0) >= 0;
  const tokenAddr = (token.address || '').toLowerCase();
  const isWatched = Watchlist.hasToken(tokenAddr);

  const card = document.createElement('div');
  card.className = `market-card ${isUp ? 'market-card-up' : 'market-card-down'}`;

  // Header: rank + logo + name
  const header = document.createElement('div');
  header.className = 'market-card-header';

  const rankEl = document.createElement('span');
  rankEl.className = 'market-card-rank';
  rankEl.textContent = index;

  const logoEl = buildTokenLogo(logoUrl, token.symbol);

  const nameWrap = document.createElement('div');
  nameWrap.className = 'market-card-name-wrap';
  const nameEl = document.createElement('div');
  nameEl.className = 'market-card-name';
  nameEl.textContent = token.name || token.symbol || '—';
  const symEl = document.createElement('div');
  symEl.className = 'market-card-sym';
  symEl.textContent = token.symbol || '—';
  nameWrap.append(nameEl, symEl);

  const starBtn = document.createElement('button');
  starBtn.className = `star-btn${isWatched ? ' active' : ''}`;
  starBtn.textContent = isWatched ? '★' : '☆';
  starBtn.title = isWatched ? 'Remove from Watchlist' : 'Add to Watchlist';
  starBtn.setAttribute('aria-label', isWatched ? 'Remove from Watchlist' : 'Add to Watchlist');
  starBtn.addEventListener('click', e => {
    e.stopPropagation(); // don't trigger card click
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
        logoUrl: logoUrl,
      });
      starBtn.textContent = '★';
      starBtn.classList.add('active');
      starBtn.title = 'Remove from Watchlist';
    }
  });

  header.append(rankEl, logoEl, nameWrap, starBtn);

  // Price + change
  const priceRow = document.createElement('div');
  priceRow.className = 'market-card-price-row';
  const priceEl = document.createElement('span');
  priceEl.className = 'market-card-price';
  priceEl.textContent = price ? fmt.price(price) : '—';
  const changeEl = document.createElement('span');
  changeEl.className = `market-card-change ${changeCls}`;
  changeEl.textContent = changeText;
  priceRow.append(priceEl, changeEl);

  // Stats
  const stats = document.createElement('div');
  stats.className = 'market-card-stats';
  stats.innerHTML = `
    <div class="market-card-stat">
      <span class="market-card-stat-label">Vol 24h</span>
      <span class="market-card-stat-value">${fmt.large(vol24h)}</span>
    </div>
    <div class="market-card-stat">
      <span class="market-card-stat-label">Mkt Cap</span>
      <span class="market-card-stat-value">${fmt.large(mcap)}</span>
    </div>
    <div class="market-card-stat">
      <span class="market-card-stat-label">Liquidity</span>
      <span class="market-card-stat-value">${fmt.large(liq)}</span>
    </div>
  `;

  card.append(header, priceRow, stats);

  // Open DexScreener pair page when card is clicked
  if (pair.pairAddress) {
    card.addEventListener('click', () => {
      window.open(`https://dexscreener.com/pulsechain/${pair.pairAddress}`, '_blank', 'noopener');
    });
  }

  return card;
}

/* ── Trending tab ───────────────────────────────────────── */

async function loadTrending() {
  trendingLoaded = true;
  setHidden($('trending-error'), true);
  setHidden($('trending-grid'), true);
  setVisible($('trending-loading'), true);

  try {
    const pairs = await API.getTrendingPairs();
    renderTrendingGrid(pairs.slice(0, 100));
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

  pairs.forEach((pair, i) => {
    const token   = pair.baseToken || {};
    const logoUrl = pair.info?.imageUrl || null;
    const { text: changeText, cls: changeCls } = fmt.change(pair.priceChange?.h24);
    const mcap    = pair.marketCap || pair.fdv;

    const card = document.createElement('div');
    card.className = 'trending-card';

    const header = document.createElement('div');
    header.className = 'trending-card-header';

    const logoEl = buildTokenLogo(logoUrl, token.symbol);
    logoEl.style.cssText = 'width:36px;height:36px;border-radius:50%;flex-shrink:0';
    if (logoEl.tagName === 'IMG') {
      logoEl.style.cssText = 'width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0';
    }

    const nameWrap = document.createElement('div');
    const rankName = document.createElement('div');
    rankName.className = 'trending-name';
    rankName.textContent = token.name || token.symbol || '—';
    const symEl = document.createElement('div');
    symEl.className = 'trending-symbol';
    symEl.textContent = token.symbol || '—';
    nameWrap.append(rankName, symEl);

    header.append(logoEl, nameWrap);

    const priceEl = document.createElement('div');
    priceEl.className = 'trending-price';
    priceEl.textContent = fmt.price(pair.priceUsd);

    const meta = document.createElement('div');
    meta.className = 'trending-meta';
    const changeSpan = document.createElement('span');
    changeSpan.className = changeCls;
    changeSpan.textContent = changeText;
    const volSpan = document.createElement('span');
    volSpan.textContent = `Vol ${fmt.large(pair.volume?.h24)}`;
    const mcapSpan = document.createElement('span');
    mcapSpan.textContent = `MCap ${fmt.large(mcap)}`;
    const liqSpan = document.createElement('span');
    liqSpan.textContent = `Liq ${fmt.large(pair.liquidity?.usd)}`;
    meta.append(changeSpan, volSpan, mcapSpan, liqSpan);

    const badge = document.createElement('div');
    badge.className = 'trending-badge';
    badge.textContent = '🔥 Trending';

    card.append(header, priceEl, meta, badge);

    // Open DexScreener pair page when card is clicked
    if (pair.pairAddress) {
      card.addEventListener('click', () => {
        window.open(`https://dexscreener.com/pulsechain/${pair.pairAddress}`, '_blank', 'noopener');
      });
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
      const pairAddress = pair?.pairAddress || null;
      return { ...t, price, change24h, value, logoUrl, pairAddress };
    });

    enriched.sort((a, b) => b.value - a.value);

    const wplsPair = pairMap.get('0xa1077a294dde1b09bb078844df40758a5D0f9a27');
    const plsPrice = Number(wplsPair?.priceUsd || 0);
    const plsLogoUrl = wplsPair?.info?.imageUrl || null;
    const plsPairAddress = wplsPair?.pairAddress || null;
    const plsValue = totalPlsBalance * plsPrice;
    const totalUsd = enriched.reduce((s, t) => s + t.value, 0) + plsValue;

    renderPortfolioSummary(totalUsd, enriched.length + 1, totalPlsBalance, plsPrice);
    renderPortfolioTable(enriched, totalPlsBalance, plsPrice, plsLogoUrl, plsPairAddress);

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
  await loadWatchlistTokenPrices();
}

/* ── Saved wallets in Portfolio tab ────────────────────── */

function renderSavedWalletsInPortfolio() {
  const wallets = Watchlist.getWallets();
  $('portfolio-wl-wallet-count').textContent = wallets.length;
  const list  = $('portfolio-wl-wallets-list');
  const empty = $('portfolio-wl-wallets-empty');
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
      loadPortfolio(addr);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'wl-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove from Saved Wallets';
    removeBtn.addEventListener('click', () => {
      Watchlist.removeWallet(addr);
      renderSavedWalletsInPortfolio();
      updateSaveWalletBtn();
    });

    actions.append(loadBtn, removeBtn);
    li.append(addrSpan, actions);
    list.appendChild(li);
  });
}

// Render saved wallets immediately on page load (portfolio tab is the default after home)
renderSavedWalletsInPortfolio();

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
    const mcap      = pair?.marketCap || pair?.fdv;
    const liq       = pair?.liquidity?.usd;
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

    // Market cap
    const tdMcap = document.createElement('td');
    tdMcap.className = 'align-right';
    tdMcap.textContent = fmt.large(mcap);

    // Liquidity
    const tdLiq = document.createElement('td');
    tdLiq.className = 'align-right';
    tdLiq.textContent = fmt.large(liq);

    // Remove button
    const tdRemove = document.createElement('td');
    tdRemove.className = 'align-center';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'wl-remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove from Watchlist';
    removeBtn.addEventListener('click', e => {
      e.stopPropagation(); // don't trigger row click
      Watchlist.removeToken(token.address);
      loadWatchlistTokenPrices();
      $('wl-token-count').textContent = Watchlist.getTokens().length;
    });
    tdRemove.appendChild(removeBtn);

    tr.append(tdToken, tdSym, tdPrice, tdChange, tdVol, tdMcap, tdLiq, tdRemove);

    // Open DexScreener pair page when row is clicked
    const pairAddress = pair?.pairAddress;
    if (pairAddress) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        window.open(`https://dexscreener.com/pulsechain/${pairAddress}`, '_blank', 'noopener');
      });
    }

    tbody.appendChild(tr);
  });
}

/* ── Watchlist add-by-address ───────────────────────────── */

async function addWatchlistTokenByAddress() {
  const addr = $('wl-add-addr').value.trim();
  const errorEl = $('wl-add-error');
  const btnText = $('wl-add-btn-text');
  const spinner = $('wl-add-spinner');
  const btn     = $('wl-add-btn');

  setHidden(errorEl, true);

  if (!addr) {
    errorEl.textContent = 'Please enter a contract address.';
    setVisible(errorEl, true);
    return;
  }
  if (!isValidAddress(addr)) {
    errorEl.textContent = 'Invalid address format. Must start with 0x and be 42 characters.';
    setVisible(errorEl, true);
    return;
  }
  if (Watchlist.hasToken(addr.toLowerCase())) {
    errorEl.textContent = 'This token is already in your watchlist.';
    setVisible(errorEl, true);
    return;
  }

  btn.disabled = true;
  setHidden(btnText, true);
  setVisible(spinner, true);

  try {
    const pairMap = await API.getPairsByAddresses([addr]);
    const pair    = pairMap.get(addr.toLowerCase());
    if (!pair) {
      errorEl.textContent = 'No token found for this address on PulseChain. Check the address and try again.';
      setVisible(errorEl, true);
      return;
    }
    Watchlist.addToken({
      address: addr.toLowerCase(),
      symbol:  pair.baseToken?.symbol || '',
      name:    pair.baseToken?.name   || pair.baseToken?.symbol || '',
      logoUrl: pair.info?.imageUrl    || null,
    });
    $('wl-add-addr').value = '';
    await loadWatchlistTokenPrices();
  } catch (err) {
    errorEl.textContent = `Error fetching token data: ${err.message}`;
    setVisible(errorEl, true);
  } finally {
    btn.disabled = false;
    setVisible(btnText, true);
    setHidden(spinner, true);
  }
}

$('wl-add-btn').addEventListener('click', addWatchlistTokenByAddress);
$('wl-add-addr').addEventListener('keydown', e => {
  if (e.key === 'Enter') addWatchlistTokenByAddress();
});

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

/** CSS class name for a signed numeric value — kept for backward compatibility */
function plSignClass(val) {
  const n = Number(val);
  if (n > 0) return 'change-positive';
  if (n < 0) return 'change-negative';
  return 'change-neutral';
}
