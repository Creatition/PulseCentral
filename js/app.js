/**
 * PulseCentral – app.js
 * Tab routing, theme switching, portfolio loading, markets, and trending rendering.
 */

/* ── Theme switcher ──────────────────────────────────────── */

const THEMES = ['pulsechain', 'hex', 'pulsex', 'incentive'];

/**
 * Apply a named theme to the <html> element and persist it in localStorage.
 * Updates the active state of the swatch buttons.
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
