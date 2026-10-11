import type { Bar, UniverseEntry } from "../../contracts/types";
import { fetchJson, fetchText, SourceError } from "./http";

/**
 * Market data provider chain:
 *   1. Yahoo Finance v8 chart (daily bars, ~1y)
 *   2. Stooq daily CSV (free, no key)
 * Each function throws SourceError when the live source is down so the caller
 * can fall back to the DB cache — it never invents numbers.
 */

interface YahooChartResponse {
  chart?: {
    result?: {
      timestamp?: number[];
      meta?: { regularMarketPrice?: number; currency?: string };
      indicators?: {
        quote?: {
          open?: (number | null)[];
          high?: (number | null)[];
          low?: (number | null)[];
          close?: (number | null)[];
          volume?: (number | null)[];
        }[];
      };
    }[];
    error?: { code?: string; description?: string } | null;
  };
}

export async function fetchBarsYahoo(entry: UniverseEntry): Promise<{
  bars: Bar[];
  currency: string | null;
}> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    entry.yahoo,
  )}?range=1y&interval=1d&events=div%2Csplit`;
  const data = await fetchJson<YahooChartResponse>(url, {
    source: "yahoo",
    timeoutMs: 9000,
  });
  const result = data.chart?.result?.[0];
  if (data.chart?.error || !result) {
    throw new SourceError(
      "yahoo",
      data.chart?.error?.description ?? `no chart result for ${entry.yahoo}`,
    );
  }
  const ts = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0];
  if (!q || !q.close) throw new SourceError("yahoo", "empty quote series");
  const bars: Bar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c == null) continue;
    bars.push({
      date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
      open: q.open?.[i] ?? c,
      high: q.high?.[i] ?? c,
      low: q.low?.[i] ?? c,
      close: c,
      volume: q.volume?.[i] ?? 0,
    });
  }
  if (bars.length < 30)
    throw new SourceError("yahoo", `only ${bars.length} bars`);
  return { bars, currency: result.meta?.currency ?? null };
}

export async function fetchBarsStooq(entry: UniverseEntry): Promise<{
  bars: Bar[];
  currency: string | null;
}> {
  if (!entry.stooq) throw new SourceError("stooq", "no stooq mapping");
  const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(entry.stooq)}&i=d`;
  const csv = await fetchText(url, { source: "stooq", timeoutMs: 9000 });
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2 || !/^date/i.test(lines[0])) {
    throw new SourceError("stooq", "unexpected CSV format");
  }
  const bars: Bar[] = [];
  for (const line of lines.slice(1)) {
    const [date, o, h, l, c, v] = line.split(",");
    const close = Number(c);
    if (!date || Number.isNaN(close)) continue;
    bars.push({
      date,
      open: Number(o) || close,
      high: Number(h) || close,
      low: Number(l) || close,
      close,
      volume: Number(v) || 0,
    });
  }
  const trimmed = bars.slice(-260);
  if (trimmed.length < 30)
    throw new SourceError("stooq", `only ${trimmed.length} bars`);
  return { bars: trimmed, currency: null };
}

/* ── Nasdaq (US-listed history) ─────────────────────────────────────────── */

interface NasdaqHistorical {
  data?: {
    tradesTable?: {
      rows?: {
        date?: string;
        close?: string;
        volume?: string;
        open?: string;
        high?: string;
        low?: string;
      }[];
    };
  };
}

const num = (s?: string) => {
  if (!s) return NaN;
  return Number(s.replace(/[$,]/g, ""));
};

