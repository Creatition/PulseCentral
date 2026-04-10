/**
 * PulseCentral – app.js
 * Tab routing, theme switching, portfolio loading, markets, and trending rendering.
 */

/* ── Theme switcher ──────────────────────────────────────── */

const THEMES = ['pulsechain', 'hex', 'pulsex', 'incentive'];

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

/** Fallback logo URL for WPLS/PLS when DexScreener doesn't return one */
const WPLS_LOGO_FALLBACK = 'https://dd.dexscreener.com/ds-data/tokens/pulsechain/0xa1077a294dde1b09bb078844df40758a5d0f9a27.png';

/**
 * Human-readable labels for known DexScreener social link types.
 * Used on market/trending cards and in the Token Details modal.
 */
const SOCIAL_LABELS = {
  twitter:    '𝕏 Twitter',
  x:          '𝕏 Twitter',
  telegram:   '✈️ Telegram',
  discord:    '💬 Discord',
  github:     '</> GitHub',
  medium:     '📝 Medium',
  reddit:     '🔴 Reddit',
  youtube:    '▶️ YouTube',
  facebook:   '👥 Facebook',
  instagram:  '📷 Instagram',
  linkedin:   '💼 LinkedIn',
  tiktok:     '🎵 TikTok',
  docs:       '📄 Docs',
  whitepaper: '📄 Whitepaper',
};

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

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Logo click → home
const logoEl = document.querySelector('.logo');
if (logoEl) logoEl.addEventListener('click', () => switchTab('home'));

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
  if (name === 'watchlist')                    renderWatchlistTab();
  if (name === 'portfolio') {
    renderSavedWalletsInPortfolio();
    renderPortfolioQuickSelect();
    autoLoadLastPortfolio();
  }
}

/**
 * Automatically load the last saved wallet or group when the portfolio tab is opened,
 * but only once per session (the first time the portfolio tab is visited).
 */
