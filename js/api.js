/**
 * PulseCentral – api.js
 * Handles all external data fetching: PulseChain Scan + DexScreener.
 */

const API = (() => {
  /* ── Constants ─────────────────────────────────────────── */

  /** PulseChain Scan (BlockScout) base URL */
  const SCAN_BASE = 'https://api.scan.pulsechain.com/api';

  /** DexScreener API base URL */
  const DSX_BASE = 'https://api.dexscreener.com/latest/dex';

  /** PulseChain native coin decimals */
  const PLS_DECIMALS = 18;

  /**
   * Well-known PulseChain token addresses used for the Markets / Trending tabs.
   * Keyed by symbol for easy lookup.
   */
  const KNOWN_TOKENS = [
    { symbol: 'PLSX',  address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab' },
    { symbol: 'HEX',   address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39' },
    { symbol: 'INC',   address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d' },
    { symbol: 'WPLS',  address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27' },
    { symbol: 'DAI',   address: '0xefD766cCb38EaF1dfd701853BFCe31359239F305' },
    { symbol: 'USDC',  address: '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07' },
    { symbol: 'USDT',  address: '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f' },
    { symbol: 'WETH',  address: '0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C' },
    { symbol: 'WBTC',  address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' },
    { symbol: 'pDAI',  address: '0x6B175474E89094C44Da98b954EedeAC495271d0F' },
  ];

  /* ── Helpers ────────────────────────────────────────────── */

  /**
   * Fetch JSON from a URL with a configurable timeout.
   * @param {string} url
   * @param {number} [timeoutMs=12000]
   * @returns {Promise<any>}
   */
  async function fetchJSON(url, timeoutMs = 12000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${res.statusText}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Convert a token balance from its raw on-chain value to a human-readable
   * decimal string.
   * @param {string|number} rawBalance
   * @param {number} decimals
   * @returns {number}
   */
  function toDecimal(rawBalance, decimals) {
    if (!rawBalance) return 0;
    const factor = Math.pow(10, decimals);
    return Number(rawBalance) / factor;
  }

  /* ── PulseChain Scan API ────────────────────────────────── */

  /**
   * Fetch the native PLS balance (in whole PLS) for a wallet address.
   * @param {string} address  0x-prefixed wallet address
   * @returns {Promise<number>}
   */
  async function getPlsBalance(address) {
    const url = `${SCAN_BASE}?module=account&action=balance&address=${address}&tag=latest`;
    const data = await fetchJSON(url);
    if (data.status !== '1') throw new Error(data.message || 'Failed to fetch PLS balance');
    return toDecimal(data.result, PLS_DECIMALS);
  }

  /**
   * Fetch all ERC-20 token balances held by a wallet.
   * Returns an array of token objects with symbol, name, balance, decimals, contractAddress.
   * @param {string} address  0x-prefixed wallet address
   * @returns {Promise<Array<{symbol:string, name:string, balance:number, decimals:number, contractAddress:string}>>}
   */
  async function getTokenList(address) {
    const url = `${SCAN_BASE}?module=account&action=tokenlist&address=${address}`;
    const data = await fetchJSON(url);
    if (data.status !== '1') {
      // status '0' with empty result means no tokens — not an error
      if (data.message === 'No tokens found') return [];
      throw new Error(data.message || 'Failed to fetch token list');
    }
    return (data.result || []).map(t => ({
      symbol:          t.symbol,
      name:            t.name,
      balance:         toDecimal(t.balance, Number(t.decimals)),
      decimals:        Number(t.decimals),
      contractAddress: t.contractAddress,
    }));
  }

  /* ── DexScreener API ────────────────────────────────────── */

  /**
   * Fetch DEX pair data for a list of token contract addresses from DexScreener.
   * Filters to PulseChain pairs only and picks the most liquid pair per token.
   * @param {string[]} addresses  array of 0x contract addresses
   * @returns {Promise<Map<string, object>>} map of lowercased address → pair data
   */
  async function getPairsByAddresses(addresses) {
    if (!addresses.length) return new Map();

    // DexScreener accepts up to 30 comma-separated addresses per request
    const chunks = [];
    for (let i = 0; i < addresses.length; i += 30) {
      chunks.push(addresses.slice(i, i + 30));
    }

    const pairMap = new Map();

    await Promise.allSettled(
      chunks.map(async chunk => {
        const url = `${DSX_BASE}/tokens/${chunk.join(',')}`;
        const data = await fetchJSON(url);
        const pairs = (data.pairs || []).filter(
          p => p.chainId === 'pulsechain'
        );
        // Group by token address, keep the most liquid pair
        for (const pair of pairs) {
          const addr = pair.baseToken?.address?.toLowerCase();
          if (!addr) continue;
          const existing = pairMap.get(addr);
          const liq = Number(pair.liquidity?.usd || 0);
          if (!existing || liq > Number(existing.liquidity?.usd || 0)) {
            pairMap.set(addr, pair);
          }
        }
      })
    );

    return pairMap;
  }

  /**
   * Fetch top PulseChain pairs from DexScreener, mirroring the filters used on
   * https://dexscreener.com/pulsechain?rankBy=volume&order=desc&minLiq=25000&min24HTxns=50&profile=1
   *
   * Steps:
   *  1. Pull token profiles from DexScreener's profiles API (profile=1).
   *  2. Combine with hardcoded KNOWN_TOKENS so core tokens always appear.
   *  3. Fetch pair data for all collected addresses.
   *  4. Filter: liquidity.usd >= 25000 (minLiq=25000)
   *             txns.h24 total >= 50   (min24HTxns=50)
   *  5. Sort by 24h volume descending  (rankBy=volume&order=desc).
   *
   * @returns {Promise<object[]>} array of DexScreener pair objects sorted by 24h volume
   */
  async function getTopPulsechainPairs() {
    // Step 1: Fetch PulseChain token profiles (matches profile=1 filter)
    const profileAddresses = [];
    try {
      const profiles = await fetchJSON('https://api.dexscreener.com/token-profiles/latest/v1');
      (profiles || [])
        .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
        .forEach(p => profileAddresses.push(p.tokenAddress));
    } catch (_) {
      // Non-fatal – fall back to KNOWN_TOKENS only
    }

    // Step 2: Merge with hardcoded known tokens (de-duplicated)
    const seen = new Set();
    const allAddresses = [];
    for (const addr of [...profileAddresses, ...KNOWN_TOKENS.map(t => t.address)]) {
      const lower = addr.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        allAddresses.push(addr);
      }
    }

    // Step 3: Fetch pair data for all addresses
    const rawMap = await getPairsByAddresses(allAddresses);

    // Step 4: Apply minLiq=25000 and min24HTxns=50 filters
    const pairMap = new Map();
    for (const [addr, pair] of rawMap) {
      const liq  = Number(pair.liquidity?.usd || 0);
      const txns = Number(pair.txns?.h24?.buys || 0) + Number(pair.txns?.h24?.sells || 0);
      if (liq >= 25000 && txns >= 50) {
        pairMap.set(addr, pair);
      }
    }

    // Step 5: Sort by 24h volume descending (rankBy=volume&order=desc)
    return [...pairMap.values()].sort(
      (a, b) => Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0)
    );
  }

  /**
   * Fetch pair data for the well-known token list (Markets tab warm-up).
   * @returns {Promise<object[]>}
   */
  async function getKnownTokenPairs() {
    const addresses = KNOWN_TOKENS.map(t => t.address);
    const pairMap = await getPairsByAddresses(addresses);
    return [...pairMap.values()];
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    getPlsBalance,
    getTokenList,
    getPairsByAddresses,
    getTopPulsechainPairs,
    getKnownTokenPairs,
    KNOWN_TOKENS,
  };
})();