export async function fetchBarsNasdaq(entry: UniverseEntry): Promise<{
  bars: Bar[];
  currency: string | null;
}> {
  if (entry.group !== "US") throw new SourceError("nasdaq", "US-listed only");
  const to = new Date();
  const from = new Date(Date.now() - 370 * 86400000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(
    entry.symbol,
  )}/historical?assetclass=stocks&fromdate=${fmt(from)}&todate=${fmt(to)}&limit=370`;
  const data = await fetchJson<NasdaqHistorical>(url, {
    source: "nasdaq",
    timeoutMs: 9000,
  });
  const rows = data.data?.tradesTable?.rows ?? [];
  const bars: Bar[] = [];
  for (const r of rows) {
    const close = num(r.close);
    if (!r.date || Number.isNaN(close)) continue;
    const [mm, dd, yyyy] = r.date.split("/");
    bars.push({
      date: `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`,
      open: num(r.open) || close,
      high: num(r.high) || close,
      low: num(r.low) || close,
      close,
      volume: num(r.volume) || 0,
    });
  }
  bars.sort((a, b) => (a.date < b.date ? -1 : 1));
  if (bars.length < 30)
    throw new SourceError("nasdaq", `only ${bars.length} bars`);
  return { bars, currency: "USD" };
}

/* ── CNBC (US + international history) ──────────────────────────────────── */

export function cnbcSymbol(entry: UniverseEntry): string | null {
  const y = entry.yahoo;
  if (entry.group === "US") return y;
  const map: [RegExp, string][] = [
    [/\.L$/, "-GB"],
    [/\.DE$/, "-DE"],
    [/\.PA$/, "-FR"],
    [/\.TO$/, "-CA"],
    [/\.AX$/, "-AU"],
    [/\.NS$/, "-IN"],
  ];
  for (const [re, suffix] of map) {
    if (re.test(y)) return y.replace(re, suffix);
  }
  return null; // JP / HK / KR not covered by CNBC
}

interface CnbcChart {
  barData?: {
    priceBars?: {
      open?: string;
      high?: string;
      low?: string;
      close?: string;
      volume?: number;
      tradeTime?: string;
    }[];
  };
}

const CNBC_CURRENCY: Record<string, string> = {
  UK: "GBp",
  Germany: "EUR",
  France: "EUR",
  Canada: "CAD",
  Australia: "AUD",
  India: "INR",
  US: "USD",
};

export async function fetchBarsCnbc(entry: UniverseEntry): Promise<{
  bars: Bar[];
  currency: string | null;
}> {
  const sym = cnbcSymbol(entry);
  if (!sym) throw new SourceError("cnbc", "no CNBC mapping");
  const url = `https://ts-api.cnbc.com/harmony/app/charts/1Y.json?symbol=${encodeURIComponent(sym)}`;
  const data = await fetchJson<CnbcChart>(url, {
    source: "cnbc",
    timeoutMs: 9000,
  });
  const rows = data.barData?.priceBars ?? [];
  const bars: Bar[] = [];
  for (const r of rows) {
    const close = num(r.close);
    if (!r.tradeTime || Number.isNaN(close)) continue;
    bars.push({
      date: `${r.tradeTime.slice(0, 4)}-${r.tradeTime.slice(4, 6)}-${r.tradeTime.slice(6, 8)}`,
      open: num(r.open) || close,
      high: num(r.high) || close,
      low: num(r.low) || close,
      close,
      volume: r.volume ?? 0,
    });
  }
  if (bars.length < 30)
    throw new SourceError("cnbc", `only ${bars.length} bars`);
  return { bars, currency: CNBC_CURRENCY[entry.group] ?? null };
}

/* ── Tencent (HK + US history) ──────────────────────────────────────────── */

export function tencentSymbol(entry: UniverseEntry): string | null {
  if (entry.group === "HongKong") {
    const m = /^(\d+)\.HK$/.exec(entry.yahoo);
    return m ? `hk${m[1].padStart(5, "0")}` : null;
  }
  if (entry.group === "US") return `us${entry.yahoo}`;
  return null;
}

interface TencentKline {
  code?: number;
  data?: Record<
    string,
    { day?: [string, string, string, string, string, string][]; qfqday?: [string, string, string, string, string, string][] }
  >;
}

export async function fetchBarsTencent(entry: UniverseEntry): Promise<{
  bars: Bar[];
  currency: string | null;
}> {
  const sym = tencentSymbol(entry);
  if (!sym) throw new SourceError("tencent", "no Tencent mapping");
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},day,,,320,qfq`;
  const data = await fetchJson<TencentKline>(url, {
    source: "tencent",
    timeoutMs: 9000,
  });
  const node = data.data?.[sym];
  const rows = node?.day ?? node?.qfqday ?? [];
  const bars: Bar[] = [];
  for (const r of rows) {
    // tencent order: date, open, close, high, low, volume
    const [date, o, c, h, l, v] = r;
    const close = Number(c);
    if (!date || Number.isNaN(close)) continue;
    bars.push({
      date,
      open: Number(o) || close,
      high: Number(h) || close,
      low: Number(l) || close,
      close,
      volume: Number(v) || 0,
    });
  }
  if (bars.length < 30)
    throw new SourceError("tencent", `only ${bars.length} bars`);
  return {
    bars,
    currency: entry.group === "HongKong" ? "HKD" : "USD",
  };
}

/* ── Provider chain ─────────────────────────────────────────────────────── */

export type MarketSource = "yahoo" | "nasdaq" | "cnbc" | "tencent" | "stooq";

/** Chain: Yahoo → Nasdaq → CNBC → Tencent → Stooq. */
export async function fetchBars(entry: UniverseEntry): Promise<{
  bars: Bar[];
  currency: string | null;
  source: MarketSource;
}> {
  const providers: {
    name: MarketSource;
    fn: () => Promise<{ bars: Bar[]; currency: string | null }>;
  }[] = [
    { name: "yahoo", fn: () => fetchBarsYahoo(entry) },
    { name: "nasdaq", fn: () => fetchBarsNasdaq(entry) },
    { name: "cnbc", fn: () => fetchBarsCnbc(entry) },
    { name: "tencent", fn: () => fetchBarsTencent(entry) },
    { name: "stooq", fn: () => fetchBarsStooq(entry) },
  ];
  const errors: string[] = [];
  for (const p of providers) {
    try {
      const r = await p.fn();
      return { ...r, source: p.name };
    } catch (e) {
      errors.push(`${p.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new SourceError("market", errors.join(" | "));
}

