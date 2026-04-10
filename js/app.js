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

let activeTab = 'portfolio';
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

  if (name === 'markets'   && !marketsLoaded)  loadMarkets();
  if (name === 'trending'  && !trendingLoaded) loadTrending();
  if (name === 'watchlist')                    renderWatchlistTab();
  if (name === 'profits')                      renderProfitsTab();
}

/* ── Portfolio tab ──────────────────────────────────────── */

const loadBtn    = $('load-portfolio-btn');
const loadBtnTxt = $('load-portfolio-btn-text');
const loadSpinner= $('load-portfolio-spinner');
const walletInput= $('wallet-input');

loadBtn.addEventListener('click', () => {
  const address = walletInput.value.trim();
  if (!address) {
    showPortfolioError('Please enter a wallet address.');
    return;
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
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
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) {
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
  setHidden($('portfolio-table-wrap'), true);
  setVisible($('portfolio-empty'), true);

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
    const wplsPair  = pairMap.get('0xa1077a294dde1b09bb078844df40758a5D0f9a27');
    const plsPrice  = Number(wplsPair?.priceUsd || 0);
    const plsValue  = plsBalance * plsPrice;
    const totalUsd  = enriched.reduce((s, t) => s + t.value, 0) + plsValue;

    renderPortfolioSummary(totalUsd, enriched.length + 1, plsBalance, plsPrice);
    renderPortfolioTable(enriched, plsBalance, plsPrice);

    setHidden($('portfolio-empty'), true);
    setVisible($('portfolio-summary'), true);
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
  const tbody = $('portfolio-tbody');
  tbody.innerHTML = '';

  // PLS native row (first)
  const plsRow = buildPortfolioRow(
    1,
    { symbol: 'PLS', name: 'PulseChain', logoUrl: null },
    plsBalance,
    plsPrice,
    0 // change unavailable for native
  );
  tbody.appendChild(plsRow);

  tokens.forEach((t, i) => {
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

/* ── Watchlist tab rendering ─────────────────────────────── */

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
  if (!/^0x[0-9a-fA-F]{40}$/.test(tokenAddress)) {
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
