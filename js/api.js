/**
 * PulseCentral – api.js
 * Handles all external data fetching: PulseChain Scan + DexScreener + DexTools.
 */

const API = (() => {
  /* ── Constants ─────────────────────────────────────────── */

  /** PulseChain Scan (BlockScout) base URL */
  const SCAN_BASE = 'https://api.scan.pulsechain.com/api';

  /** DexScreener API base URL */
  const DSX_BASE = 'https://api.dexscreener.com/latest/dex';

  /** DexScreener chart / OHLCV API base URL */
  const DSX_CHART_BASE = 'https://io.dexscreener.com/dex/chart/amm/v3/pulsechain';

  /** DexTools shared-data API base URL (chain slug: "pulse" for PulseChain) */
  const DEXTOOLS_BASE = 'https://www.dextools.io/shared/data/pair';

  /** PulseChain native coin decimals */
  const PLS_DECIMALS = 18;

  /**
   * Well-known PulseChain token addresses used for the Markets / Trending tabs.
   * Keyed by symbol for easy lookup.
   */
  const KNOWN_TOKENS = [
    { symbol: 'PLSX',         address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab' },
    { symbol: 'HEX',          address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39' },
    { symbol: 'INC',          address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d' },
    { symbol: 'WPLS',         address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27' },
    { symbol: 'DAI',          address: '0xefD766cCb38EaF1dfd701853BFCe31359239F305' },
    { symbol: 'USDC',         address: '0x15D38573d2feeb82e7ad5187aB8c1D52810B1f07' },
    { symbol: 'USDT',         address: '0x0Cb6F5a34ad42ec934882A05265A7d5F59b51A2f' },
    { symbol: 'WETH',         address: '0x02DcdD04e3F455D838cd1249292C58f3B79e3C3C' },
    { symbol: 'WBTC',         address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', pairAddress: '0xe0e1F83A1C64Cf65C1a86D7f3445fc4F58f7Dcbf' },
    { symbol: 'pDAI',         address: '0x6B175474E89094C44Da98b954EedeAC495271d0F', pairAddress: '0xfC64556FAA683e6087F425819C7Ca3C558e13aC1' },
    { symbol: 'eHex',         address: '0x57fde0a71132198BBeC939B98976993d8D89D225' },
    { symbol: 'PRVX',         address: '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11' },
    { symbol: 'usdl',         address: '0x0dEEd1486bc52aA0d3E6f8849cEC5adD6598A162' },
    { symbol: 'emit',         address: '0x32fB5663619A657839A80133994E45c5e5cDf427' },
    { symbol: 'pulseguy',     address: '0x67922D590BA6C784f468B6B562d201113a8FbD2D' },
    { symbol: 'Peacock',      address: '0xc10A4Ed9b4042222d69ff0B374eddd47ed90fC1F', pairAddress: '0xCb99800B71B7FB0696D19c3aaAa20c03d2D7e449' },
    { symbol: 'Zero',         address: '0xf6703DBff070F231eEd966D33B1B6D7eF5207d26', pairAddress: '0xf6703DBff070F231eEd966D33B1B6D7eF5207d26' },
    { symbol: 'pTGC',         address: '0x94534EeEe131840b1c0F61847c572228bdfDDE93' },
    { symbol: 'pTiger',       address: '0xC2ACde27428d292C4E8e5A4A38148d6b7A2215f5', pairAddress: '0x4501F821970214a8C7B2FB2478AF9E2B570C341a' },
    { symbol: 'UFO',          address: '0x456548A9B56eFBbD89Ca0309edd17a9E20b04018', pairAddress: '0xbeA0e55b82Eb975280041F3b49C4D0bD937b72d5' },
    { symbol: 'Most',         address: '0xe33a5AE21F93aceC5CfC0b7b0FDBB65A0f0Be5cC', pairAddress: '0x908B5490414518981ce5c473Ff120A6b338feF67' },
    { symbol: 'Pump',         address: '0xec4252e62C6dE3D655cA9Ce3AfC12E553ebBA274', pairAddress: '0x96Fefb743B1D180363404747bf09BD32657D8B78' },
    { symbol: 'Soil',         address: '0xbd63FA573A120013804e51B46C56F9b3e490f53C', pairAddress: '0x4581E25b434c1cEd7a93449B229469f03cA4451e' },
    { symbol: 'mafia',        address: '0x562866b6483894240739211049E109312E9A9A67' },
    { symbol: 'Atropa',       address: '0xCc78A0acDF847A2C1714D2A925bB4477df5d48a6', pairAddress: '0x5EF7AaC0DE4F2012CB36730Da140025B113FAdA4' },
    { symbol: 'FeD',          address: '0x1D177CB9EfEEa49A8B97ab1C72785a3A37ABc9Ff' },
    { symbol: 'Helgo',        address: '0x0567CA0dE35606E9C260CC2358404B11DE21DB44' },
    { symbol: 'Teddy Bear',   address: '0xd6c31bA0754C4383A41c0e9DF042C62b5e918f6d' },
    { symbol: 'stax',         address: '0xA78A54fB941E56514Fa1ccABAd49bCd02039F9d3' },
    { symbol: 'remember',     address: '0x2401E09acE92C689570a802138D6213486407B24' },
    { symbol: 'Sparta',       address: '0x52347C33Cf6Ca8D2cfb864AEc5aA0184C8fd4c9b' },
    { symbol: 'Tophat',       address: '0xc2472877F596D5052883B93777325dD7F7d11c96' },
    { symbol: 'Incd',         address: '0x144Cd22AaA2a80FEd0Bb8B1DeADDc51A53Df1d50' },
    { symbol: 'Pepe',         address: '0x1B71505D95Ab3e7234ed2239b8EC7aa65b94ae7B' },
    { symbol: 'Unity',        address: '0xC70CF25DFCf5c5e9757002106C096ab72fab299E' },
    { symbol: 'Zen',          address: '0xebeCbffA46Eaee7CB3B3305cCE9283cf05CfD1BB' },
    { symbol: 'Doubt',        address: '0x6ba0876e30CcE2A9AfC4B82D8BD8A8349DF4Ca96' },
    { symbol: '9MM',          address: '0x7b39712Ef45F7dcED2bBDF11F3D5046bA61dA719' },
    { symbol: 'zkp',          address: '0x90F055196778e541018482213Ca50648cEA1a050' },
    { symbol: 'dominance',    address: '0x116D162d729E27E2E1D6478F1d2A8AEd9C7a2beA' },
    { symbol: 'cvre',         address: '0x483287DEd4F43552f201a103670853b5dc57D59d' },
    { symbol: 'devc',         address: '0xA804b9E522A2D1645a19227514CFe856Ad8C2fbC' },
    { symbol: 'finvesta',     address: '0x1C81b4358246d3088Ab4361aB755F3D8D4dd62d2' },
    { symbol: 'vouch',        address: '0xD34f5ADC24d8Cc55C1e832Bdf65fFfDF80D1314f' },
    { symbol: 'scada',        address: '0x69e23263927Ae53E5FF3A898d082a83B7D6fB438' },
    { symbol: 'trufarm',      address: '0xCA942990EF21446Db490532E66992eD1EF76A82b' },
    { symbol: 'steth',        address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84' },
    { symbol: 'rhino',        address: '0x6C6D7De6C5f366a1995ed5f1e273C5B3760C6043' },
    { symbol: 'firew',        address: '0x03b4652C8565BC8c257Fbd9fA935AAE41160fc4C' },
    { symbol: 'pdai printer', address: '0x770CFA2FB975E7bCAEDDe234D92c3858C517Adca' },
    { symbol: 'solidx',       address: '0x8Da17Db850315A34532108f0f5458fc0401525f6' },
    { symbol: 'lbrty',        address: '0xB261Fa283aBf9CcE0b493B50b57cb654A490f339' },
    { symbol: 'coffee',       address: '0x707C905DF6104eAE3B116eD9635cBee0A9EBA6E6' },
    { symbol: 'ICSA',         address: '0xfc4913214444aF5c715cc9F7b52655e788A569ed' },
    { symbol: 'LOAN',         address: '0x9159f1D2a9f51998Fc9Ab03fbd8f265ab14A1b3B' },
    { symbol: 'PLSD',         address: '0x34F0915a5f15a66Eba86F6a58bE1A471FB7836A7' },
    { symbol: '9INCH',        address: '0x3ca80d83277e721171284667829c686527b8b3c5' },
    { symbol: 'GENI',         address: '0x444444444444c1a66f394025ac839a535246fcc8' },
    { symbol: 'MAXI',         address: '0x0d86b6aE6cA3E1a08E3d2C4796D30616897C1eE4' },
    { symbol: 'PHIAT',        address: '0x96e035ae0905efac8f733f133462f971cfa45db1' },
    { symbol: 'MINT',         address: '0x207e6b4529840a4fd518f73c68bc9c19b2a15944' },
    { symbol: 'WATT',         address: '0xDfdc2836FD2E63Bba9f0eE07901aD465Bff4DE71' },
    { symbol: 'HDRN',         address: '0x3819f64f282bf135d62168C1e513280dAF905e06' },
    { symbol: 'PLSB',         address: '0x5ee84583f67d5ecea5420dbb42b462896e7f8d06' },
    { symbol: 'TEAM',         address: '0xc6a2cDf807F251e4b82C236D9A23C5156D3fB3A2' },
    { symbol: 'BASE',         address: '0x7B3cFA85D9F31E0DB007D12aC6f47982C2Ac41fc' },
    { symbol: 'EARN',         address: '0xb513038bbfdf9d40b676f41606f4f61d4b02c4a2' },
  ];

  /**
   * The 6 core coins shown on the Home landing page (in display order).
   * `pairAddress`  – specific DEX pair contract for price + chart data.
   * `color`        – brand/accent colour used for the card border.
   * `chartRes`     – DexScreener chart resolution: 'D' = daily bars (monthly view),
   *                  '60' = 1-hour bars (daily view, PRVX only).
   */
  const CORE_COINS = [
    { symbol: 'PLS',  address: '0xA1077a294dDE1B09bB078844df40758a5D0f9a27', pairAddress: '0xe56043671df55de5cdf8459710433c10324de0ae', color: '#7b2fff', chartRes: 'D'  }, // address is the WPLS wrapper contract
    { symbol: 'PLSX', address: '0x95B303987A60C71504D99Aa1b13B4DA07b0790ab', pairAddress: '0x1b45b9148791d3a104184cd5dfe5ce57193a3ee9', color: '#ff6d00', chartRes: 'D'  },
    { symbol: 'HEX',  address: '0x2b591e99afE9f32eAA6214f7B7629768c40Eeb39', pairAddress: '0xf1f4ee610b2babb05c635f726ef8b0c568c8dc65', color: '#e8002d', chartRes: 'D'  },
    { symbol: 'eHex', address: '0x57fde0a71132198BBeC939B98976993d8D89D225', pairAddress: '0xF0eA3efE42C11c8819948Ec2D3179F4084863D3F', color: '#f59e0b', chartRes: 'D'  },
    { symbol: 'INC',  address: '0x2fa878Ab3F87CC1C9737Fc071108F904c0B0C95d', pairAddress: '0xf808bb6265e9ca27002c0a04562bf50d4fe37eaa', color: '#00e676', chartRes: 'D'  },
    { symbol: 'PRVX', address: '0xF6f8Db0aBa00007681F8fAF16A0FDa1c9B030b11', pairAddress: '0x62f7d076c92db76cf84223b6309801ea461d7afe', color: '#00bcd4', chartRes: '60' },
  ];

  /**
   * Maps token address (lowercase) → designated pair address for each core coin
   * that has a known token address. Used in getPairsByAddresses to pin the exact
   * trading pair for Portfolio, Watchlist, Trades, and any other price lookup.
   */
  const CORE_PAIR_OVERRIDES = new Map([
    ...CORE_COINS
      .filter(c => c.address && c.pairAddress)
      .map(c => [c.address.toLowerCase(), c.pairAddress]),
    ...KNOWN_TOKENS
      .filter(t => t.pairAddress)
      .map(t => [t.address.toLowerCase(), t.pairAddress]),
  ]);

  /**
   * Token addresses (lowercase) whose pair data must be fetched from DexTools
   * because DexScreener does not index their designated pair contract.
   * Maps token address → pair address.
   */
  const DEXTOOLS_PAIR_OVERRIDES = new Map([
    // pDAI – PulseX V1 pair not indexed by DexScreener
    ['0x6b175474e89094c44da98b954eedeac495271d0f', '0xfC64556FAA683e6087F425819C7Ca3C558e13aC1'],
  ]);

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

  /* ── DexTools API ───────────────────────────────────────── */

  /**
   * Fetch pair data from the DexTools shared-data API and normalise it into
   * the DexScreener pair-object shape consumed by the rest of the app.
   *
   * DexTools uses "pulse" as the chain slug for PulseChain.
   * The baseToken is whichever of token0/token1 matches `tokenAddress`.
   *
   * Returns null on any error so callers can skip silently.
   *
   * @param {string} pairAddress   DEX pair contract address (0x-prefixed)
   * @param {string} tokenAddress  Token contract address that should be the base token
   * @returns {Promise<object|null>}
   */
  async function fetchDexToolsPairData(pairAddress, tokenAddress) {
    const url = `${DEXTOOLS_BASE}?address=${pairAddress}&chain=pulse&audit=true&locks=true`;
    try {
      const data = await fetchJSON(url, 12000);
      const d = data?.data;
      if (!d) return null;

      const tokenAddrLower = tokenAddress.toLowerCase();

      // Determine which slot (token0 / token1) is the base token we care about
      const token0Addr = (d.token0?.id || d.token0?.address || '').toLowerCase();
      const t0 = { address: d.token0?.id || d.token0?.address, name: d.token0?.name, symbol: d.token0?.symbol };
      const t1 = { address: d.token1?.id || d.token1?.address, name: d.token1?.name, symbol: d.token1?.symbol };

      let baseToken, quoteToken, priceUsd;
      if (token0Addr === tokenAddrLower) {
        baseToken  = t0;
        quoteToken = t1;
        priceUsd   = d.price ?? d.price0;
      } else {
        baseToken  = t1;
        quoteToken = t0;
        priceUsd   = d.price1 ?? d.price;
      }

      // Normalise price-change percentages (DexTools uses variation*)
      const priceChange = {
        m5:  Number(d.variation5m  ?? 0),
        h1:  Number(d.variation1h  ?? 0),
        h6:  Number(d.variation6h  ?? 0),
        h24: Number(d.variation24h ?? 0),
      };

      return {
        chainId:     'pulsechain',
        pairAddress: pairAddress.toLowerCase(),
        baseToken,
        quoteToken,
        priceUsd:    priceUsd != null ? String(priceUsd) : undefined,
        priceChange,
        txns: {
          m5:  { buys: 0, sells: 0 },
          h1:  { buys: 0, sells: 0 },
          h6:  { buys: 0, sells: 0 },
          h24: { buys: d.buys24h ?? 0, sells: d.sells24h ?? 0 },
        },
        volume:    { h24: Number(d.volume24h ?? 0) },
        liquidity: { usd: Number(d.liquidity ?? 0) },
        fdv:       Number(d.fdv ?? d.mcap ?? 0) || undefined,
        marketCap: Number(d.mcap ?? 0) || undefined,
        url:       `https://www.dextools.io/app/pulse/pair-explorer/${pairAddress}`,
        _source:   'dextools',
      };
    } catch (err) {
      console.warn('[PulseCentral] DexTools fetch failed for', pairAddress, err);
      return null;
    }
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
   * Fetch a page of ERC-20 token transfer events for a wallet address.
   * @param {string} address   0x-prefixed wallet address
   * @param {number} [page=1]
   * @param {number} [offset=5000]  records per page (max 10 000)
   * @returns {Promise<object[]>}
   */
  async function getTokenTransfers(address, page = 1, offset = 5000) {
    const url = `${SCAN_BASE}?module=account&action=tokentx&address=${address}&page=${page}&offset=${offset}&sort=asc`;
    const data = await fetchJSON(url, 30000);
    if (data.status !== '1') {
      if (data.message === 'No transactions found') return [];
      throw new Error(data.message || 'Failed to fetch token transfers');
    }
    return data.result || [];
  }

  /**
   * Fetch a page of normal (native PLS) transactions for a wallet address.
   * @param {string} address
   * @param {number} [page=1]
   * @param {number} [offset=5000]
   * @returns {Promise<object[]>}
   */
  async function getNormalTxs(address, page = 1, offset = 5000) {
    const url = `${SCAN_BASE}?module=account&action=txlist&address=${address}&page=${page}&offset=${offset}&sort=asc`;
    const data = await fetchJSON(url, 30000);
    if (data.status !== '1') {
      if (data.message === 'No transactions found') return [];
      throw new Error(data.message || 'Failed to fetch transactions');
    }
    return data.result || [];
  }

  /**
   * Fetch a page of internal transactions (contract-initiated PLS transfers) for a wallet.
   * @param {string} address
   * @param {number} [page=1]
   * @param {number} [offset=5000]
   * @returns {Promise<object[]>}
   */
  async function getInternalTxs(address, page = 1, offset = 5000) {
    const url = `${SCAN_BASE}?module=account&action=txlistinternal&address=${address}&page=${page}&offset=${offset}&sort=asc`;
    const data = await fetchJSON(url, 30000);
    if (data.status !== '1') {
      if (data.message === 'No transactions found') return [];
      throw new Error(data.message || 'Failed to fetch internal transactions');
    }
    return data.result || [];
  }

  /**
   * Wrapped PLS contract address — derived from KNOWN_TOKENS and excluded from
   * trade imports since wrapping/unwrapping PLS→WPLS is not a swap trade.
   */
  const WPLS_ADDRESS = KNOWN_TOKENS.find(t => t.symbol === 'WPLS').address.toLowerCase();

  /**
   * Fetch all token transfers, normal transactions, and internal transactions for
   * a wallet address, then parse them into structured buy/sell trade records.
   *
   * Detection rules:
   *   BUY  — wallet receives token(s) in the same tx where it sent PLS (normal tx, value > 0, from == wallet)
   *   SELL — wallet sends token(s) in the same tx where it received PLS via an internal transfer
   *
   * Token-to-token swaps and transactions where PLS amount cannot be determined
   * are excluded.  WPLS (wrapped PLS) transfers are always excluded.
   *
   * @param {string} address  0x-prefixed wallet address
   * @returns {Promise<Array<{type,tokenAddress,tokenSymbol,tokenName,date,tokenAmount,plsAmount,usdValue,pricePerTokenPls,notes,txHash}>>}
   */
  async function parseWalletTrades(address) {
    const addrLower = address.toLowerCase();

    // Fetch all three data sources in parallel
    const [tokenTxs, normalTxs, internalTxs] = await Promise.all([
      getTokenTransfers(address),
      getNormalTxs(address),
      getInternalTxs(address),
    ]);

    // Index normal txs by hash for O(1) lookup
    const normalTxMap = new Map();
    for (const tx of normalTxs) {
      normalTxMap.set(tx.hash.toLowerCase(), tx);
    }

    // Sum PLS received via internal txs per tx hash
    const internalPlsMap = new Map(); // hash → total PLS received by wallet
    for (const tx of internalTxs) {
      if (tx.to?.toLowerCase() !== addrLower) continue;
      const plsVal = toDecimal(tx.value, PLS_DECIMALS);
      if (plsVal <= 0) continue;
      const hash = tx.hash.toLowerCase();
      internalPlsMap.set(hash, (internalPlsMap.get(hash) || 0) + plsVal);
    }

    // Group token transfers by tx hash, separating incoming from outgoing
    const txGroups = new Map(); // hash → { incoming: [], outgoing: [], timeStamp }
    for (const tx of tokenTxs) {
      // Exclude WPLS wrapping/unwrapping
      if (tx.contractAddress?.toLowerCase() === WPLS_ADDRESS) continue;

      const hash = tx.hash.toLowerCase();
      if (!txGroups.has(hash)) {
        txGroups.set(hash, { incoming: [], outgoing: [], timeStamp: tx.timeStamp });
      }
      const group = txGroups.get(hash);
      if (tx.to?.toLowerCase() === addrLower) {
        group.incoming.push(tx);
      } else if (tx.from?.toLowerCase() === addrLower) {
        group.outgoing.push(tx);
      }
    }

    const trades = [];

    for (const [hash, { incoming, outgoing, timeStamp }] of txGroups) {
      const date     = new Date(Number(timeStamp) * 1000).toISOString();
      const shortHash = hash.slice(0, 10) + '…';
      const normalTx = normalTxMap.get(hash);

      // ── BUY: wallet sent PLS and received token(s) ──────────────────────
      if (
        incoming.length > 0 &&
        normalTx &&
        normalTx.from?.toLowerCase() === addrLower
      ) {
        const plsSpent = toDecimal(normalTx.value, PLS_DECIMALS);
        if (plsSpent > 0) {
          // Split PLS evenly across all received tokens in this tx.
          // Note: this is an approximation — in rare multi-token swaps the actual
          // PLS per token may differ; users can edit individual trades if needed.
          const plsPerToken = plsSpent / incoming.length;
          for (const transfer of incoming) {
            const tokenAmount = toDecimal(transfer.value, Number(transfer.tokenDecimal) || 18);
            if (tokenAmount <= 0) continue;
            trades.push({
              type:            'buy',
              tokenAddress:    transfer.contractAddress.toLowerCase(),
              tokenSymbol:     transfer.tokenSymbol || '?',
              tokenName:       transfer.tokenName   || transfer.tokenSymbol || '?',
              date,
              tokenAmount,
              plsAmount:       plsPerToken,
              usdValue:        0,
              pricePerTokenPls: tokenAmount > 0 ? plsPerToken / tokenAmount : 0,
              notes:           `Imported from tx ${shortHash}`,
              txHash:          hash,
            });
          }
        }
      }

      // ── SELL: wallet sent token(s) and received PLS internally ──────────
      if (outgoing.length > 0 && internalPlsMap.has(hash)) {
        const plsReceived  = internalPlsMap.get(hash);
        // Split PLS evenly across all sent tokens in this tx (same approximation as buys above).
        const plsPerToken  = plsReceived / outgoing.length;
        for (const transfer of outgoing) {
          const tokenAmount = toDecimal(transfer.value, Number(transfer.tokenDecimal) || 18);
          if (tokenAmount <= 0) continue;
          trades.push({
            type:            'sell',
            tokenAddress:    transfer.contractAddress.toLowerCase(),
            tokenSymbol:     transfer.tokenSymbol || '?',
            tokenName:       transfer.tokenName   || transfer.tokenSymbol || '?',
            date,
            tokenAmount,
            plsAmount:       plsPerToken,
            usdValue:        0,
            pricePerTokenPls: tokenAmount > 0 ? plsPerToken / tokenAmount : 0,
            notes:           `Imported from tx ${shortHash}`,
            txHash:          hash,
          });
        }
      }
    }

    // Sort chronologically
    trades.sort((a, b) => new Date(a.date) - new Date(b.date));
    return trades;
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

    // Override price data for core coins with their designated pair addresses.
    // This ensures the correct pair is always used regardless of liquidity ranking.
    const overrideTokenAddrs = addresses
      .map(a => a.toLowerCase())
      .filter(a => CORE_PAIR_OVERRIDES.has(a));

    if (overrideTokenAddrs.length > 0) {
      const pairAddrs = overrideTokenAddrs.map(a => CORE_PAIR_OVERRIDES.get(a));
      try {
        const url = `${DSX_BASE}/pairs/pulsechain/${pairAddrs.join(',')}`;
        const data = await fetchJSON(url);
        for (const pair of (data.pairs || [])) {
          const tokenAddr = pair.baseToken?.address?.toLowerCase();
          if (tokenAddr) pairMap.set(tokenAddr, pair);
        }
      } catch (err) {
        console.warn('[PulseCentral] Core pair override fetch failed:', err);
      }
    }

    // DexTools fallback: for tokens whose pair is not indexed by DexScreener,
    // fetch price data directly from the DexTools shared-data API.
    const dextoolsTokenAddrs = addresses
      .map(a => a.toLowerCase())
      .filter(a => DEXTOOLS_PAIR_OVERRIDES.has(a) && !pairMap.has(a));

    if (dextoolsTokenAddrs.length > 0) {
      await Promise.allSettled(
        dextoolsTokenAddrs.map(async tokenAddr => {
          const pairAddr = DEXTOOLS_PAIR_OVERRIDES.get(tokenAddr);
          const pair = await fetchDexToolsPairData(pairAddr, tokenAddr);
          if (pair) pairMap.set(tokenAddr, pair);
        })
      );
    }

    return pairMap;
  }

  /**
   * Fetch top PulseChain pairs from DexScreener sorted by 24-hour volume.
   * Collects addresses from token profiles, boosted tokens (latest and top),
   * and hardcoded KNOWN_TOKENS, then deduplicates by token address.
   *
   * @returns {Promise<object[]>} array of DexScreener pair objects sorted by 24h volume
   */
  async function getTopPulsechainPairs() {
    // Step 1: Fetch PulseChain token profiles and boosted tokens for a wider address pool
    const profileAddresses = [];
    try {
      const [profiles, latestBoosts, topBoosts] = await Promise.allSettled([
        fetchJSON('https://api.dexscreener.com/token-profiles/latest/v1'),
        fetchJSON('https://api.dexscreener.com/token-boosts/latest/v1'),
        fetchJSON('https://api.dexscreener.com/token-boosts/top/v1'),
      ]);
      if (profiles.status === 'fulfilled') {
        (profiles.value || [])
          .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
          .forEach(p => profileAddresses.push(p.tokenAddress));
      }
      if (latestBoosts.status === 'fulfilled') {
        (latestBoosts.value || [])
          .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
          .forEach(p => profileAddresses.push(p.tokenAddress));
      }
      if (topBoosts.status === 'fulfilled') {
        (topBoosts.value || [])
          .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
          .forEach(p => profileAddresses.push(p.tokenAddress));
      }
    } catch (_) {
      // Non-fatal – fall back to KNOWN_TOKENS only
    }

    // Step 2: Merge with hardcoded known tokens (de-duplicated by token address)
    const seen = new Set();
    const allAddresses = [];
    for (const addr of [...profileAddresses, ...KNOWN_TOKENS.map(t => t.address)]) {
      const lower = addr.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        allAddresses.push(addr);
      }
    }

    // Step 3: Fetch pair data for all addresses (getPairsByAddresses deduplicates by token address)
    const rawMap = await getPairsByAddresses(allAddresses);

    // Step 3.5: For KNOWN_TOKENS pairs that have a price but lack both marketCap
    // and fdv (DexScreener omits these when it doesn't know the token's total
    // supply), fetch on-chain total supply from PulseChain BlockScout v2 and
    // compute an FDV estimate.  This prevents valid meme coins from being
    // silently dropped by the (marketCap || fdv) > 0 filter in the UI.
    const knownAddrs = new Set(KNOWN_TOKENS.map(t => t.address.toLowerCase()));
    const noCapPairs = [...rawMap.entries()].filter(
      ([addr, pair]) =>
        knownAddrs.has(addr) &&
        !pair.marketCap && !pair.fdv &&
        Number(pair.priceUsd || 0) > 0
    );

    if (noCapPairs.length > 0) {
      await Promise.allSettled(
        noCapPairs.map(async ([, pair]) => {
          try {
            const meta = await fetchJSON(
              `https://scan.pulsechain.com/api/v2/tokens/${pair.baseToken.address}`,
              8000
            );
            const decimals  = Number(meta?.decimals  || 18);
            const rawSupply = meta?.total_supply;
            if (rawSupply && rawSupply !== '0') {
              const supply = Number(rawSupply) / Math.pow(10, decimals);
              pair.fdv = supply * Number(pair.priceUsd);
            }
          } catch {
            // Non-fatal – pair remains without fdv and may still appear via volume ranking
          }
        })
      );
    }

    // Step 4: Sort by 24h volume descending – no additional filters, dedup is the only constraint
    return [...rawMap.values()].sort(
      (a, b) => Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0)
    );
  }

  /**
   * Fetch trending PulseChain pairs, sorted by 6-hour transaction activity
   * as an approximation of trending tokens.  Note: this is not an exact replica
   * of DexScreener's proprietary trendingScoreH6 — it uses (h6 buys + h6 sells)
   * as a publicly available proxy that correlates with recent trading momentum.
   * Mirrors the spirit of: https://dexscreener.com/pulsechain?rankBy=trendingScoreH6&order=desc
   * @returns {Promise<object[]>}
   */
  async function getTrendingPairs() {
    const profileAddresses = [];
    try {
      const [profiles, latestBoosts, topBoosts] = await Promise.allSettled([
        fetchJSON('https://api.dexscreener.com/token-profiles/latest/v1'),
        fetchJSON('https://api.dexscreener.com/token-boosts/latest/v1'),
        fetchJSON('https://api.dexscreener.com/token-boosts/top/v1'),
      ]);
      if (profiles.status === 'fulfilled') {
        (profiles.value || [])
          .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
          .forEach(p => profileAddresses.push(p.tokenAddress));
      }
      if (latestBoosts.status === 'fulfilled') {
        (latestBoosts.value || [])
          .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
          .forEach(p => profileAddresses.push(p.tokenAddress));
      }
      if (topBoosts.status === 'fulfilled') {
        (topBoosts.value || [])
          .filter(p => p.chainId === 'pulsechain' && p.tokenAddress)
          .forEach(p => profileAddresses.push(p.tokenAddress));
      }
    } catch (_) {
      // Non-fatal – fall back to KNOWN_TOKENS only
    }

    const seen = new Set();
    const allAddresses = [];
    for (const addr of [...profileAddresses, ...KNOWN_TOKENS.map(t => t.address)]) {
      const lower = addr.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        allAddresses.push(addr);
      }
    }

    const rawMap = await getPairsByAddresses(allAddresses);

    // Sort by 6-hour transaction count (buys + sells) as trendingScoreH6 proxy
    return [...rawMap.values()].sort((a, b) => {
      const aScore = Number(a.txns?.h6?.buys || 0) + Number(a.txns?.h6?.sells || 0);
      const bScore = Number(b.txns?.h6?.buys || 0) + Number(b.txns?.h6?.sells || 0);
      return bScore - aScore;
    });
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

  /**
   * Fetch OHLCV chart bars for a single core coin from the DexScreener chart API.
   * Returns an empty array on any error so callers can fall back gracefully.
   * @param {string} pairAddress  DEX pair contract address
   * @param {string} resolution   DexScreener chart resolution string ('D', '60', etc.)
   * @returns {Promise<Array<{time:number, open:number, high:number, low:number, close:number, volume:number}>>}
   */
  async function getCoreCoinChartBars(pairAddress, resolution) {
    const url = `${DSX_CHART_BASE}/${pairAddress}?res=${resolution}&cb=0`; // cb=0 is a cache-bust parameter
    try {
      const data = await fetchJSON(url, 10000);
      const rawBars = data?.bars || [];
      // Normalise both {time,open,...} and {t,o,...} field name conventions
      return rawBars.map(b => ({
        time:   b.time   ?? b.t ?? 0,
        open:   b.open   ?? b.o ?? 0,
        high:   b.high   ?? b.h ?? 0,
        low:    b.low    ?? b.l ?? 0,
        close:  b.close  ?? b.c ?? 0,
        volume: b.volume ?? b.v ?? 0,
      })).filter(b => b.time > 0);
    } catch {
      return [];
    }
  }

  /**
   * Fetch live pair data for the 6 core coins shown on the Home landing page
   * using the exact pair contract addresses defined in CORE_COINS.
   * Also fetches OHLCV chart bars for each coin in parallel.
   * Returns an array of { symbol, pair, chartBars, chartRes, color } objects
   * in the order defined by CORE_COINS. `pair` is null when unavailable.
   * @returns {Promise<Array<{symbol:string, pair:object|null, chartBars:object[], chartRes:string, color:string}>>}
   */
  async function getCoreCoinPairs() {
    const pairAddresses = CORE_COINS.map(c => c.pairAddress).filter(Boolean);
    const url = `${DSX_BASE}/pairs/pulsechain/${pairAddresses.join(',')}`;

    // Fetch price data and OHLCV bars in parallel
    const [pairData, ...chartResults] = await Promise.all([
      fetchJSON(url).catch(err => { console.warn('[PulseCentral] getCoreCoinPairs failed:', err); return {}; }),
      ...CORE_COINS.map(c => getCoreCoinChartBars(c.pairAddress, c.chartRes)),
    ]);

    const pairsById = new Map();
    for (const pair of (pairData.pairs || [])) {
      if (pair.pairAddress) {
        pairsById.set(pair.pairAddress.toLowerCase(), pair);
      }
    }

    return CORE_COINS.map((coin, i) => ({
      symbol:   coin.symbol,
      address:  coin.address,
      pair:     pairsById.get(coin.pairAddress.toLowerCase()) || null,
      chartBars: chartResults[i] || [],
      chartRes:  coin.chartRes,
      color:     coin.color,
    }));
  }

  /* ── Enhanced Market Data API ───────────────────────────── */

  /**
   * Fetch token security information from GoPlus Security API.
   * PulseChain chain ID is 369.
   * Returns null when the token is not found or on network error.
   * @param {string} address  Token contract address (0x-prefixed)
   * @returns {Promise<object|null>}
   */
  async function getTokenSecurity(address) {
    const addr = address.toLowerCase();
    const url = `https://api.gopluslabs.io/api/v1/token_security/369?contract_addresses=${addr}`;
    try {
      const data = await fetchJSON(url, 12000);
      if (data.code !== 1) return null;
      return data.result?.[addr] || null;
    } catch {
      return null;
    }
  }

  /**
   * Fetch token metadata (holder count, total supply, token type) from the
   * PulseChain Scan BlockScout v2 REST API.
   * Returns null on error.
   * @param {string} address  Token contract address (0x-prefixed)
   * @returns {Promise<object|null>}
   */
  async function getTokenMetadata(address) {
    const url = `https://scan.pulsechain.com/api/v2/tokens/${address}`;
    try {
      return await fetchJSON(url, 10000);
    } catch {
      return null;
    }
  }

  /**
   * Fetch recent transfer events for a specific token contract from the
   * PulseChain Scan BlockScout v2 REST API.
   * Used by the Whale Tracker to surface large token movements.
   * @param {string} address  Token contract address (0x-prefixed)
   * @returns {Promise<object[]>}  Array of BlockScout transfer objects
   */
  async function getTokenTransferHistory(address) {
    const url = `https://scan.pulsechain.com/api/v2/tokens/${address}/transfers?limit=50`;
    try {
      const data = await fetchJSON(url, 12000);
      return data?.items || [];
    } catch {
      return [];
    }
  }

  /**
   * Fetch the total supply of an ERC-20 token (raw on-chain value as a string).
   * Uses the PulseChain Scan BlockScout v1 stats endpoint.
   * Returns null on error or when the token is not found.
   * @param {string} contractAddress  Token contract address (0x-prefixed)
   * @returns {Promise<string|null>}  Raw total supply string, e.g. "1000000000000000000000000"
   */
  async function getTotalSupply(contractAddress) {
    const url = `${SCAN_BASE}?module=stats&action=tokensupply&contractaddress=${contractAddress}`;
    try {
      const data = await fetchJSON(url, 10000);
      if (data.status !== '1' || !data.result) return null;
      return data.result;
    } catch {
      return null;
    }
  }

  /* ── Public API ─────────────────────────────────────────── */
  return {
    getPlsBalance,
    getTokenList,
    getPairsByAddresses,
    getTopPulsechainPairs,
    getTrendingPairs,
    getKnownTokenPairs,
    getCoreCoinPairs,
    parseWalletTrades,
    getTokenSecurity,
    getTokenMetadata,
    getTokenTransferHistory,
    getTotalSupply,
    KNOWN_TOKENS,
    CORE_COINS,
  };
})();
