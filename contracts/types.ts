/**
 * APEX Stock Scanner — shared contracts between frontend and backend.
 * Every data payload carries its source + as-of timestamp: nothing is
 * fabricated; when a source is down the UI must say so explicitly.
 */

export type DataSource =
  | "yahoo"
  | "nasdaq"
  | "cnbc"
  | "tencent"
  | "stooq"
  | "sec-edgar"
  | "reddit"
  | "stocktwits"
  | "cache"
  | "unavailable";

export interface SourceMeta {
  source: DataSource;
  asOf: string; // ISO timestamp of the underlying data
  live: boolean; // true if fetched live this request, false if from cache
  note?: string;
}

export type ExchangeGroup =
  | "US"
  | "UK"
  | "Germany"
  | "France"
  | "Japan"
  | "HongKong"
  | "Korea"
  | "Canada"
  | "Australia"
  | "India";

export interface UniverseEntry {
  symbol: string; // canonical display symbol, e.g. "AAPL", "7203.T"
  yahoo: string; // yahoo symbol
  stooq: string | null; // stooq symbol if known
  cik: string | null; // SEC CIK (10-digit, zero-padded) for US-listed
  name: string;
  exchange: string; // e.g. "NASDAQ", "TSE", "LSE"
  group: ExchangeGroup;
  sector: string;
}

/** OHLCV daily bar */
export interface Bar {
  date: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Raw computed factor inputs for one stock (all values real, computed from data) */
export interface FactorVector {
  momentum20d: number | null; // 20d return %
  momentum60d: number | null;
  rsi14: number | null;
  macdHist: number | null;
  aboveSma50: boolean | null;
  aboveSma200: boolean | null;
  volumeRatio: number | null; // last volume / 20d avg volume
  volatility20d: number | null; // annualized %
  drawdownFrom52w: number | null; // % below 52w high
  pe: number | null;
  pb: number | null;
  profitMargin: number | null; // %
  revenueGrowthYoY: number | null; // %
  debtToEquity: number | null;
  redditMentions: number | null; // mentions in lookback window
  redditSentiment: number | null; // -1..1
  newsSentiment: number | null; // -1..1
  catalystDays: number | null; // days to nearest known catalyst (earnings etc.)
  recentFilingAlert: boolean | null; // 8-K / material filing within 5 days
}

/** Learnable weights — one per factor group. Must sum ~1 (soft-normalized at use). */
export interface FactorWeights {
  momentum: number;
  trend: number;
  volume: number;
  volatility: number;
  fundamentals: number;
  valuation: number;
  socialSentiment: number;
  newsSentiment: number;
  catalyst: number;
  filingRisk: number;
}

export interface FactorContribution {
  key: keyof FactorWeights;
  label: string;
  raw: number; // normalized factor score -1..1
  weight: number; // weight used
  contribution: number; // raw * weight
  detail: string; // human-readable explanation, e.g. "RSI 71 (overbought risk)"
}

export type SignalRating =
  | "STRONG_BULLISH"
  | "BULLISH"
  | "NEUTRAL"
  | "BEARISH"
  | "STRONG_BEARISH";

export interface StockSignal {
  symbol: string;
  name: string;
  exchange: string;
  group: ExchangeGroup;
  sector: string;
  price: number | null;
  currency: string | null;
  changePct: number | null; // last daily change %
  score: number; // 0..100 composite
  rating: SignalRating;
  confidence: number; // 0..1 — fraction of factors that had real data
  factors: FactorVector;
  contributions: FactorContribution[];
  meta: SourceMeta;
  spark: number[]; // last ~30 closes for sparkline
}

export interface RedditTrend {
  symbol: string;
  mentions: number;
  sentiment: number; // -1..1 weighted
  bullishPct: number;
  topSubreddits: string[];
  samplePosts: { title: string; subreddit: string; url: string; score: number }[];
  meta: SourceMeta;
}

export type CatalystType =
  | "EARNINGS"
  | "DIVIDEND"
  | "SPLIT"
  | "FILING_8K"
  | "FILING_10K"
  | "FILING_10Q"
  | "INSIDER"
  | "OTHER";

export interface CatalystEvent {
  symbol: string;
  name: string;
  type: CatalystType;
  date: string; // ISO date
  title: string;
  url: string | null;
  direction: "positive" | "negative" | "neutral" | "unknown";
  meta: SourceMeta;
}

export interface FilingItem {
  symbol: string;
  form: string;
  filedAt: string;
  title: string;
  url: string;
  items: string | null; // 8-K item descriptions
}

export interface LearningStats {
  currentWeights: FactorWeights;
  weightVersion: number;
  totalSignals: number;
  resolvedSignals: number;
  hitRate1d: number | null; // directional accuracy, resolved 1d
  hitRate5d: number | null;
  avgReturnBullish5d: number | null; // avg 5d fwd return of BULLISH+ signals %
  avgReturnBearish5d: number | null;
  factorIC: Partial<Record<keyof FactorWeights, number | null>>; // information coefficient per factor
  lastRunAt: string | null;
  history: {
    version: number;
    createdAt: string;
    reason: string;
    weights: FactorWeights;
  }[];
}

export interface StockDetail {
  signal: StockSignal;
  bars: Bar[]; // ~6 months daily
  filings: FilingItem[];
  catalysts: CatalystEvent[];
  reddit: RedditTrend | null;
  fundamentals: {
    marketCap: number | null;
    pe: number | null;
    pb: number | null;
    profitMargin: number | null;
    revenueGrowthYoY: number | null;
    debtToEquity: number | null;
    dividendYield: number | null;
  } | null;
}

export interface ScanResult {
  signals: StockSignal[];
  meta: {
    scannedAt: string;
    universeSize: number;
    succeeded: number;
    failed: number;
    sources: Record<string, { ok: boolean; note?: string }>;
    cacheMode: boolean;
  };
}

export const RATING_ORDER: SignalRating[] = [
  "STRONG_BULLISH",
  "BULLISH",
  "NEUTRAL",
  "BEARISH",
  "STRONG_BEARISH",
];

export const DEFAULT_WEIGHTS: FactorWeights = {
  momentum: 0.14,
  trend: 0.12,
  volume: 0.08,
  volatility: 0.07,
  fundamentals: 0.14,
  valuation: 0.1,
  socialSentiment: 0.12,
  newsSentiment: 0.08,
  catalyst: 0.09,
  filingRisk: 0.06,
};