let portfolioAutoLoaded = false;
function autoLoadLastPortfolio() {
  if (portfolioAutoLoaded) return;
  portfolioAutoLoaded = true;

  let last;
  try { last = localStorage.getItem('pc-last-portfolio'); } catch { return; }
  if (!last) return;

  if (last.startsWith('wallet:')) {
    const addr = last.slice('wallet:'.length);
    const name = Watchlist.getWalletName(addr);
    updateQuickSelectLabel(name ? `${name} (${addr.slice(0, 8)}…)` : addr);
    loadPortfolio(addr);
  } else if (last.startsWith('group:')) {
    const id    = last.slice('group:'.length);
    const group = PortfolioGroups.getGroup(id);
    if (group) {
      updateQuickSelectLabel(group.name);
      loadGroupPortfolio(group);
    }
  }
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
    checkCoreCoinAlerts(coinData);
    setHidden($('home-loading'), true);
    setVisible($('home-coins-grid'), true);
    setVisible($('home-footer'), true);

    // Auto-refresh prices every 60 seconds
    homeRefreshTimer = setInterval(async () => {
      try {
        const fresh = await API.getCoreCoinPairs();
        renderHomeCoinCards(fresh);
        updateHomeTimestamp();
        checkCoreCoinAlerts(fresh);
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

/* ── "Add Wallet" toggle button ──────────────────────────── */

const addWalletToggleBtn = $('add-wallet-toggle-btn');
const walletAddCollapse  = $('wallet-add-collapse');

if (addWalletToggleBtn && walletAddCollapse) {
  addWalletToggleBtn.addEventListener('click', () => {
    const isHidden = walletAddCollapse.classList.contains('hidden');
    walletAddCollapse.classList.toggle('hidden', !isHidden);
    addWalletToggleBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    addWalletToggleBtn.textContent = isHidden ? '✕ Close' : '➕ Add Wallet';
    if (isHidden) walletInput.focus();
  });
}

/* ── Portfolio tab ──────────────────────────────────────── */

const loadBtn    = $('load-portfolio-btn');
const loadBtnTxt = $('load-portfolio-btn-text');
const loadSpinner= $('load-portfolio-spinner');
const walletInput= $('wallet-input');
const walletNameInput = $('wallet-name-input');

let hideSmallBalances = true;      // default: hide coins < $0.05
let cachedPortfolioTokens  = [];   // enriched token list from last load
let cachedPlsBalance = 0;
let cachedPlsPrice   = 0;
let cachedPlsLogoUrl = null;       // logo URL for native PLS (from WPLS pair)
let cachedPlsPairAddress = null;   // pair address for native PLS (from WPLS pair)
let currentLoadedAddress = null;   // lowercase address whose portfolio is currently loaded

// Summary card total-value currency state
let summaryTotalUsd = 0;
let summaryTotalPls = 0;
let summaryShowPls  = false;

$('hide-small-balances').addEventListener('change', e => {
  hideSmallBalances = e.target.checked;
  if (cachedPortfolioTokens.length || cachedPlsBalance) {
    renderPortfolioTable(cachedPortfolioTokens, cachedPlsBalance, cachedPlsPrice, cachedPlsLogoUrl, cachedPlsPairAddress);
  }
});

// Summary card: toggle total value between USD and PLS
const summaryCurrencyToggle = $('summary-currency-toggle');
if (summaryCurrencyToggle) {
  summaryCurrencyToggle.addEventListener('click', () => {
    summaryShowPls = !summaryShowPls;
    $('summary-total-usd').textContent   = summaryShowPls ? fmt.pls(summaryTotalPls) + ' PLS' : fmt.usd(summaryTotalUsd);
    $('summary-total-label').textContent = summaryShowPls ? 'Total Value (PLS)' : 'Total Value (USD)';
    summaryCurrencyToggle.textContent    = summaryShowPls ? 'USD' : 'PLS';
  });
}

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
  // Pre-fill name input if wallet is already saved
  if (saved && walletNameInput) {
    const existingName = Watchlist.getWalletName(addr);
    if (!walletNameInput.value) walletNameInput.value = existingName;
  }
}

walletInput.addEventListener('input', updateSaveWalletBtn);

saveWalletBtn.addEventListener('click', () => {
  const addr = walletInput.value.trim();
  const name = walletNameInput ? walletNameInput.value.trim() : '';
  if (!addr) { showPortfolioError('Enter a wallet address first.'); return; }
  if (!isValidAddress(addr)) {
    showPortfolioError('Invalid address format. Must start with 0x and be 42 characters.');
    return;
  }
  if (Watchlist.hasWallet(addr)) {
    Watchlist.removeWallet(addr);
    if (walletNameInput) walletNameInput.value = '';
    // Hide chart if the removed wallet was the one being charted
    if (currentPortfolioHistoryKey === addr.toLowerCase()) {
      hidePortfolioChart();
    }
  } else {
    Watchlist.addWallet(addr, name);
    // Take a snapshot immediately if this wallet's portfolio is already loaded
    if (currentLoadedAddress === addr.toLowerCase() && (cachedPortfolioTokens.length > 0 || cachedPlsBalance > 0)) {
      const totalUsd = cachedPortfolioTokens.reduce((s, t) => s + t.value, 0) + cachedPlsBalance * cachedPlsPrice;
      const totalPls = cachedPlsPrice > 0 ? totalUsd / cachedPlsPrice : 0;
      PortfolioHistory.addSnapshot(addr.toLowerCase(), totalUsd, totalPls);
      renderPortfolioChart(addr.toLowerCase());
    }
  }
  updateSaveWalletBtn();
  renderSavedWalletsInPortfolio();
  renderPortfolioQuickSelect();
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
  hidePortfolioChart();
  hidePortfolioCompositionChart();

  try {
    // Fetch PLS balance and token list in parallel
    const [plsBalance, tokens] = await Promise.all([
      API.getPlsBalance(address),
      API.getTokenList(address),
    ]);

    // Filter tokens with a non-zero balance
    const activeTokens = tokens.filter(t => t.balance > 0);

    // Fetch DEX price data for all token contract addresses
    // Always include WPLS so we can get the PLS/USD price and logo
    const addresses = activeTokens.map(t => t.contractAddress);
    if (!addresses.some(a => a.toLowerCase() === WPLS_ADDRESS.toLowerCase())) {
      addresses.push(WPLS_ADDRESS);
    }
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
    const wplsPair  = pairMap.get(WPLS_ADDRESS.toLowerCase());
    const plsPrice  = Number(wplsPair?.priceUsd || 0);
    const plsLogoUrl = wplsPair?.info?.imageUrl || WPLS_LOGO_FALLBACK;
    const plsPairAddress = wplsPair?.pairAddress || null;
    const plsValue  = plsBalance * plsPrice;
    const totalUsd  = enriched.reduce((s, t) => s + t.value, 0) + plsValue;

    // Cache for re-render when toggle changes
    cachedPortfolioTokens = enriched;
    cachedPlsBalance      = plsBalance;
    cachedPlsPrice        = plsPrice;
    cachedPlsLogoUrl      = plsLogoUrl;
    cachedPlsPairAddress  = plsPairAddress;
    currentLoadedAddress  = address.toLowerCase();

    // Remember this wallet as the last loaded portfolio
    try { localStorage.setItem('pc-last-portfolio', 'wallet:' + address.toLowerCase()); } catch { /* ignore */ }

    renderPortfolioSummary(totalUsd, enriched.length + 1, plsBalance, plsPrice);
    renderPortfolioCompositionChart(enriched, plsBalance, plsPrice);
    renderPortfolioTable(enriched, plsBalance, plsPrice, plsLogoUrl, plsPairAddress);

    setHidden($('portfolio-empty'), true);
    setVisible($('portfolio-summary'), true);
    setVisible($('portfolio-toolbar'), true);
    setVisible($('portfolio-table-wrap'), true);

    // Collapse the "Add Wallet" panel once the portfolio is loaded
    if (walletAddCollapse && !walletAddCollapse.classList.contains('hidden')) {
      walletAddCollapse.classList.add('hidden');
      if (addWalletToggleBtn) {
        addWalletToggleBtn.setAttribute('aria-expanded', 'false');
        addWalletToggleBtn.textContent = '➕ Add Wallet';
      }
    }

    // Snapshot and show chart if wallet is saved
    if (Watchlist.hasWallet(address)) {
      const historyKey = address.toLowerCase();
      const totalPls   = plsPrice > 0 ? totalUsd / plsPrice : 0;
      PortfolioHistory.addSnapshot(historyKey, totalUsd, totalPls);
      renderPortfolioChart(historyKey);
    }
  } catch (err) {
    showPortfolioError(`Error loading portfolio: ${err.message}`);
  } finally {
    setPortfolioLoading(false);
  }
}

function renderPortfolioSummary(totalUsd, tokenCount, plsBalance, plsPrice) {
  // Cache values so the currency toggle can switch without reloading
  summaryTotalUsd = totalUsd;
  summaryTotalPls = plsPrice > 0 ? totalUsd / plsPrice : 0;

  $('summary-total-usd').textContent  = summaryShowPls
    ? fmt.pls(summaryTotalPls) + ' PLS'
    : fmt.usd(summaryTotalUsd);
  $('summary-total-label').textContent = summaryShowPls ? 'Total Value (PLS)' : 'Total Value (USD)';
  const toggle = $('summary-currency-toggle');
  if (toggle) toggle.textContent = summaryShowPls ? 'USD' : 'PLS';

  $('summary-total-pls').textContent  = plsPrice > 0 ? fmt.pls(summaryTotalPls) : '—';

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
  setHidden($('markets-sections'), true);
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

  const container = $('markets-sections');
  container.innerHTML = '';

  if (query) {
    // When searching, show a flat filtered grid
    const grid = document.createElement('div');
    grid.className = 'markets-grid';
    pairs.slice(0, 100).forEach((pair, i) => grid.appendChild(buildMarketCard(i + 1, pair)));
    container.appendChild(grid);
  } else {
    // ── Top Coins ──────────────────────────────────────────
    // pTGC and Peacock are pinned at positions 7 and 8 regardless of volume rank.
    const PINNED_7TH = '0x94534eeee131840b1c0f61847c572228bfdde93'; // pTGC
    const PINNED_8TH = '0xc10a4ed9b4042222d69ff0b374eddd47ed90fc1f'; // Peacock
    const pinnedAddrs = new Set([PINNED_7TH, PINNED_8TH]);
    const ptgcPair    = allMarketPairs.find(p => (p.baseToken?.address || '').toLowerCase() === PINNED_7TH);
    const peacockPair = allMarketPairs.find(p => (p.baseToken?.address || '').toLowerCase() === PINNED_8TH);
    const remaining   = allMarketPairs.filter(p => !pinnedAddrs.has((p.baseToken?.address || '').toLowerCase()));
    const topPairs = [
      ...remaining.slice(0, 6),
      ...(ptgcPair    ? [ptgcPair]    : []),
      ...(peacockPair ? [peacockPair] : []),
      ...remaining.slice(6, 6 + 12 - 6 - (ptgcPair ? 1 : 0) - (peacockPair ? 1 : 0)),
    ].slice(0, 12);
    container.appendChild(buildMarketsSection('🏆 Top Coins', topPairs, true));

    // ── Top Gainers ────────────────────────────────────────
    const gainerPairs = allMarketPairs
      .filter(p => p.priceChange?.h24 != null)
      .slice()
      .sort((a, b) => Number(b.priceChange.h24) - Number(a.priceChange.h24))
      .slice(0, 12);
    container.appendChild(buildMarketsSection('📈 Top Gainers', gainerPairs, false));

    // ── Top Losers ─────────────────────────────────────────
    const loserPairs = allMarketPairs
      .filter(p => p.priceChange?.h24 != null)
      .slice()
      .sort((a, b) => Number(a.priceChange.h24) - Number(b.priceChange.h24))
      .slice(0, 12);
    container.appendChild(buildMarketsSection('📉 Top Losers', loserPairs, false));
  }

  setVisible(container, true);
}

function buildMarketsSection(label, pairs, showRank) {
  const section = document.createElement('div');
  section.className = 'markets-section';

  const heading = document.createElement('h2');
  heading.className = 'markets-section-label';
  heading.textContent = label;
  section.appendChild(heading);

  const grid = document.createElement('div');
  grid.className = 'markets-grid';
  pairs.forEach((pair, i) => grid.appendChild(buildMarketCard(showRank ? i + 1 : i + 1, pair)));
  section.appendChild(grid);

  return section;
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

  // Info button — opens the token details modal
  const infoBtn = document.createElement('button');
  infoBtn.className = 'card-info-btn';
  infoBtn.textContent = 'ℹ';
  infoBtn.title = 'Token details';
  infoBtn.setAttribute('aria-label', 'View token details');
  infoBtn.addEventListener('click', e => {
    e.stopPropagation();
    openTokenDetailsModal(pair);
  });
  header.appendChild(infoBtn);

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

  // Social links row (website, Twitter, Telegram etc.)
  const websites = pair.info?.websites || [];
  const socials  = pair.info?.socials  || [];
  const socialLinks = [...websites.map(w => ({ label: `🌐 ${w.label || 'Web'}`, url: w.url })),
                       ...socials.map(s => ({ label: SOCIAL_LABELS[(s.type || '').toLowerCase()] || `🔗 ${s.type}`, url: s.url }))];
  if (socialLinks.length > 0) {
    const socialsRow = document.createElement('div');
    socialsRow.className = 'market-card-socials';
    socialLinks.slice(0, 4).forEach(({ label, url }) => {
      if (!url) return;
      const a = document.createElement('a');
      a.href      = url;
      a.target    = '_blank';
      a.rel       = 'noopener';
      a.className = 'market-social-link';
      a.textContent = label;
      a.addEventListener('click', e => e.stopPropagation());
      socialsRow.appendChild(a);
    });
    if (socialsRow.children.length > 0) card.appendChild(socialsRow);
  }

  // Open DexScreener pair page when card is clicked
  if (pair.pairAddress) {
    card.addEventListener('click', () => {
      window.open(`https://dexscreener.com/pulsechain/${pair.pairAddress}`, '_blank', 'noopener');
    });
  }

  return card;
}

/* ── Watchlist module ────────────────────────────────────── */

/**
 * All watchlist state lives in localStorage under 'pc-watchlist'.
 * Shape: { wallets: {addr: string, name: string}[], tokens: {address, symbol, name, logoUrl}[] }
 * Legacy shape had wallets as string[] – automatically migrated on load.
 */
const Watchlist = (() => {
  const KEY = 'pc-watchlist';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Migrate legacy wallets format (string[]) to object[]
        let wallets = Array.isArray(parsed.wallets) ? parsed.wallets : [];
        wallets = wallets.map(w => typeof w === 'string' ? { addr: w, name: '' } : w);
        return {
          wallets,
          tokens:  Array.isArray(parsed.tokens)  ? parsed.tokens  : [],
        };
      }
    } catch { /* ignore */ }
    return { wallets: [], tokens: [] };
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }

  function addWallet(addr, name = '') {
    const data = load();
    const norm = addr.toLowerCase();
    if (!data.wallets.find(w => w.addr.toLowerCase() === norm)) {
      data.wallets.push({ addr, name: name || '' });
      save(data);
    }
  }

  function removeWallet(addr) {
    const data = load();
    const norm = addr.toLowerCase();
    data.wallets = data.wallets.filter(w => w.addr.toLowerCase() !== norm);
    save(data);
  }

  function hasWallet(addr) {
    return load().wallets.some(w => w.addr.toLowerCase() === addr.toLowerCase());
  }

  function updateWalletName(addr, name) {
    const data = load();
    const norm = addr.toLowerCase();
    const entry = data.wallets.find(w => w.addr.toLowerCase() === norm);
    if (entry) { entry.name = name || ''; save(data); }
  }

  function getWalletName(addr) {
    const entry = load().wallets.find(w => w.addr.toLowerCase() === addr.toLowerCase());
    return entry ? (entry.name || '') : '';
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

  return { addWallet, removeWallet, hasWallet, updateWalletName, getWalletName, addToken, removeToken, hasToken, getWallets, getTokens };
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

/* ── Portfolio History module ────────────────────────────── */

/**
 * Stores daily portfolio value snapshots in localStorage.
 * Key shape: address (lowercase) for single wallets, 'group:<id>' for groups.
 * Storage shape: { [key]: [{date:'YYYY-MM-DD', usd:number, pls:number}] }
 */
const PortfolioHistory = (() => {
  const KEY           = 'pc-portfolio-history';
  const MAX_SNAPSHOTS = 3650;

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }

  /** Store one snapshot per calendar day; overwrites today's if it already exists. */
  function addSnapshot(key, totalUsd, totalPls) {
    const data  = load();
    // Use local calendar date (not UTC) to avoid day-offset errors near midnight
    const d     = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!data[key]) data[key] = [];
    // Overwrite existing snapshot for today
    data[key] = data[key].filter(s => s.date !== today);
    data[key].push({ date: today, usd: totalUsd, pls: totalPls });
    data[key].sort((a, b) => a.date.localeCompare(b.date));
    if (data[key].length > MAX_SNAPSHOTS) data[key] = data[key].slice(-MAX_SNAPSHOTS);
    save(data);
  }

  function getHistory(key) {
    return (load()[key] || []).slice();
  }

  function clearHistory(key) {
    const data = load();
    delete data[key];
    save(data);
  }

  return { addSnapshot, getHistory, clearHistory };
})();

/* ── Portfolio Composition Pie Chart ─────────────────────── */

// Palette cycles for pie slices (designed to work across all themes)
const PIE_COLORS = [
  '#7b2fff', '#e040fb', '#26c6da', '#ff7043', '#66bb6a',
  '#ffa726', '#29b6f6', '#ef5350', '#ab47bc', '#26a69a',
  '#d4e157', '#ff7043', '#42a5f5', '#ec407a', '#8d6e63',
];

/** Hide the composition pie chart section. */
function hidePortfolioCompositionChart() {
  setHidden($('portfolio-pie-section'), true);
}

/**
 * Render a donut-style pie chart showing % allocation by token.
 * @param {Array}  tokens      Enriched token array (each has .symbol, .value, .logoUrl)
 * @param {number} plsBalance  Native PLS balance
 * @param {number} plsPrice    PLS price in USD
 */
function renderPortfolioCompositionChart(tokens, plsBalance, plsPrice) {
  const section = $('portfolio-pie-section');
  const svgEl   = $('portfolio-pie-svg');
  const legend  = $('portfolio-pie-legend');

  const plsValue = plsBalance * plsPrice;
  const totalUsd = tokens.reduce((s, t) => s + t.value, 0) + plsValue;

  if (totalUsd <= 0) {
    setHidden(section, true);
    return;
  }

  // Build slice data: PLS first, then tokens, collapse tail into "Other"
  const MAX_SLICES = 9;
  const allItems = [
    { symbol: 'PLS', value: plsValue },
    ...tokens.map(t => ({ symbol: t.symbol, value: t.value })),
  ].filter(t => t.value > 0);

  allItems.sort((a, b) => b.value - a.value);

  let slices;
  if (allItems.length <= MAX_SLICES) {
    slices = allItems;
  } else {
    const top   = allItems.slice(0, MAX_SLICES - 1);
    const other = allItems.slice(MAX_SLICES - 1).reduce((s, t) => s + t.value, 0);
    slices = [...top, { symbol: 'Other', value: other }];
  }

  // SVG donut chart (viewBox 220×220, centre 110,110, r=90, inner r=52)
  const CX = 110, CY = 110, R = 90, RI = 52;
  const svgNS = 'http://www.w3.org/2000/svg';
  svgEl.innerHTML = '';

  let startAngle = -Math.PI / 2; // start at 12 o'clock
  const GAP_RAD  = 0.012;        // tiny gap between slices (radians)

  const paths = slices.map((slice, i) => {
    const pct      = slice.value / totalUsd;
    const sweep    = pct * 2 * Math.PI - GAP_RAD;
    const endAngle = startAngle + sweep;
    const color    = PIE_COLORS[i % PIE_COLORS.length];

    // Outer arc end/start points
    const x1 = CX + R * Math.cos(startAngle);
    const y1 = CY + R * Math.sin(startAngle);
    const x2 = CX + R * Math.cos(endAngle);
    const y2 = CY + R * Math.sin(endAngle);
    // Inner arc (reverse)
    const xi1 = CX + RI * Math.cos(endAngle);
    const yi1 = CY + RI * Math.sin(endAngle);
    const xi2 = CX + RI * Math.cos(startAngle);
    const yi2 = CY + RI * Math.sin(startAngle);

    const largeArc = sweep > Math.PI ? 1 : 0;

    const d = [
      `M ${x1} ${y1}`,
      `A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2}`,
      `L ${xi1} ${yi1}`,
      `A ${RI} ${RI} 0 ${largeArc} 0 ${xi2} ${yi2}`,
      'Z',
    ].join(' ');

    const path = document.createElementNS(svgNS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', color);
    path.setAttribute('stroke', 'var(--bg-card)');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('aria-label', `${slice.symbol}: ${(pct * 100).toFixed(1)}%`);
    svgEl.appendChild(path);

    startAngle = endAngle + GAP_RAD;
    return { slice, pct, color };
  });

  // Centre label: show total USD value
  const centreText = document.createElementNS(svgNS, 'text');
  centreText.setAttribute('x', CX);
  centreText.setAttribute('y', CY - 8);
  centreText.setAttribute('text-anchor', 'middle');
  centreText.setAttribute('font-size', '11');
  centreText.setAttribute('fill', 'var(--text-muted)');
  centreText.textContent = 'Total';
  svgEl.appendChild(centreText);

  const centreVal = document.createElementNS(svgNS, 'text');
  centreVal.setAttribute('x', CX);
  centreVal.setAttribute('y', CY + 10);
  centreVal.setAttribute('text-anchor', 'middle');
  centreVal.setAttribute('font-size', '13');
  centreVal.setAttribute('font-weight', 'bold');
  centreVal.setAttribute('fill', 'var(--text)');
  centreVal.textContent = fmt.usd(totalUsd);
  svgEl.appendChild(centreVal);

  // Legend
  legend.innerHTML = '';
  paths.forEach(({ slice, pct, color }) => {
    const li = document.createElement('li');
    li.className = 'portfolio-pie-legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'portfolio-pie-legend-swatch';
    swatch.style.background = color;

    const label = document.createElement('span');
    label.className = 'portfolio-pie-legend-label';
    label.textContent = slice.symbol;

    const pctEl = document.createElement('span');
    pctEl.className = 'portfolio-pie-legend-pct';
    pctEl.textContent = (pct * 100).toFixed(1) + '%';

    const valEl = document.createElement('span');
    valEl.className = 'portfolio-pie-legend-value';
    valEl.textContent = fmt.usd(slice.value);

    li.append(swatch, label, pctEl, valEl);
    legend.appendChild(li);
  });

  setVisible(section, true);
}

/* ── Portfolio History chart state ───────────────────────── */

let currentPortfolioHistoryKey = null;
let chartCurrency  = 'usd';
let chartTimeframe = 'daily';

// SVG coordinate system constants
const CHART_W   = 720;
const CHART_H   = 280;
const CHART_PAD = { top: 24, right: 24, bottom: 48, left: 80 };
const CHART_CW  = CHART_W - CHART_PAD.left - CHART_PAD.right;
const CHART_CH  = CHART_H - CHART_PAD.top  - CHART_PAD.bottom;

// Counter used to create unique gradient IDs across chart redraws
let chartGradCounter = 0;

// Wire chart toggle buttons
document.querySelectorAll('[data-chart-currency]').forEach(btn => {
  btn.addEventListener('click', () => {
    chartCurrency = btn.dataset.chartCurrency;
    document.querySelectorAll('[data-chart-currency]').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    if (currentPortfolioHistoryKey) renderPortfolioChart(currentPortfolioHistoryKey);
  });
});

document.querySelectorAll('[data-chart-timeframe]').forEach(btn => {
  btn.addEventListener('click', () => {
    chartTimeframe = btn.dataset.chartTimeframe;
    document.querySelectorAll('[data-chart-timeframe]').forEach(b => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
    });
    if (currentPortfolioHistoryKey) renderPortfolioChart(currentPortfolioHistoryKey);
  });
});

/** Aggregate history snapshots for a given time frame. */
function aggregateByTimeframe(history, timeframe) {
  if (timeframe === 'daily') {
    return history.slice(-30);
  }
  if (timeframe === 'weekly') {
    const byWeek = new Map();
    for (const snap of history) {
      const weekKey = getISOWeekStart(snap.date);
      byWeek.set(weekKey, snap); // keep the latest snapshot for each week
    }
    return [...byWeek.values()].slice(-13);
  }
  if (timeframe === 'monthly') {
    const byMonth = new Map();
    for (const snap of history) {
      const monthKey = snap.date.slice(0, 7); // YYYY-MM
      byMonth.set(monthKey, snap);
    }
    return [...byMonth.values()].slice(-13);
  }
  return history;
}

/** Return the YYYY-MM-DD of the Monday that starts the ISO week containing dateStr. */
function getISOWeekStart(dateStr) {
  const d   = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Format a date string for the X-axis label. */
function formatChartDateLabel(dateStr, timeframe) {
  const d = new Date(dateStr + 'T12:00:00Z');
  if (timeframe === 'monthly') {
    return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Format a Y-axis value label (compact, no tiny decimal noise). */
function formatChartYLabel(value, currency) {
  if (currency === 'pls') {
    const n = Number(value);
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K';
    return n.toFixed(0);
  }
  const n = Number(value);
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(2);
}

/** Show or hide the portfolio chart section with a given history key. */
function renderPortfolioChart(historyKey) {
  currentPortfolioHistoryKey = historyKey;
  const section = $('portfolio-chart-section');
  const notice  = $('portfolio-chart-notice');
  const outer   = $('portfolio-chart-outer');
  const history = PortfolioHistory.getHistory(historyKey);

  setVisible(section, true);

  if (history.length === 0) {
    notice.textContent = 'No history yet. Your portfolio value will be tracked each time you load this wallet.';
    setVisible(notice, true);
    setHidden(outer, true);
    return;
  }

  if (history.length === 1) {
    const snap = history[0];
    const val  = chartCurrency === 'usd' ? fmt.usd(snap.usd) : fmt.pls(snap.pls);
    notice.textContent =
      `First snapshot saved on ${formatChartDateLabel(snap.date, 'daily')}: ${val}. ` +
      'Load your portfolio on another day to start seeing the chart.';
    setVisible(notice, true);
    setHidden(outer, true);
    return;
  }

  const points = aggregateByTimeframe(history, chartTimeframe);

  if (points.length < 2) {
    notice.textContent = 'Not enough data for this time frame yet. Try the Daily view.';
    setVisible(notice, true);
    setHidden(outer, true);
    return;
  }

  setHidden(notice, true);
  setVisible(outer, true);
  drawHistoryChart(points);
}

/** Hide the chart section and clear the current history key. */
function hidePortfolioChart() {
  setHidden($('portfolio-chart-section'), true);
  currentPortfolioHistoryKey = null;
}

/** Draw (or redraw) the SVG line chart for the given data points. */
function drawHistoryChart(points) {
  const svgEl  = $('portfolio-history-svg');
  const svgNS  = 'http://www.w3.org/2000/svg';
  svgEl.innerHTML = ''; // clear previous render

  const values   = points.map(p => chartCurrency === 'usd' ? p.usd : p.pls);
  const minV     = Math.min(...values);
  const maxV     = Math.max(...values);
  const rawRange = maxV - minV;
  const padding  = rawRange > 0 ? rawRange * 0.12 : (maxV > 0 ? maxV * 0.15 : 1);
  const yMin     = Math.max(0, minV - padding);
  const yMax     = maxV + padding;
  const yRange   = yMax - yMin || 1;

  const toX = i => CHART_PAD.left + (points.length > 1 ? (i / (points.length - 1)) * CHART_CW : CHART_CW / 2);
  const toY = v => CHART_PAD.top  + (1 - (v - yMin) / yRange) * CHART_CH;

  // ── Gradient definition ────────────────────────────────────
  const defs   = document.createElementNS(svgNS, 'defs');
  const gradId = 'phg' + (++chartGradCounter);
  const grad   = document.createElementNS(svgNS, 'linearGradient');
  grad.id = gradId;
  grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
  const stop1 = document.createElementNS(svgNS, 'stop');
  stop1.setAttribute('offset', '0%');
  stop1.setAttribute('stop-color', 'var(--primary)');
  stop1.setAttribute('stop-opacity', '0.30');
  const stop2 = document.createElementNS(svgNS, 'stop');
  stop2.setAttribute('offset', '100%');
  stop2.setAttribute('stop-color', 'var(--primary)');
  stop2.setAttribute('stop-opacity', '0');
  grad.append(stop1, stop2);
  defs.appendChild(grad);
  svgEl.appendChild(defs);

  // ── Y-axis grid lines + labels (5 ticks) ───────────────────
  const Y_TICKS = 5;
  for (let i = 0; i <= Y_TICKS; i++) {
    const v   = yMin + (i / Y_TICKS) * yRange;
    const y   = toY(v);

    const gridLine = document.createElementNS(svgNS, 'line');
    gridLine.setAttribute('x1', CHART_PAD.left);
    gridLine.setAttribute('x2', CHART_W - CHART_PAD.right);
    gridLine.setAttribute('y1', y); gridLine.setAttribute('y2', y);
    gridLine.setAttribute('stroke', 'var(--border-light)');
    gridLine.setAttribute('stroke-width', '0.5');
    gridLine.setAttribute('stroke-dasharray', '3 3');
    svgEl.appendChild(gridLine);

    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', CHART_PAD.left - 6);
    label.setAttribute('y', y + 4);
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('fill', 'var(--text-muted)');
    label.setAttribute('font-size', '11');
    label.textContent = formatChartYLabel(v, chartCurrency);
    svgEl.appendChild(label);
  }

  // ── X-axis labels ──────────────────────────────────────────
  const maxLabels = 7;
  const xStep     = Math.max(1, Math.ceil(points.length / maxLabels));
  const labelIdxs = [];
  for (let i = 0; i < points.length; i += xStep) labelIdxs.push(i);
  if (!labelIdxs.includes(points.length - 1)) labelIdxs.push(points.length - 1);

  labelIdxs.forEach(i => {
    const label = document.createElementNS(svgNS, 'text');
    label.setAttribute('x', toX(i).toFixed(1));
    label.setAttribute('y', CHART_PAD.top + CHART_CH + 20);
    label.setAttribute('text-anchor', 'middle');
    label.setAttribute('fill', 'var(--text-muted)');
    label.setAttribute('font-size', '11');
    label.textContent = formatChartDateLabel(points[i].date, chartTimeframe);
    svgEl.appendChild(label);
  });

  // ── Area fill and line path ────────────────────────────────
  const pts = points.map((p, i) => [
    toX(i),
    toY(chartCurrency === 'usd' ? p.usd : p.pls),
  ]);
  const linePath = pts.map(([x, y], i) =>
    `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  ).join(' ');
  const bottomY  = CHART_PAD.top + CHART_CH;
  const areaPath = `${linePath} L${pts[pts.length - 1][0].toFixed(1)},${bottomY} L${pts[0][0].toFixed(1)},${bottomY} Z`;

  const areaEl = document.createElementNS(svgNS, 'path');
  areaEl.setAttribute('d', areaPath);
  areaEl.setAttribute('fill', `url(#${gradId})`);
  svgEl.appendChild(areaEl);

  const lineEl = document.createElementNS(svgNS, 'path');
  lineEl.setAttribute('d', linePath);
  lineEl.setAttribute('fill', 'none');
  lineEl.setAttribute('stroke', 'var(--primary)');
  lineEl.setAttribute('stroke-width', '2.5');
  lineEl.setAttribute('stroke-linecap', 'round');
  lineEl.setAttribute('stroke-linejoin', 'round');
  svgEl.appendChild(lineEl);

  // ── Hover crosshair line ───────────────────────────────────
  const hoverLine = document.createElementNS(svgNS, 'line');
  hoverLine.id = 'chart-hover-line';
  hoverLine.setAttribute('y1', CHART_PAD.top);
  hoverLine.setAttribute('y2', CHART_PAD.top + CHART_CH);
  hoverLine.setAttribute('stroke', 'var(--text-muted)');
  hoverLine.setAttribute('stroke-width', '1');
  hoverLine.setAttribute('stroke-dasharray', '4 2');
  hoverLine.setAttribute('opacity', '0');
  svgEl.appendChild(hoverLine);

  // ── Data-point dots (hidden by default, revealed on hover) ─
  const dotsGroup = document.createElementNS(svgNS, 'g');
  dotsGroup.id = 'chart-dots';
  pts.forEach(([x, y]) => {
    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', x.toFixed(1));
    circle.setAttribute('cy', y.toFixed(1));
    circle.setAttribute('r', '4');
    circle.setAttribute('fill', 'var(--primary)');
    circle.setAttribute('stroke', 'var(--bg-card)');
    circle.setAttribute('stroke-width', '2');
    circle.setAttribute('opacity', '0');
    dotsGroup.appendChild(circle);
  });
  svgEl.appendChild(dotsGroup);

  setupChartInteractivity(pts, points);
}

/** Attach mousemove / mouseleave handlers to the chart overlay for hover effects. */
function setupChartInteractivity(pts, points) {
  const overlay   = $('chart-hover-overlay');
  const tooltip   = $('chart-tooltip');
  const svgEl     = $('portfolio-history-svg');
  const hoverLine = $('chart-hover-line');
  const dotsGroup = $('chart-dots');
  const dots      = Array.from(dotsGroup.children);

  let activeIdx = -1;

  overlay.onmousemove = e => {
    const rect   = svgEl.getBoundingClientRect();
    if (!rect.width) return;
    // Scale mouse X position into SVG coordinate space
    const scaleX = CHART_W / rect.width;
    const mx     = (e.clientX - rect.left) * scaleX;

    // Find the nearest data point by X coordinate
    let nearestIdx  = 0;
    let nearestDist = Infinity;
    pts.forEach(([x], i) => {
      const d = Math.abs(x - mx);
      if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    });

    if (nearestIdx === activeIdx) return;
    activeIdx = nearestIdx;

    const [dotX, dotY] = pts[nearestIdx];
    const snap = points[nearestIdx];

    // Move crosshair
    hoverLine.setAttribute('x1', dotX.toFixed(1));
    hoverLine.setAttribute('x2', dotX.toFixed(1));
    hoverLine.setAttribute('opacity', '1');

    // Reveal active dot
    dots.forEach((dot, i) => {
      dot.setAttribute('opacity', i === nearestIdx ? '1' : '0');
    });

    // Build tooltip using DOM methods to avoid XSS risk
    const dateStr = formatChartDateLabel(snap.date, chartTimeframe);
    const valStr  = chartCurrency === 'usd' ? fmt.usd(snap.usd) : fmt.pls(snap.pls);
    tooltip.textContent = '';
    const dateSpan = document.createElement('span');
    dateSpan.className = 'chart-tooltip-date';
    dateSpan.textContent = dateStr;
    const valSpan = document.createElement('span');
    valSpan.className = 'chart-tooltip-val';
    valSpan.textContent = valStr;
    tooltip.append(dateSpan, valSpan);

    // Position tooltip – flip to left side when near the right edge
    const xPct = (dotX / CHART_W) * 100;
    const yPct = (dotY / CHART_H) * 100;
    tooltip.style.left      = xPct + '%';
    tooltip.style.top       = yPct + '%';
    tooltip.style.transform = nearestIdx > pts.length / 2
      ? 'translate(calc(-100% - 10px), -50%)'
      : 'translate(10px, -50%)';
    setVisible(tooltip, true);
  };

  overlay.onmouseleave = () => {
    activeIdx = -1;
    hoverLine.setAttribute('opacity', '0');
    dots.forEach(dot => dot.setAttribute('opacity', '0'));
    setHidden(tooltip, true);
  };
}

/* ── Portfolio Groups UI ─────────────────────────────────── */

// In-modal address list being edited
let groupModalAddresses = []; // [{addr, label}]

function renderGroupsList() {
  // The inline group cards have been replaced by the manage-saved modal.
  // Refresh the modal if it is currently open.
  if (!$('manage-saved-overlay').classList.contains('hidden')) {
    renderManageSavedModal();
  }
}

/* ── Manage Saved Addresses & Groups modal ─────────────── */

function openManageSavedModal() {
  renderManageSavedModal();
  setVisible($('manage-saved-overlay'), true);
}

function closeManageSavedModal() {
  setHidden($('manage-saved-overlay'), true);
}

function renderManageSavedModal() {
  const wallets = Watchlist.getWallets();
  const groups  = PortfolioGroups.getGroups();

  /* ── Saved Addresses ── */
  const walletsList  = $('manage-saved-wallets-list');
  const walletsEmpty = $('manage-saved-wallets-empty');
  walletsList.innerHTML = '';

  if (wallets.length === 0) {
    setVisible(walletsEmpty, true);
  } else {
    setHidden(walletsEmpty, true);
    wallets.forEach(({ addr, name }) => {
      const row = document.createElement('div');
      row.className = 'manage-saved-row';

      const icon = document.createElement('span');
      icon.className = 'manage-saved-icon';
      icon.textContent = '💼';

      const info = document.createElement('div');
      info.className = 'manage-saved-info';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'form-input manage-saved-name-input';
      nameInput.value = name || '';
      nameInput.placeholder = 'Wallet name (optional)';
      nameInput.maxLength = 60;
      nameInput.title = 'Rename wallet';
      nameInput.setAttribute('aria-label', `Name for wallet ${addr}`);

      const addrEl = document.createElement('div');
      addrEl.className = 'manage-saved-addr';
      addrEl.textContent = addr;
      addrEl.title = addr;

      info.append(nameInput, addrEl);

      const saveNameBtn = document.createElement('button');
      saveNameBtn.className = 'btn btn-secondary btn-sm manage-saved-rename-btn';
      saveNameBtn.textContent = '💾';
      saveNameBtn.title = 'Save name';
      saveNameBtn.type = 'button';
      saveNameBtn.addEventListener('click', () => {
        Watchlist.updateWalletName(addr, nameInput.value.trim());
        renderPortfolioQuickSelect();
      });

      nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); saveNameBtn.click(); }
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'wl-remove-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove saved address';
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', () => {
        if (!confirm(`Remove saved address "${name || addr}"?`)) return;
        Watchlist.removeWallet(addr);
        renderManageSavedModal();
        renderPortfolioQuickSelect();
        updateSaveWalletBtn();
      });

      row.append(icon, info, saveNameBtn, removeBtn);
      walletsList.appendChild(row);
    });
  }

  /* ── Groups ── */
  const groupsList  = $('manage-saved-groups-list');
  const groupsEmpty = $('manage-saved-groups-empty');
  groupsList.innerHTML = '';

  if (groups.length === 0) {
    setVisible(groupsEmpty, true);
  } else {
    setHidden(groupsEmpty, true);
    groups.forEach(group => {
      const row = document.createElement('div');
      row.className = 'manage-saved-row';

      const icon = document.createElement('span');
      icon.className = 'manage-saved-icon';
      icon.textContent = '🗂';

      const info = document.createElement('div');
      info.className = 'manage-saved-info';

      const nameEl = document.createElement('div');
      nameEl.className = 'manage-saved-group-name';
      nameEl.textContent = group.name;

      const meta = document.createElement('div');
      meta.className = 'manage-saved-addr';
      const labels = group.addresses.map(a => a.label || a.addr.slice(0, 8) + '…').join(', ');
      meta.textContent = `${group.addresses.length} address${group.addresses.length !== 1 ? 'es' : ''}: ${labels}`;
      meta.title = group.addresses.map(a => a.label ? `${a.label}: ${a.addr}` : a.addr).join('\n');

      info.append(nameEl, meta);

      const editBtn = document.createElement('button');
      editBtn.className = 'btn btn-secondary btn-sm';
      editBtn.textContent = '✎ Edit';
      editBtn.title = 'Edit group';
      editBtn.type = 'button';
      editBtn.addEventListener('click', () => {
        closeManageSavedModal();
        openGroupModal(group, true);
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'wl-remove-btn';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Delete group';
      removeBtn.type = 'button';
      removeBtn.addEventListener('click', () => {
        if (!confirm(`Delete group "${group.name}"?`)) return;
        PortfolioGroups.removeGroup(group.id);
        renderManageSavedModal();
        renderPortfolioQuickSelect();
      });

      row.append(icon, info, editBtn, removeBtn);
      groupsList.appendChild(row);
    });
  }
}

$('edit-saved-btn').addEventListener('click', openManageSavedModal);
$('manage-saved-close').addEventListener('click', closeManageSavedModal);
$('manage-saved-overlay').addEventListener('click', e => {
  if (e.target === $('manage-saved-overlay')) closeManageSavedModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('manage-saved-overlay').classList.contains('hidden')) closeManageSavedModal();
});

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
  hidePortfolioChart();
  hidePortfolioCompositionChart();
  currentLoadedAddress = null;

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
    // Always include WPLS so we can get the PLS/USD price and logo
    const addresses = activeTokens.map(t => t.contractAddress);
    if (!addresses.some(a => a.toLowerCase() === WPLS_ADDRESS.toLowerCase())) {
      addresses.push(WPLS_ADDRESS);
    }
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

    const wplsPair = pairMap.get(WPLS_ADDRESS.toLowerCase());
    const plsPrice = Number(wplsPair?.priceUsd || 0);
    const plsLogoUrl = wplsPair?.info?.imageUrl || WPLS_LOGO_FALLBACK;
    const plsPairAddress = wplsPair?.pairAddress || null;
    const plsValue = totalPlsBalance * plsPrice;
    const totalUsd = enriched.reduce((s, t) => s + t.value, 0) + plsValue;

    renderPortfolioSummary(totalUsd, enriched.length + 1, totalPlsBalance, plsPrice);
    renderPortfolioCompositionChart(enriched, totalPlsBalance, plsPrice);
    renderPortfolioTable(enriched, totalPlsBalance, plsPrice, plsLogoUrl, plsPairAddress);

    setHidden($('portfolio-empty'), true);
    setVisible($('portfolio-summary'), true);
    setVisible($('portfolio-table-wrap'), true);

    // Snapshot history and show chart for this group
    const historyKey = 'group:' + group.id;
    const totalPls   = plsPrice > 0 ? totalUsd / plsPrice : 0;
    PortfolioHistory.addSnapshot(historyKey, totalUsd, totalPls);
    renderPortfolioChart(historyKey);

    // Remember this group as the last loaded portfolio
    try { localStorage.setItem('pc-last-portfolio', 'group:' + group.id); } catch { /* ignore */ }

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

    // Collapse the "Add Wallet" panel if open
    if (walletAddCollapse && !walletAddCollapse.classList.contains('hidden')) {
      walletAddCollapse.classList.add('hidden');
      if (addWalletToggleBtn) {
        addWalletToggleBtn.setAttribute('aria-expanded', 'false');
        addWalletToggleBtn.textContent = '➕ Add Wallet';
      }
    }
  } catch (err) {
    showPortfolioError(`Error loading group portfolio: ${err.message}`);
  } finally {
    setPortfolioLoading(false);
  }
}

/* ── Group modal ─────────────────────────────────────────── */

let groupModalFromManageSaved = false;

function openGroupModal(group = null, fromManageSaved = false) {
  groupModalFromManageSaved = fromManageSaved;
  groupModalAddresses = group ? group.addresses.map(a => ({ ...a })) : [];
  $('group-id').value = group ? group.id : '';
  $('group-name-input').value = group ? group.name : '';
  $('group-modal-title').textContent = group ? 'Edit Portfolio Group' : 'New Portfolio Group';
  $('group-addr-input').value = '';
  $('group-addr-label-input').value = '';
  hideGroupModalError();
  populateGroupSavedWalletSelect();
  renderGroupAddrList();
  setVisible($('group-modal-overlay'), true);
  $('group-name-input').focus();
}

/** Populate the saved-wallets dropdown inside the group modal. */
function populateGroupSavedWalletSelect() {
  const sel = $('group-saved-wallet-select');
  if (!sel) return;
  const wallets = Watchlist.getWallets();
  sel.innerHTML = '<option value="">— Pick from saved wallets —</option>';
  wallets.forEach(({ addr, name }) => {
    const opt = document.createElement('option');
    opt.value = addr;
    opt.textContent = name ? `${name} (${addr.slice(0, 8)}…)` : addr;
    sel.appendChild(opt);
  });
  const row = $('group-saved-wallets-row');
  if (row) setVisible(row, wallets.length > 0);
}

function closeGroupModal() {
  setHidden($('group-modal-overlay'), true);
  if (groupModalFromManageSaved) {
    groupModalFromManageSaved = false;
    openManageSavedModal();
  }
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
$('group-add-saved-btn').addEventListener('click', () => {
  const sel = $('group-saved-wallet-select');
  if (!sel || !sel.value) { showGroupModalError('Please select a saved wallet first.'); return; }
  const addr = sel.value;
  const norm = addr.toLowerCase();
  if (groupModalAddresses.some(a => a.addr.toLowerCase() === norm)) {
    showGroupModalError('This address is already in the group.');
    return;
  }
  const walletName = Watchlist.getWalletName(addr);
  hideGroupModalError();
  groupModalAddresses.push({ addr, label: walletName || '' });
  sel.value = '';
  renderGroupAddrList();
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
  renderPortfolioQuickSelect();
});

// Render groups on page load
renderGroupsList();

/* ── Portfolio Quick Select dropdown ─────────────────────── */

/** Label shown in the placeholder option of the quick-select dropdown. */
const QUICK_SELECT_DEFAULT = '— Select saved wallet or group —';
let quickSelectLabel = QUICK_SELECT_DEFAULT;

/**
 * Update the placeholder option text in the quick-select dropdown to show
 * the currently selected wallet/group, then reset the selection to that
 * placeholder so it appears at the top of the list.
 * @param {string} [text]  Display label; omit or pass falsy to restore default.
 */
function updateQuickSelectLabel(text) {
  quickSelectLabel = text || QUICK_SELECT_DEFAULT;
  const sel = $('portfolio-quick-select');
  if (!sel) return;
  const placeholder = sel.querySelector('option[value=""]');
  if (placeholder) placeholder.textContent = quickSelectLabel;
  sel.value = '';
}

/**
 * Populate the quick-select dropdown with saved wallets and groups.
 * Selecting a wallet fills the address input; selecting a group loads it directly.
 */
function renderPortfolioQuickSelect() {
  const sel = $('portfolio-quick-select');
  if (!sel) return;

  const wallets = Watchlist.getWallets();
  const groups  = PortfolioGroups.getGroups();

  sel.innerHTML = `<option value="">${quickSelectLabel}</option>`;

  if (wallets.length > 0) {
    const og = document.createElement('optgroup');
    og.label = '💼 Saved Wallets';
    wallets.forEach(({ addr, name }) => {
      const opt = document.createElement('option');
      opt.value = 'wallet:' + addr;
      opt.textContent = name ? `${name} (${addr.slice(0, 8)}…)` : addr;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  }

  if (groups.length > 0) {
    const og = document.createElement('optgroup');
    og.label = '🗂 Groups';
    groups.forEach(group => {
      const opt = document.createElement('option');
      opt.value = 'group:' + group.id;
      opt.textContent = `${group.name} (${group.addresses.length} wallet${group.addresses.length !== 1 ? 's' : ''})`;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  }

  setVisible($('portfolio-selector-bar'), wallets.length > 0 || groups.length > 0);
}

$('portfolio-quick-select').addEventListener('change', e => {
  const val = e.target.value;
  if (!val) return;

  if (val.startsWith('wallet:')) {
    const addr = val.slice('wallet:'.length);
    const name = Watchlist.getWalletName(addr);
    walletInput.value = addr;
    if (walletNameInput) walletNameInput.value = name || '';
    updateSaveWalletBtn();
    updateQuickSelectLabel(name ? `${name} (${addr.slice(0, 8)}…)` : addr);
    loadPortfolio(addr);
  } else if (val.startsWith('group:')) {
    const id    = val.slice('group:'.length);
    const group = PortfolioGroups.getGroup(id);
    if (group) {
      updateQuickSelectLabel(group.name);
      loadGroupPortfolio(group);
    }
  }
});



$('wl-refresh-btn').addEventListener('click', () => loadWatchlistTokenPrices());

async function renderWatchlistTab() {
  await loadWatchlistTokenPrices();
}

/* ── Saved wallets in Portfolio tab ────────────────────── */

function renderSavedWalletsInPortfolio() {
  // The saved-wallets section has been replaced by the quick-select dropdown;
  // this function is kept for compatibility with call sites that also call
  // renderPortfolioQuickSelect() — nothing to render here any more.
}

// Render saved wallets immediately on page load (portfolio tab is the default after home)
renderSavedWalletsInPortfolio();
renderPortfolioQuickSelect();

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

/* ── Price Alerts module ──────────────────────────────────── */

/**
 * Tracks tokens that surged ≥10% in 5 minutes.
 * Alerts are kept in memory (not persisted) and capped at MAX_ALERTS.
 * Each token has a per-symbol cooldown to prevent duplicate firing.
 */
const PriceAlerts = (() => {
  const MAX_ALERTS  = 50;
  const COOLDOWN_MS = 10 * 60 * 1000; // 10-min cooldown per symbol
  const THRESHOLD   = 10;              // minimum m5 % gain

  let alerts    = []; // [{ symbol, name, change, time }] newest first
  let unread    = 0;
  const lastFired = new Map(); // symbol → timestamp

  /** Check one token; fires an alert when m5Change ≥ THRESHOLD and cooldown passed. */
  function check(symbol, name, m5Change) {
    if (m5Change < THRESHOLD) return;
    const now  = Date.now();
    const last = lastFired.get(symbol);
    if (last && now - last < COOLDOWN_MS) return;
    lastFired.set(symbol, now);
    alerts.unshift({ symbol, name, change: m5Change, time: now });
    if (alerts.length > MAX_ALERTS) alerts = alerts.slice(0, MAX_ALERTS);
    unread++;
    renderBellBadge();
  }

  function getAlerts() { return alerts; }
  function getUnread()  { return unread;  }
  function markRead()   { unread = 0; renderBellBadge(); }
  function clear()      { alerts = []; unread = 0; renderBellBadge(); }

  return { check, getAlerts, getUnread, markRead, clear };
})();

/* ── Bell button & dropdown ──────────────────────────────── */

const bellBtn        = $('price-alerts-btn');
const bellBadgeEl    = $('bell-badge');
const alertsDropdown = $('alerts-dropdown');

function renderBellBadge() {
  const count = PriceAlerts.getUnread();
  if (count > 0) {
    bellBadgeEl.textContent = count > 99 ? '99+' : count;
    setVisible(bellBadgeEl, true);
  } else {
    setHidden(bellBadgeEl, true);
  }
}

function renderAlertsDropdown() {
  const list   = $('alerts-list');
  const alerts = PriceAlerts.getAlerts();
  list.innerHTML = '';

  if (alerts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'alerts-empty';
    empty.textContent = 'No alerts yet. Tokens up +10% in 5 min will appear here.';
    list.appendChild(empty);
    return;
  }

  alerts.forEach(({ symbol, name, change, time }) => {
    const item = document.createElement('div');
    item.className = 'alert-item';
    item.setAttribute('role', 'menuitem');

    const icon = document.createElement('span');
    icon.className = 'alert-item-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '🚀';

    const info = document.createElement('div');
    info.className = 'alert-item-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'alert-item-name';
    nameEl.textContent = name && name !== symbol ? `${name} (${symbol})` : symbol;

    const changeEl = document.createElement('div');
    changeEl.className = 'alert-item-change';
    changeEl.textContent = `+${change.toFixed(2)}% in 5 min`;

    info.append(nameEl, changeEl);

    const timeEl = document.createElement('span');
    timeEl.className = 'alert-item-time';
    timeEl.textContent = new Date(time).toLocaleTimeString();

    item.append(icon, info, timeEl);
    list.appendChild(item);
  });
}

bellBtn.addEventListener('click', e => {
  e.stopPropagation();
  const isOpen = !alertsDropdown.classList.contains('hidden');
  if (isOpen) {
    setHidden(alertsDropdown, true);
    bellBtn.setAttribute('aria-expanded', 'false');
  } else {
    renderAlertsDropdown();
    PriceAlerts.markRead();
    setVisible(alertsDropdown, true);
    bellBtn.setAttribute('aria-expanded', 'true');
  }
});

$('alerts-clear-btn').addEventListener('click', e => {
  e.stopPropagation();
  PriceAlerts.clear();
  renderAlertsDropdown();
});

// Close the dropdown when clicking outside it
document.addEventListener('click', e => {
  if (!$('price-alerts-wrap').contains(e.target)) {
    setHidden(alertsDropdown, true);
    bellBtn.setAttribute('aria-expanded', 'false');
  }
});

// Close with Escape (add to existing keydown listener)
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !alertsDropdown.classList.contains('hidden')) {
    setHidden(alertsDropdown, true);
    bellBtn.setAttribute('aria-expanded', 'false');
  }
});

/* ── Alert check helpers ─────────────────────────────────── */

/** Check all core-coin pairs for a 5-minute price surge ≥ 10%. */
function checkCoreCoinAlerts(coinData) {
  coinData.forEach(({ symbol, pair }) => {
    if (!pair) return;
    const m5   = Number(pair.priceChange?.m5 || 0);
    const name = pair.baseToken?.name || symbol;
    // Normalise WPLS display name to PLS
    const displaySymbol = (symbol === 'WPLS') ? 'PLS' : symbol;
    const displayName   = (symbol === 'WPLS' || symbol === 'PLS') ? 'PulseChain' : name;
    PriceAlerts.check(displaySymbol, displayName, m5);
  });
}

/** Fetch watchlist token prices and check for surges. */
async function checkWatchlistAlerts() {
  const tokens = Watchlist.getTokens();
  if (!tokens.length) return;
  try {
    const addresses = tokens.map(t => t.address);
    const pairMap   = await API.getPairsByAddresses(addresses);
    tokens.forEach(token => {
      const pair = pairMap.get(token.address.toLowerCase());
      if (!pair) return;
      const m5 = Number(pair.priceChange?.m5 || 0);
      PriceAlerts.check(token.symbol, token.name || token.symbol, m5);
    });
  } catch (err) {
    console.warn('[PulseCentral] Watchlist alert check failed:', err);
  }
}

// Poll watchlist tokens every 5 minutes for price alerts
setInterval(checkWatchlistAlerts, 5 * 60 * 1000);

/** CSS class name for a signed numeric value — kept for backward compatibility */
function plSignClass(val) {
  const n = Number(val);
  if (n > 0) return 'change-positive';
  if (n < 0) return 'change-negative';
  return 'change-neutral';
}

/* ── Token Details Modal ──────────────────────────────────── */

/**
 * Social-link label mapping for known social types from DexScreener.
 * (Defined near the top of the file for use by market/trending card builders.)
 */
// SOCIAL_LABELS is defined in the constants section above.

/** The DexScreener pair currently displayed in the token details modal. */
let tokenDetailsPair = null;

/** Tracks which tabs have already had their data loaded (lazy-loaded on first open). */
let tokenDetailsSecurityLoaded = false;
let tokenDetailsWhalesLoaded   = false;

/** Minimum USD transfer value to qualify as a whale transaction. */
const WHALE_USD_THRESHOLD = 10_000;

/** Open the token details modal for the given DexScreener pair. */
function openTokenDetailsModal(pair) {
  tokenDetailsPair           = pair;
  tokenDetailsSecurityLoaded = false;
  tokenDetailsWhalesLoaded   = false;

  // Reset to overview tab
  switchTokenDetailsTab('overview');
  renderTokenDetailsOverview(pair);

  setVisible($('token-details-overlay'), true);
}

/** Close the token details modal and clear state. */
function closeTokenDetailsModal() {
  setHidden($('token-details-overlay'), true);
  tokenDetailsPair = null;
}

/** Switch to the named tab (overview | security | whales) inside the modal. */
function switchTokenDetailsTab(tabName) {
  document.querySelectorAll('.td-tab-btn').forEach(btn => {
    const active = btn.dataset.tdTab === tabName;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.td-tab-panel').forEach(panel => {
    const active = panel.id === `td-tab-${tabName}`;
    panel.classList.toggle('hidden', !active);
  });

  // Lazy-load Security and Whale Tracker data on first visit
  if (tabName === 'security' && !tokenDetailsSecurityLoaded) {
    tokenDetailsSecurityLoaded = true;
    loadTokenSecurityData();
  }
  if (tabName === 'whales' && !tokenDetailsWhalesLoaded) {
    tokenDetailsWhalesLoaded = true;
    loadTokenWhaleData();
  }
}

/**
 * Build the Overview tab content from the existing pair data.
 * No additional API calls are made here; all data comes from DexScreener.
 */
function renderTokenDetailsOverview(pair) {
  const token    = pair?.baseToken || {};
  const logoUrl  = pair?.info?.imageUrl || null;
  const tokenAddr = (token.address || '').toLowerCase();

  // Update modal header
  const logoWrap = $('token-details-logo-wrap');
  logoWrap.innerHTML = '';
  logoWrap.appendChild(buildTokenLogo(logoUrl, token.symbol || '?'));
  $('token-details-title').textContent = token.name || token.symbol || 'Unknown Token';
  $('token-details-sym').textContent   = token.symbol || '';

  const content = $('td-tab-overview');
  content.innerHTML = '';

  // ── Contract address ─────────────────────────────────────
  if (tokenAddr) {
    const addrSection = document.createElement('div');
    addrSection.className = 'td-section';

    const addrLabel = document.createElement('div');
    addrLabel.className = 'td-label';
    addrLabel.textContent = 'Contract Address';

    const addrRow = document.createElement('div');
    addrRow.className = 'td-contract-row';

    const addrEl = document.createElement('span');
    addrEl.className = 'td-contract-addr';
    addrEl.textContent = tokenAddr;
    addrEl.title = tokenAddr;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'td-copy-btn';
    copyBtn.title = 'Copy address';
    copyBtn.setAttribute('aria-label', 'Copy contract address');
    copyBtn.textContent = '📋';
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(tokenAddr)
        .then(() => {
          copyBtn.textContent = '✅';
          setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
        })
        .catch(() => {});
    });

    const scanLink = document.createElement('a');
    scanLink.href      = `https://scan.pulsechain.com/token/${tokenAddr}`;
    scanLink.target    = '_blank';
    scanLink.rel       = 'noopener';
    scanLink.className = 'td-scan-link';
    scanLink.textContent = '🔗 Scan';
    scanLink.addEventListener('click', e => e.stopPropagation());

    addrRow.append(addrEl, copyBtn, scanLink);
    addrSection.append(addrLabel, addrRow);
    content.appendChild(addrSection);
  }

  // ── Price stats grid ──────────────────────────────────────
  const statsSection = document.createElement('div');
  statsSection.className = 'td-section';

  const statsGrid = document.createElement('div');
  statsGrid.className = 'td-stats-grid';

  const statDefs = [
    { label: 'Price',       value: fmt.price(pair?.priceUsd) },
    { label: '24h Change',  html: (() => { const { text, cls } = fmt.change(pair?.priceChange?.h24); return `<span class="${cls}">${text}</span>`; })() },
    { label: '1h Change',   html: (() => { const { text, cls } = fmt.change(pair?.priceChange?.h1);  return `<span class="${cls}">${text}</span>`; })() },
    { label: '5 min Change',html: (() => { const { text, cls } = fmt.change(pair?.priceChange?.m5);  return `<span class="${cls}">${text}</span>`; })() },
    { label: 'Volume 24h',  value: fmt.large(pair?.volume?.h24) },
    { label: 'Market Cap',  value: fmt.large(pair?.marketCap || pair?.fdv) },
    { label: 'Liquidity',   value: fmt.large(pair?.liquidity?.usd) },
    { label: 'Txns 24h',    value: pair?.txns?.h24 ? String(Number(pair.txns.h24.buys || 0) + Number(pair.txns.h24.sells || 0)) : '—' },
  ];

  statDefs.forEach(({ label, value, html }) => {
    const stat = document.createElement('div');
    stat.className = 'td-stat';

    const lbl = document.createElement('div');
    lbl.className = 'td-stat-label';
    lbl.textContent = label;

    const val = document.createElement('div');
    val.className = 'td-stat-value';
    if (html) val.innerHTML = html;
    else val.textContent = value || '—';

    stat.append(lbl, val);
    statsGrid.appendChild(stat);
  });

  statsSection.appendChild(statsGrid);
  content.appendChild(statsSection);

  // ── Social links ──────────────────────────────────────────
  const websites = pair?.info?.websites || [];
  const socials  = pair?.info?.socials  || [];

  if (websites.length > 0 || socials.length > 0) {
    const socialSection = document.createElement('div');
    socialSection.className = 'td-section';

    const socialLabel = document.createElement('div');
    socialLabel.className = 'td-label';
    socialLabel.textContent = 'Links & Socials';

    const socialLinks = document.createElement('div');
    socialLinks.className = 'td-social-links';

    websites.forEach(({ label, url }) => {
      if (!url) return;
      const a = document.createElement('a');
      a.href      = url;
      a.target    = '_blank';
      a.rel       = 'noopener';
      a.className = 'td-social-link';
      a.textContent = `🌐 ${escHtml(label || 'Website')}`;
      a.addEventListener('click', e => e.stopPropagation());
      socialLinks.appendChild(a);
    });

    socials.forEach(({ type, url }) => {
      if (!url) return;
      const a = document.createElement('a');
      a.href      = url;
      a.target    = '_blank';
      a.rel       = 'noopener';
      a.className = 'td-social-link';
      const typeLower = (type || '').toLowerCase();
      a.textContent = SOCIAL_LABELS[typeLower] || `🔗 ${type || 'Link'}`;
      a.addEventListener('click', e => e.stopPropagation());
      socialLinks.appendChild(a);
    });

    socialSection.append(socialLabel, socialLinks);
    content.appendChild(socialSection);
  }

  // ── DexScreener link ──────────────────────────────────────
  if (pair?.pairAddress) {
    const dexSection = document.createElement('div');
    dexSection.className = 'td-section';

    const dexLink = document.createElement('a');
    dexLink.href      = `https://dexscreener.com/pulsechain/${pair.pairAddress}`;
    dexLink.target    = '_blank';
    dexLink.rel       = 'noopener';
    dexLink.className = 'td-social-link';
    dexLink.textContent = '📈 View on DexScreener';
    dexLink.addEventListener('click', e => e.stopPropagation());
    dexSection.appendChild(dexLink);
    content.appendChild(dexSection);
  }
}

/** Fetch GoPlus security data and BlockScout metadata, then render the Security tab. */
async function loadTokenSecurityData() {
  if (!tokenDetailsPair) return;
  const tokenAddr = (tokenDetailsPair?.baseToken?.address || '').toLowerCase();
  if (!tokenAddr) return;

  const loadingEl = $('token-details-security-loading');
  const contentEl = $('token-details-security-content');
  contentEl.innerHTML = '';
  setVisible(loadingEl, true);

  try {
    const [security, metadata] = await Promise.all([
      API.getTokenSecurity(tokenAddr),
      API.getTokenMetadata(tokenAddr),
    ]);
    setHidden(loadingEl, true);
    renderTokenSecurityContent(security, metadata, tokenAddr);
  } catch (err) {
    setHidden(loadingEl, true);
    const p = document.createElement('p');
    p.className = 'td-error';
    p.textContent = `Failed to load security data: ${err.message}`;
    contentEl.appendChild(p);
  }
}

/**
 * Render the Security tab content from GoPlus and BlockScout data.
 * @param {object|null} security  GoPlus token security result
 * @param {object|null} metadata  BlockScout v2 token metadata
 * @param {string}      tokenAddr Lowercase contract address
 */
function renderTokenSecurityContent(security, metadata, tokenAddr) {
  const contentEl = $('token-details-security-content');
  contentEl.innerHTML = '';

  // ── Holder / Supply info (BlockScout preferred, GoPlus fallback) ──
  const holderCount = metadata?.holders || security?.holder_count || null;
  const rawSupply   = metadata?.total_supply || security?.total_supply || null;
  const decimals    = Number(metadata?.decimals || 18);

  if (holderCount || rawSupply) {
    const section = document.createElement('div');
    section.className = 'td-section';
    const grid = document.createElement('div');
    grid.className = 'td-stats-grid';

    if (holderCount) {
      const stat = document.createElement('div');
      stat.className = 'td-stat';
      stat.innerHTML = `<div class="td-stat-label">Holders</div><div class="td-stat-value">${Number(holderCount).toLocaleString('en-US')}</div>`;
      grid.appendChild(stat);
    }
    if (rawSupply) {
      const supply = Number(rawSupply) / Math.pow(10, decimals);
      const fmtd = supply >= 1e12 ? (supply / 1e12).toFixed(2) + 'T'
                 : supply >= 1e9  ? (supply / 1e9 ).toFixed(2) + 'B'
                 : supply >= 1e6  ? (supply / 1e6 ).toFixed(2) + 'M'
                 : supply.toLocaleString('en-US', { maximumFractionDigits: 0 });
      const stat = document.createElement('div');
      stat.className = 'td-stat';
      stat.innerHTML = `<div class="td-stat-label">Total Supply</div><div class="td-stat-value">${fmtd}</div>`;
      grid.appendChild(stat);
    }
    section.appendChild(grid);
    contentEl.appendChild(section);
  }

  if (!security) {
    const unavail = document.createElement('div');
    unavail.className = 'td-security-unavailable';
    unavail.innerHTML = '<span>🔍</span><p>Security analysis is not available for this token on PulseChain.</p>';
    contentEl.appendChild(unavail);
    return;
  }

  // ── Risk banner ───────────────────────────────────────────
  const isHoneypot      = security.is_honeypot      === '1';
  const buyTax          = Number(security.buy_tax   || 0) * 100;
  const sellTax         = Number(security.sell_tax  || 0) * 100;
  const isOpenSource    = security.is_open_source   === '1';
  const isMintable      = security.is_mintable      === '1';
  const isProxy         = security.is_proxy         === '1';
  const canTakeBack     = security.can_take_back_ownership === '1';
  const hiddenOwner     = security.hidden_owner     === '1';
  const xferPausable    = security.transfer_pausable === '1';
  const blacklistable   = security.is_blacklisted   === '1';
  const ownerModBalance = security.owner_change_balance === '1';

  const criticalCount = [isHoneypot, canTakeBack, hiddenOwner, ownerModBalance].filter(Boolean).length;
  const warnCount     = [isMintable, xferPausable, blacklistable, buyTax > 10, sellTax > 10].filter(Boolean).length;

  const riskBanner = document.createElement('div');
  if (isHoneypot) {
    riskBanner.className = 'td-risk-banner td-risk-critical';
    riskBanner.innerHTML = '🚨 <strong>HONEYPOT DETECTED</strong> — This token may trap your funds. Exercise extreme caution.';
  } else if (criticalCount > 0 || warnCount >= 3) {
    riskBanner.className = 'td-risk-banner td-risk-high';
    riskBanner.innerHTML = '⚠️ <strong>HIGH RISK</strong> — Multiple security flags detected. DYOR before buying.';
  } else if (warnCount > 0 || !isOpenSource) {
    riskBanner.className = 'td-risk-banner td-risk-warning';
    riskBanner.innerHTML = '⚡ <strong>MODERATE RISK</strong> — Some flags detected. Proceed with caution.';
  } else {
    riskBanner.className = 'td-risk-banner td-risk-ok';
    riskBanner.innerHTML = '✅ <strong>LOW RISK</strong> — No major security issues detected.';
  }
  contentEl.appendChild(riskBanner);

  // ── Security checks list ──────────────────────────────────
  const checksSection = document.createElement('div');
  checksSection.className = 'td-section';

  const checksLabel = document.createElement('div');
  checksLabel.className = 'td-label';
  checksLabel.textContent = 'Security Checks';

  const checks = [
    { label: 'Honeypot',                   pass: !isHoneypot,      textVal: isHoneypot      ? 'Yes ⚠️' : 'No',   critical: true  },
    { label: 'Contract Open Source',       pass: isOpenSource,     textVal: isOpenSource     ? 'Yes'    : 'No',   critical: false },
    { label: 'Buy Tax',                    pass: buyTax  <= 5,     textVal: buyTax  > 0 ? `${buyTax.toFixed(1)}%`  : 'None', critical: false },
    { label: 'Sell Tax',                   pass: sellTax <= 5,     textVal: sellTax > 0 ? `${sellTax.toFixed(1)}%` : 'None', critical: false },
    { label: 'Mintable',                   pass: !isMintable,      textVal: isMintable       ? 'Yes' : 'No',      critical: false },
    { label: 'Is Proxy',                   pass: !isProxy,         textVal: isProxy          ? 'Yes' : 'No',      critical: false },
    { label: 'Transfer Pausable',          pass: !xferPausable,    textVal: xferPausable     ? 'Yes' : 'No',      critical: false },
    { label: 'Blacklist Function',         pass: !blacklistable,   textVal: blacklistable    ? 'Yes' : 'No',      critical: false },
    { label: 'Can Take Back Ownership',    pass: !canTakeBack,     textVal: canTakeBack      ? 'Yes' : 'No',      critical: true  },
    { label: 'Hidden Owner',               pass: !hiddenOwner,     textVal: hiddenOwner      ? 'Yes' : 'No',      critical: true  },
    { label: 'Owner Can Modify Balances',  pass: !ownerModBalance, textVal: ownerModBalance  ? 'Yes' : 'No',      critical: true  },
  ];

  const checksList = document.createElement('ul');
  checksList.className = 'td-security-list';

  checks.forEach(({ label, pass, textVal, critical }) => {
    const li = document.createElement('li');
    li.className = 'td-security-item';

    const icon = document.createElement('span');
    icon.className = pass ? 'td-check-pass' : (critical ? 'td-check-critical' : 'td-check-warn');
    icon.textContent = pass ? '✓' : '✗';

    const labelEl = document.createElement('span');
    labelEl.className = 'td-check-label';
    labelEl.textContent = label;

    const valueEl = document.createElement('span');
    valueEl.className = `td-check-value ${pass ? 'td-check-pass' : (critical ? 'td-check-critical' : 'td-check-warn')}`;
    valueEl.textContent = textVal;

    li.append(icon, labelEl, valueEl);
    checksList.appendChild(li);
  });

  checksSection.append(checksLabel, checksList);
  contentEl.appendChild(checksSection);

  // GoPlus attribution
  const attr = document.createElement('p');
  attr.className = 'td-attribution';
  attr.innerHTML = 'Security analysis powered by <a href="https://gopluslabs.io" target="_blank" rel="noopener">GoPlus Security</a>. Always DYOR.';
  contentEl.appendChild(attr);
}

/** Fetch recent token transfers and render the Whale Tracker tab. */
async function loadTokenWhaleData() {
  if (!tokenDetailsPair) return;
  const tokenAddr = (tokenDetailsPair?.baseToken?.address || '').toLowerCase();
  if (!tokenAddr) return;

  const loadingEl = $('token-details-whales-loading');
  const contentEl = $('token-details-whales-content');
  contentEl.innerHTML = '';
  setVisible(loadingEl, true);

  try {
    const transfers = await API.getTokenTransferHistory(tokenAddr);
    setHidden(loadingEl, true);
    renderWhaleTransfers(transfers);
  } catch (err) {
    setHidden(loadingEl, true);
    const p = document.createElement('p');
    p.className = 'td-error';
    p.textContent = `Failed to load transfers: ${err.message}`;
    contentEl.appendChild(p);
  }
}

/**
 * Render whale transactions (transfers ≥ WHALE_USD_THRESHOLD) into the Whale Tracker tab.
 * @param {object[]} transfers  BlockScout v2 transfer items
 */
function renderWhaleTransfers(transfers) {
  const contentEl = $('token-details-whales-content');
  const price     = Number(tokenDetailsPair?.priceUsd || 0);

  // Parse transfers and filter to whale-sized ones
  const whales = transfers.map(t => {
    const raw      = Number(t.total?.value    || 0);
    const dec      = Number(t.total?.decimals || 18);
    const amount   = raw / Math.pow(10, dec);
    const usdValue = amount * price;
    return {
      from:      t.from?.hash   || '',
      to:        t.to?.hash     || '',
      amount,
      usdValue,
      timestamp: t.timestamp    || '',
      txHash:    t.tx_hash      || '',
    };
  }).filter(t => price > 0 ? t.usdValue >= WHALE_USD_THRESHOLD : t.amount > 0)
    .sort((a, b) => b.usdValue - a.usdValue);

  if (whales.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'td-whales-empty';
    empty.innerHTML = `<span>🐋</span><p>No whale transactions found in the last 50 transfers.<br><small>Threshold: ${fmt.usd(WHALE_USD_THRESHOLD)}</small></p>`;
    contentEl.appendChild(empty);
    return;
  }

  const sym = escHtml(tokenDetailsPair?.baseToken?.symbol || '');

  const header = document.createElement('p');
  header.className = 'td-whales-header';
  header.textContent = `${whales.length} large transfer${whales.length !== 1 ? 's' : ''} found (≥ ${fmt.usd(WHALE_USD_THRESHOLD)})`;
  contentEl.appendChild(header);

  const table = document.createElement('div');
  table.className = 'td-whale-table';

  whales.forEach(({ from, to, amount, usdValue, timestamp, txHash }) => {
    const row = document.createElement('div');
    row.className = 'td-whale-row';

    // Timestamp
    const timeEl = document.createElement('div');
    timeEl.className = 'td-whale-time';
    if (timestamp) {
      const d = new Date(timestamp);
      timeEl.textContent =
        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) + ' ' +
        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
    } else {
      timeEl.textContent = '—';
    }

    // From / To addresses
    const addrsEl = document.createElement('div');
    addrsEl.className = 'td-whale-addrs';

    function addrLink(hash) {
      if (!hash) return '—';
      const short = `${hash.slice(0, 8)}…${hash.slice(-6)}`;
      return `<a href="https://scan.pulsechain.com/address/${escHtml(hash)}" target="_blank" rel="noopener">${escHtml(short)}</a>`;
    }

    const fromEl = document.createElement('div');
    fromEl.className = 'td-whale-addr';
    fromEl.innerHTML = `<span class="td-whale-dir">From</span> ${addrLink(from)}`;

    const toEl = document.createElement('div');
    toEl.className = 'td-whale-addr';
    toEl.innerHTML = `<span class="td-whale-dir">To</span> ${addrLink(to)}`;

    addrsEl.append(fromEl, toEl);

    // Value
    const valEl = document.createElement('div');
    valEl.className = 'td-whale-value';
    const usdEl = document.createElement('div');
    usdEl.className = 'td-whale-usd';
    usdEl.textContent = price > 0 ? fmt.usd(usdValue) : '—';
    const amtEl = document.createElement('div');
    amtEl.className = 'td-whale-amount';
    amtEl.textContent = `${fmt.balance(amount)} ${sym}`;
    valEl.append(usdEl, amtEl);

    row.append(timeEl, addrsEl, valEl);

    // Tx link
    if (txHash) {
      const txLink = document.createElement('a');
      txLink.href      = `https://scan.pulsechain.com/tx/${escHtml(txHash)}`;
      txLink.target    = '_blank';
      txLink.rel       = 'noopener';
      txLink.className = 'td-whale-tx-link';
      txLink.textContent = '🔗';
      txLink.title = 'View transaction';
      txLink.addEventListener('click', e => e.stopPropagation());
      row.appendChild(txLink);
    }

    table.appendChild(row);
  });

  contentEl.appendChild(table);

  const attr = document.createElement('p');
  attr.className = 'td-attribution';
  attr.innerHTML = 'Transfer data from <a href="https://scan.pulsechain.com" target="_blank" rel="noopener">PulseChain Scan</a>. Whale threshold: ' + fmt.usd(WHALE_USD_THRESHOLD) + '.';
  contentEl.appendChild(attr);
}

// ── Wire token details modal events ───────────────────────
$('token-details-close').addEventListener('click', closeTokenDetailsModal);
$('token-details-overlay').addEventListener('click', e => {
  if (e.target === $('token-details-overlay')) closeTokenDetailsModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !$('token-details-overlay').classList.contains('hidden')) {
    closeTokenDetailsModal();
  }
});
document.querySelectorAll('.td-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTokenDetailsTab(btn.dataset.tdTab));
});
