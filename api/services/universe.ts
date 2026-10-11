import type { UniverseEntry } from "../../contracts/types";

/**
 * Global scan universe — liquid, well-known names across 10 exchange groups.
 * `cik` is only set where the mapping is certain (SEC EDGAR); null means the
 * SEC endpoints are simply not applicable, and the UI must show that honestly.
 */
export const UNIVERSE: UniverseEntry[] = [
  // ── United States (NASDAQ / NYSE) ──────────────────────────────────────
  { symbol: "AAPL", yahoo: "AAPL", stooq: "aapl.us", cik: "0000320193", name: "Apple Inc.", exchange: "NASDAQ", group: "US", sector: "Technology" },
  { symbol: "MSFT", yahoo: "MSFT", stooq: "msft.us", cik: "0000789019", name: "Microsoft Corp.", exchange: "NASDAQ", group: "US", sector: "Technology" },
  { symbol: "NVDA", yahoo: "NVDA", stooq: "nvda.us", cik: "0001045810", name: "NVIDIA Corp.", exchange: "NASDAQ", group: "US", sector: "Semiconductors" },
  { symbol: "AMZN", yahoo: "AMZN", stooq: "amzn.us", cik: "0001018724", name: "Amazon.com Inc.", exchange: "NASDAQ", group: "US", sector: "Consumer Discretionary" },
  { symbol: "GOOGL", yahoo: "GOOGL", stooq: "googl.us", cik: "0001652044", name: "Alphabet Inc.", exchange: "NASDAQ", group: "US", sector: "Communication" },
  { symbol: "META", yahoo: "META", stooq: "meta.us", cik: "0001326801", name: "Meta Platforms", exchange: "NASDAQ", group: "US", sector: "Communication" },
  { symbol: "TSLA", yahoo: "TSLA", stooq: "tsla.us", cik: "0001318605", name: "Tesla Inc.", exchange: "NASDAQ", group: "US", sector: "Consumer Discretionary" },
  { symbol: "AVGO", yahoo: "AVGO", stooq: "avgo.us", cik: "0001730168", name: "Broadcom Inc.", exchange: "NASDAQ", group: "US", sector: "Semiconductors" },
  { symbol: "ORCL", yahoo: "ORCL", stooq: "orcl.us", cik: "0001341439", name: "Oracle Corp.", exchange: "NYSE", group: "US", sector: "Technology" },
  { symbol: "AMD", yahoo: "AMD", stooq: "amd.us", cik: "0000002488", name: "Advanced Micro Devices", exchange: "NASDAQ", group: "US", sector: "Semiconductors" },
  { symbol: "NFLX", yahoo: "NFLX", stooq: "nflx.us", cik: "0001065280", name: "Netflix Inc.", exchange: "NASDAQ", group: "US", sector: "Communication" },
  { symbol: "CRM", yahoo: "CRM", stooq: "crm.us", cik: "0001108524", name: "Salesforce Inc.", exchange: "NYSE", group: "US", sector: "Technology" },
  { symbol: "ADBE", yahoo: "ADBE", stooq: "adbe.us", cik: "0000796343", name: "Adobe Inc.", exchange: "NASDAQ", group: "US", sector: "Technology" },
  { symbol: "INTC", yahoo: "INTC", stooq: "intc.us", cik: "0000050863", name: "Intel Corp.", exchange: "NASDAQ", group: "US", sector: "Semiconductors" },
  { symbol: "QCOM", yahoo: "QCOM", stooq: "qcom.us", cik: "0000804328", name: "Qualcomm Inc.", exchange: "NASDAQ", group: "US", sector: "Semiconductors" },
  { symbol: "MU", yahoo: "MU", stooq: "mu.us", cik: "0000723125", name: "Micron Technology", exchange: "NASDAQ", group: "US", sector: "Semiconductors" },
  { symbol: "PLTR", yahoo: "PLTR", stooq: "pltr.us", cik: "0001321655", name: "Palantir Technologies", exchange: "NASDAQ", group: "US", sector: "Technology" },
  { symbol: "COIN", yahoo: "COIN", stooq: "coin.us", cik: "0001679788", name: "Coinbase Global", exchange: "NASDAQ", group: "US", sector: "Financials" },
  { symbol: "SHOP", yahoo: "SHOP", stooq: "shop.us", cik: "0001594805", name: "Shopify Inc.", exchange: "NASDAQ", group: "US", sector: "Technology" },
  { symbol: "JPM", yahoo: "JPM", stooq: "jpm.us", cik: "0000019617", name: "JPMorgan Chase", exchange: "NYSE", group: "US", sector: "Financials" },
  { symbol: "BAC", yahoo: "BAC", stooq: "bac.us", cik: "0000070858", name: "Bank of America", exchange: "NYSE", group: "US", sector: "Financials" },
  { symbol: "GS", yahoo: "GS", stooq: "gs.us", cik: "0000886982", name: "Goldman Sachs", exchange: "NYSE", group: "US", sector: "Financials" },
  { symbol: "V", yahoo: "V", stooq: "v.us", cik: "0001403161", name: "Visa Inc.", exchange: "NYSE", group: "US", sector: "Financials" },
  { symbol: "MA", yahoo: "MA", stooq: "ma.us", cik: "0001141391", name: "Mastercard Inc.", exchange: "NYSE", group: "US", sector: "Financials" },
  { symbol: "BLK", yahoo: "BLK", stooq: "blk.us", cik: "0001364742", name: "BlackRock Inc.", exchange: "NYSE", group: "US", sector: "Financials" },
  { symbol: "XOM", yahoo: "XOM", stooq: "xom.us", cik: "0000034088", name: "Exxon Mobil", exchange: "NYSE", group: "US", sector: "Energy" },
  { symbol: "CVX", yahoo: "CVX", stooq: "cvx.us", cik: "0000093410", name: "Chevron Corp.", exchange: "NYSE", group: "US", sector: "Energy" },
  { symbol: "JNJ", yahoo: "JNJ", stooq: "jnj.us", cik: "0000200406", name: "Johnson & Johnson", exchange: "NYSE", group: "US", sector: "Healthcare" },
  { symbol: "LLY", yahoo: "LLY", stooq: "lly.us", cik: "0000059478", name: "Eli Lilly", exchange: "NYSE", group: "US", sector: "Healthcare" },
  { symbol: "UNH", yahoo: "UNH", stooq: "unh.us", cik: "0000731766", name: "UnitedHealth Group", exchange: "NYSE", group: "US", sector: "Healthcare" },
  { symbol: "ABBV", yahoo: "ABBV", stooq: "abbv.us", cik: "0001551152", name: "AbbVie Inc.", exchange: "NYSE", group: "US", sector: "Healthcare" },
  { symbol: "PFE", yahoo: "PFE", stooq: "pfe.us", cik: "0000078003", name: "Pfizer Inc.", exchange: "NYSE", group: "US", sector: "Healthcare" },
  { symbol: "WMT", yahoo: "WMT", stooq: "wmt.us", cik: "0000104169", name: "Walmart Inc.", exchange: "NYSE", group: "US", sector: "Consumer Staples" },
  { symbol: "COST", yahoo: "COST", stooq: "cost.us", cik: "0000909832", name: "Costco Wholesale", exchange: "NASDAQ", group: "US", sector: "Consumer Staples" },
  { symbol: "PG", yahoo: "PG", stooq: "pg.us", cik: "0000080424", name: "Procter & Gamble", exchange: "NYSE", group: "US", sector: "Consumer Staples" },
  { symbol: "KO", yahoo: "KO", stooq: "ko.us", cik: "0000021344", name: "Coca-Cola Co.", exchange: "NYSE", group: "US", sector: "Consumer Staples" },
  { symbol: "PEP", yahoo: "PEP", stooq: "pep.us", cik: "0000077476", name: "PepsiCo Inc.", exchange: "NASDAQ", group: "US", sector: "Consumer Staples" },
  { symbol: "MCD", yahoo: "MCD", stooq: "mcd.us", cik: "0000063908", name: "McDonald's Corp.", exchange: "NYSE", group: "US", sector: "Consumer Discretionary" },
  { symbol: "NKE", yahoo: "NKE", stooq: "nke.us", cik: "0000320187", name: "Nike Inc.", exchange: "NYSE", group: "US", sector: "Consumer Discretionary" },
  { symbol: "HD", yahoo: "HD", stooq: "hd.us", cik: "0000354950", name: "Home Depot", exchange: "NYSE", group: "US", sector: "Consumer Discretionary" },
  { symbol: "DIS", yahoo: "DIS", stooq: "dis.us", cik: "0001744489", name: "Walt Disney Co.", exchange: "NYSE", group: "US", sector: "Communication" },
  { symbol: "CAT", yahoo: "CAT", stooq: "cat.us", cik: "0000018230", name: "Caterpillar Inc.", exchange: "NYSE", group: "US", sector: "Industrials" },
  { symbol: "BA", yahoo: "BA", stooq: "ba.us", cik: "0000012927", name: "Boeing Co.", exchange: "NYSE", group: "US", sector: "Industrials" },
  { symbol: "GE", yahoo: "GE", stooq: "ge.us", cik: "0000040545", name: "GE Aerospace", exchange: "NYSE", group: "US", sector: "Industrials" },
  { symbol: "HON", yahoo: "HON", stooq: "hon.us", cik: "0000773840", name: "Honeywell Intl", exchange: "NASDAQ", group: "US", sector: "Industrials" },
  { symbol: "IBM", yahoo: "IBM", stooq: "ibm.us", cik: "0000051143", name: "IBM Corp.", exchange: "NYSE", group: "US", sector: "Technology" },
  { symbol: "TXN", yahoo: "TXN", stooq: "txn.us", cik: "0000097476", name: "Texas Instruments", exchange: "NASDAQ", group: "US", sector: "Semiconductors" },
  // US-listed foreign ADRs (SEC-covered)
  { symbol: "BABA", yahoo: "BABA", stooq: "baba.us", cik: "0001577552", name: "Alibaba Group (ADR)", exchange: "NYSE", group: "US", sector: "Consumer Discretionary" },
  { symbol: "TSM", yahoo: "TSM", stooq: "tsm.us", cik: "0001046179", name: "TSMC (ADR)", exchange: "NYSE", group: "US", sector: "Semiconductors" },
  { symbol: "ASML", yahoo: "ASML", stooq: "asml.us", cik: "0000937966", name: "ASML Holding (ADR)", exchange: "NASDAQ", group: "US", sector: "Semiconductors" },
  { symbol: "NVO", yahoo: "NVO", stooq: "nvo.us", cik: "0000353278", name: "Novo Nordisk (ADR)", exchange: "NYSE", group: "US", sector: "Healthcare" },
  { symbol: "TM", yahoo: "TM", stooq: "tm.us", cik: "0001094517", name: "Toyota Motor (ADR)", exchange: "NYSE", group: "US", sector: "Consumer Discretionary" },
  { symbol: "SAP", yahoo: "SAP", stooq: "sap.us", cik: "0001000184", name: "SAP SE (ADR)", exchange: "NYSE", group: "US", sector: "Technology" },
  { symbol: "AZN", yahoo: "AZN", stooq: "azn.us", cik: "0000901832", name: "AstraZeneca (ADR)", exchange: "NASDAQ", group: "US", sector: "Healthcare" },
  { symbol: "HDB", yahoo: "HDB", stooq: "hdb.us", cik: "0001144967", name: "HDFC Bank (ADR)", exchange: "NYSE", group: "US", sector: "Financials" },
  { symbol: "SHEL", yahoo: "SHEL", stooq: "shel.us", cik: "0001306965", name: "Shell plc (ADR)", exchange: "NYSE", group: "US", sector: "Energy" },

  // ── London Stock Exchange ──────────────────────────────────────────────
  { symbol: "SHEL.L", yahoo: "SHEL.L", stooq: "shell.uk", cik: null, name: "Shell plc", exchange: "LSE", group: "UK", sector: "Energy" },
  { symbol: "AZN.L", yahoo: "AZN.L", stooq: "azn.uk", cik: null, name: "AstraZeneca plc", exchange: "LSE", group: "UK", sector: "Healthcare" },
  { symbol: "HSBA.L", yahoo: "HSBA.L", stooq: "hsbc.uk", cik: null, name: "HSBC Holdings", exchange: "LSE", group: "UK", sector: "Financials" },
  { symbol: "ULVR.L", yahoo: "ULVR.L", stooq: "ulvr.uk", cik: null, name: "Unilever plc", exchange: "LSE", group: "UK", sector: "Consumer Staples" },
  { symbol: "BP.L", yahoo: "BP.L", stooq: "bp.uk", cik: null, name: "BP plc", exchange: "LSE", group: "UK", sector: "Energy" },
  { symbol: "VOD.L", yahoo: "VOD.L", stooq: "vod.uk", cik: null, name: "Vodafone Group", exchange: "LSE", group: "UK", sector: "Communication" },
  { symbol: "BARC.L", yahoo: "BARC.L", stooq: "barc.uk", cik: null, name: "Barclays plc", exchange: "LSE", group: "UK", sector: "Financials" },
  { symbol: "RIO.L", yahoo: "RIO.L", stooq: "rio.uk", cik: null, name: "Rio Tinto", exchange: "LSE", group: "UK", sector: "Materials" },

  // ── XETRA / Frankfurt ──────────────────────────────────────────────────
  { symbol: "SAP.DE", yahoo: "SAP.DE", stooq: "sap.de", cik: null, name: "SAP SE", exchange: "XETRA", group: "Germany", sector: "Technology" },
  { symbol: "SIE.DE", yahoo: "SIE.DE", stooq: "sie.de", cik: null, name: "Siemens AG", exchange: "XETRA", group: "Germany", sector: "Industrials" },
  { symbol: "ALV.DE", yahoo: "ALV.DE", stooq: "alv.de", cik: null, name: "Allianz SE", exchange: "XETRA", group: "Germany", sector: "Financials" },
  { symbol: "MBG.DE", yahoo: "MBG.DE", stooq: "mbg.de", cik: null, name: "Mercedes-Benz Group", exchange: "XETRA", group: "Germany", sector: "Consumer Discretionary" },
  { symbol: "BMW.DE", yahoo: "BMW.DE", stooq: "bmw.de", cik: null, name: "BMW AG", exchange: "XETRA", group: "Germany", sector: "Consumer Discretionary" },
  { symbol: "DTE.DE", yahoo: "DTE.DE", stooq: "dte.de", cik: null, name: "Deutsche Telekom", exchange: "XETRA", group: "Germany", sector: "Communication" },
  { symbol: "BAS.DE", yahoo: "BAS.DE", stooq: "bas.de", cik: null, name: "BASF SE", exchange: "XETRA", group: "Germany", sector: "Materials" },
  { symbol: "ADS.DE", yahoo: "ADS.DE", stooq: "ads.de", cik: null, name: "Adidas AG", exchange: "XETRA", group: "Germany", sector: "Consumer Discretionary" },

  // ── Euronext Paris ─────────────────────────────────────────────────────
  { symbol: "MC.PA", yahoo: "MC.PA", stooq: "mc.fr", cik: null, name: "LVMH", exchange: "Euronext Paris", group: "France", sector: "Consumer Discretionary" },
  { symbol: "TTE.PA", yahoo: "TTE.PA", stooq: "tte.fr", cik: null, name: "TotalEnergies", exchange: "Euronext Paris", group: "France", sector: "Energy" },
  { symbol: "OR.PA", yahoo: "OR.PA", stooq: "or.fr", cik: null, name: "L'Oréal", exchange: "Euronext Paris", group: "France", sector: "Consumer Staples" },
  { symbol: "AIR.PA", yahoo: "AIR.PA", stooq: "air.fr", cik: null, name: "Airbus SE", exchange: "Euronext Paris", group: "France", sector: "Industrials" },
  { symbol: "BNP.PA", yahoo: "BNP.PA", stooq: "bnp.fr", cik: null, name: "BNP Paribas", exchange: "Euronext Paris", group: "France", sector: "Financials" },

  // ── Tokyo Stock Exchange ───────────────────────────────────────────────
  { symbol: "7203.T", yahoo: "7203.T", stooq: "7203.jp", cik: null, name: "Toyota Motor", exchange: "TSE", group: "Japan", sector: "Consumer Discretionary" },
  { symbol: "6758.T", yahoo: "6758.T", stooq: "6758.jp", cik: null, name: "Sony Group", exchange: "TSE", group: "Japan", sector: "Consumer Discretionary" },
  { symbol: "9984.T", yahoo: "9984.T", stooq: "9984.jp", cik: null, name: "SoftBank Group", exchange: "TSE", group: "Japan", sector: "Technology" },
  { symbol: "6861.T", yahoo: "6861.T", stooq: "6861.jp", cik: null, name: "Keyence Corp.", exchange: "TSE", group: "Japan", sector: "Technology" },
  { symbol: "8306.T", yahoo: "8306.T", stooq: "8306.jp", cik: null, name: "Mitsubishi UFJ", exchange: "TSE", group: "Japan", sector: "Financials" },
  { symbol: "8035.T", yahoo: "8035.T", stooq: "8035.jp", cik: null, name: "Tokyo Electron", exchange: "TSE", group: "Japan", sector: "Semiconductors" },
  { symbol: "6501.T", yahoo: "6501.T", stooq: "6501.jp", cik: null, name: "Hitachi Ltd.", exchange: "TSE", group: "Japan", sector: "Industrials" },

  // ── Hong Kong Exchange ─────────────────────────────────────────────────
  { symbol: "0700.HK", yahoo: "0700.HK", stooq: "0700.hk", cik: null, name: "Tencent Holdings", exchange: "HKEX", group: "HongKong", sector: "Technology" },
  { symbol: "9988.HK", yahoo: "9988.HK", stooq: "9988.hk", cik: null, name: "Alibaba Group", exchange: "HKEX", group: "HongKong", sector: "Consumer Discretionary" },
  { symbol: "3690.HK", yahoo: "3690.HK", stooq: "3690.hk", cik: null, name: "Meituan", exchange: "HKEX", group: "HongKong", sector: "Consumer Discretionary" },
  { symbol: "9618.HK", yahoo: "9618.HK", stooq: "9618.hk", cik: null, name: "JD.com", exchange: "HKEX", group: "HongKong", sector: "Consumer Discretionary" },
  { symbol: "0941.HK", yahoo: "0941.HK", stooq: "0941.hk", cik: null, name: "China Mobile", exchange: "HKEX", group: "HongKong", sector: "Communication" },
  { symbol: "1299.HK", yahoo: "1299.HK", stooq: "1299.hk", cik: null, name: "AIA Group", exchange: "HKEX", group: "HongKong", sector: "Financials" },

  // ── Korea Exchange ─────────────────────────────────────────────────────
  { symbol: "005930.KS", yahoo: "005930.KS", stooq: null, cik: null, name: "Samsung Electronics", exchange: "KRX", group: "Korea", sector: "Technology" },
  { symbol: "000660.KS", yahoo: "000660.KS", stooq: null, cik: null, name: "SK Hynix", exchange: "KRX", group: "Korea", sector: "Semiconductors" },
  { symbol: "005380.KS", yahoo: "005380.KS", stooq: null, cik: null, name: "Hyundai Motor", exchange: "KRX", group: "Korea", sector: "Consumer Discretionary" },

  // ── Toronto Stock Exchange ─────────────────────────────────────────────
  { symbol: "RY.TO", yahoo: "RY.TO", stooq: "ry.ca", cik: null, name: "Royal Bank of Canada", exchange: "TSX", group: "Canada", sector: "Financials" },
  { symbol: "TD.TO", yahoo: "TD.TO", stooq: "td.ca", cik: null, name: "TD Bank", exchange: "TSX", group: "Canada", sector: "Financials" },
  { symbol: "SHOP.TO", yahoo: "SHOP.TO", stooq: null, cik: null, name: "Shopify Inc.", exchange: "TSX", group: "Canada", sector: "Technology" },
  { symbol: "ENB.TO", yahoo: "ENB.TO", stooq: "enb.ca", cik: null, name: "Enbridge Inc.", exchange: "TSX", group: "Canada", sector: "Energy" },
  { symbol: "CNR.TO", yahoo: "CNR.TO", stooq: "cnr.ca", cik: null, name: "Canadian National Railway", exchange: "TSX", group: "Canada", sector: "Industrials" },

  // ── Australian Securities Exchange ─────────────────────────────────────
  { symbol: "BHP.AX", yahoo: "BHP.AX", stooq: "bhp.au", cik: null, name: "BHP Group", exchange: "ASX", group: "Australia", sector: "Materials" },
  { symbol: "CBA.AX", yahoo: "CBA.AX", stooq: "cba.au", cik: null, name: "Commonwealth Bank", exchange: "ASX", group: "Australia", sector: "Financials" },
  { symbol: "CSL.AX", yahoo: "CSL.AX", stooq: "csl.au", cik: null, name: "CSL Limited", exchange: "ASX", group: "Australia", sector: "Healthcare" },
  { symbol: "FMG.AX", yahoo: "FMG.AX", stooq: "fmg.au", cik: null, name: "Fortescue Metals", exchange: "ASX", group: "Australia", sector: "Materials" },

  // ── National Stock Exchange of India ───────────────────────────────────
  { symbol: "RELIANCE.NS", yahoo: "RELIANCE.NS", stooq: null, cik: null, name: "Reliance Industries", exchange: "NSE", group: "India", sector: "Energy" },
  { symbol: "TCS.NS", yahoo: "TCS.NS", stooq: null, cik: null, name: "Tata Consultancy", exchange: "NSE", group: "India", sector: "Technology" },
  { symbol: "INFY.NS", yahoo: "INFY.NS", stooq: null, cik: null, name: "Infosys Ltd.", exchange: "NSE", group: "India", sector: "Technology" },
  { symbol: "HDFCBANK.NS", yahoo: "HDFCBANK.NS", stooq: null, cik: null, name: "HDFC Bank", exchange: "NSE", group: "India", sector: "Financials" },
];

export const UNIVERSE_BY_SYMBOL = new Map(UNIVERSE.map((u) => [u.symbol, u]));

/** Symbols Reddit actually discusses (US-listed mostly) — social scan scope. */
export const SOCIAL_UNIVERSE = UNIVERSE.filter((u) => u.group === "US").map(
  (u) => u.symbol,
);
