/**
 * PulseCentral – app.js
 * Tab routing, portfolio loading, markets, and trending rendering.
 */

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

  if (name === 'markets'  && !marketsLoaded)  loadMarkets();
  if (name === 'trending' && !trendingLoaded) loadTrending();
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

  tr.append(tdIdx, tdToken, tdSym, tdPrice, tdChange, tdVol, tdLiq);
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