/* ── Fundamentals ──────────────────────────────────────────────────────── */

interface YahooQuoteSummary {
  quoteSummary?: {
    result?: {
      summaryDetail?: {
        marketCap?: { raw?: number };
        trailingPE?: { raw?: number };
        priceToBook?: { raw?: number };
        dividendYield?: { raw?: number };
      };
      defaultKeyStatistics?: {
        trailingPE?: { raw?: number };
        priceToBook?: { raw?: number };
        profitMargins?: { raw?: number };
        revenueGrowth?: { raw?: number };
        debtToEquity?: { raw?: number };
      };
      financialData?: {
        profitMargins?: { raw?: number };
        revenueGrowth?: { raw?: number };
        debtToEquity?: { raw?: number };
      };
      calendarEvents?: {
        earnings?: { earningsDate?: { raw?: number }[] };
        exDividendDate?: { raw?: number };
        dividendDate?: { raw?: number };
      };
    }[];
    error?: unknown;
  };
}

export interface Fundamentals {
  marketCap: number | null;
  pe: number | null;
  pb: number | null;
  profitMargin: number | null; // %
  revenueGrowthYoY: number | null; // %
  debtToEquity: number | null;
  dividendYield: number | null; // %
  earningsDate: string | null; // ISO date
  exDividendDate: string | null;
}

export async function fetchFundamentalsYahoo(
  entry: UniverseEntry,
): Promise<Fundamentals> {
  const modules =
    "summaryDetail,defaultKeyStatistics,financialData,calendarEvents";
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    entry.yahoo,
  )}?modules=${modules}`;
  const data = await fetchJson<YahooQuoteSummary>(url, {
    source: "yahoo",
    timeoutMs: 9000,
  });
  const r = data.quoteSummary?.result?.[0];
  if (!r) throw new SourceError("yahoo", "no quoteSummary result");
  const pct = (x?: number | null) => (x == null ? null : x * 100);
  const earningsRaw = r.calendarEvents?.earnings?.earningsDate?.[0]?.raw;
  const exDivRaw = r.calendarEvents?.exDividendDate?.raw;
  return {
    marketCap: r.summaryDetail?.marketCap?.raw ?? null,
    pe:
      r.defaultKeyStatistics?.trailingPE?.raw ??
      r.summaryDetail?.trailingPE?.raw ??
      null,
    pb:
      r.defaultKeyStatistics?.priceToBook?.raw ??
      r.summaryDetail?.priceToBook?.raw ??
      null,
    profitMargin: pct(
      r.financialData?.profitMargins?.raw ??
        r.defaultKeyStatistics?.profitMargins?.raw,
    ),
    revenueGrowthYoY: pct(
      r.financialData?.revenueGrowth?.raw ??
        r.defaultKeyStatistics?.revenueGrowth?.raw,
    ),
    debtToEquity:
      r.financialData?.debtToEquity?.raw ??
      r.defaultKeyStatistics?.debtToEquity?.raw ??
      null,
    dividendYield: pct(r.summaryDetail?.dividendYield?.raw),
    earningsDate: earningsRaw
      ? new Date(earningsRaw * 1000).toISOString().slice(0, 10)
      : null,
    exDividendDate: exDivRaw
      ? new Date(exDivRaw * 1000).toISOString().slice(0, 10)
      : null,
  };
}
