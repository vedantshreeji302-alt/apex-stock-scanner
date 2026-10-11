import { desc, eq } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  catalysts as catalystTable,
  filings as filingTable,
  signals as signalTable,
  snapshots,
  socialCache,
} from "@db/schema";
import type {
  Bar,
  CatalystEvent,
  FactorVector,
  RedditTrend,
  ScanResult,
  SourceMeta,
  StockSignal,
  UniverseEntry,
} from "../../contracts/types";
import { mapPool } from "./http";
import {
  annualizedVolatility,
  drawdownFromHigh,
  macdHistogram,
  returns,
  rsi,
  sma,
  volumeRatio,
} from "./indicators";
import { fetchBars, fetchFundamentalsYahoo, type Fundamentals } from "./market";
import { fetchFundamentalsSec, fetchRecentFilings } from "./sec";
import { scanSocial } from "./social";
import { composeScore, computeFactorScores } from "./scoring";
import { getCurrentWeights } from "./learning";
import { UNIVERSE } from "./universe";

const SCAN_CONCURRENCY = 6;
const CATALYST_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

interface CachedSnapshot {
  bars: Bar[];
  price: number | null;
  changePct: number | null;
  currency: string | null;
  source: "yahoo" | "nasdaq" | "cnbc" | "tencent" | "stooq" | "cache";
  asOf: Date;
  live: boolean;
}

async function getSnapshot(entry: UniverseEntry): Promise<CachedSnapshot> {
  const db = getDb();
  try {
    const { bars, currency, source } = await fetchBars(entry);
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2];
    const changePct = prev ? ((last.close - prev.close) / prev.close) * 100 : null;
    const asOf = new Date(last.date + "T00:00:00Z");
    // persist as cache (best-effort)
    try {
      await db
        .insert(snapshots)
        .values({
          symbol: entry.symbol,
          price: last.close,
          changePct,
          currency,
          bars,
          source,
          asOf,
        })
        .onDuplicateKeyUpdate({
          set: { price: last.close, changePct, currency, bars, source, asOf },
        });
    } catch {
      /* cache write failure must not break live data */
    }
    return { bars, price: last.close, changePct, currency, source, asOf, live: true };
  } catch {
    // honest fallback: cached snapshot from DB, clearly labeled
    const rows = await db
      .select()
      .from(snapshots)
      .where(eq(snapshots.symbol, entry.symbol))
      .limit(1);
    if (rows.length === 0 || !rows[0].bars || rows[0].bars.length < 30) {
      throw new Error(`no live or cached data for ${entry.symbol}`);
    }
    const r = rows[0];
    return {
      bars: r.bars!,
      price: r.price,
      changePct: r.changePct,
      currency: r.currency,
      source: "cache",
      asOf: new Date(r.asOf),
      live: false,
    };
  }
}

async function getSocialTrends(): Promise<{
  trends: Map<string, RedditTrend>;
  meta: { source: string; live: boolean; note?: string };
}> {
  const db = getDb();
  try {
    const { trends, source } = await scanSocial();
    // cache each trend (best-effort)
    for (const t of trends.values()) {
      try {
        await db
          .insert(socialCache)
          .values({
            symbol: t.symbol,
            mentions: t.mentions,
            sentiment: t.sentiment,
            bullishPct: t.bullishPct,
            topSubreddits: t.topSubreddits,
            samplePosts: t.samplePosts,
            source,
          })
          .onDuplicateKeyUpdate({
            set: {
              mentions: t.mentions,
              sentiment: t.sentiment,
              bullishPct: t.bullishPct,
              topSubreddits: t.topSubreddits,
              samplePosts: t.samplePosts,
              source,
              scannedAt: new Date(),
            },
          });
      } catch {
        /* ignore */
      }
    }
    return { trends, meta: { source, live: true } };
  } catch (e) {
    // fallback: cached social data
    const rows = await db.select().from(socialCache);
    if (rows.length > 0) {
      const trends = new Map<string, RedditTrend>();
      for (const r of rows) {
        trends.set(r.symbol, {
          symbol: r.symbol,
          mentions: r.mentions,
          sentiment: r.sentiment ?? 0,
          bullishPct: r.bullishPct ?? 50,
          topSubreddits: r.topSubreddits ?? [],
          samplePosts: r.samplePosts ?? [],
          meta: {
            source: "cache",
            asOf: new Date(r.scannedAt).toISOString(),
            live: false,
          },
        });
      }
      return {
        trends,
        meta: {
          source: "cache",
          live: false,
          note: `Live social scan unavailable (${e instanceof Error ? e.message : "unknown"}); showing cached mentions.`,
        },
      };
    }
    return {
      trends: new Map(),
      meta: {
        source: "unavailable",
        live: false,
        note: `Social sources unavailable: ${e instanceof Error ? e.message : "unknown"}`,
      },
    };
  }
}

const fundamentalsCache = new Map<
  string,
  { at: number; data: Fundamentals | null; secNote: boolean }
>();

/**
 * Fundamentals chain: Yahoo quoteSummary → SEC XBRL company facts (US).
 * SEC data (official filings) fills margin/growth/debt when Yahoo is down.
 */
export async function getFundamentals(
  entry: UniverseEntry,
): Promise<{ data: Fundamentals | null; secNote: boolean }> {
  const hit = fundamentalsCache.get(entry.symbol);
  if (hit && Date.now() - hit.at < CATALYST_TTL_MS)
    return { data: hit.data, secNote: hit.secNote };
  let data: Fundamentals | null = null;
  let secNote = false;
  try {
    data = await fetchFundamentalsYahoo(entry);
  } catch {
    data = null;
  }
  const needSec =
    entry.cik &&
    (!data ||
      (data.profitMargin == null &&
        data.revenueGrowthYoY == null &&
        data.debtToEquity == null));
  if (needSec) {
    try {
      const sec = await fetchFundamentalsSec(entry);
      data = {
        marketCap: data?.marketCap ?? null,
        pe: data?.pe ?? null,
        pb: data?.pb ?? null,
        profitMargin: data?.profitMargin ?? sec.profitMargin,
        revenueGrowthYoY: data?.revenueGrowthYoY ?? sec.revenueGrowthYoY,
        debtToEquity: data?.debtToEquity ?? sec.debtToEquity,
        dividendYield: data?.dividendYield ?? null,
        earningsDate: data?.earningsDate ?? null,
        exDividendDate: data?.exDividendDate ?? null,
      };
      secNote = true;
    } catch {
      /* keep yahoo-only (possibly null) */
    }
  }
  fundamentalsCache.set(entry.symbol, { at: Date.now(), data, secNote });
  return { data, secNote };
}

const filingAlertCache = new Map<string, { at: number; alert: boolean | null }>();

async function getRecentFilingAlert(entry: UniverseEntry): Promise<boolean | null> {
  if (!entry.cik) return null;
  const hit = filingAlertCache.get(entry.symbol);
  if (hit && Date.now() - hit.at < CATALYST_TTL_MS) return hit.alert;
  let alert: boolean | null = null;
  try {
    const filings = await fetchRecentFilings(entry, 5);
    const fiveDaysAgo = Date.now() - 5 * 86400000;
    alert = filings.some((f) => {
      if (!["8-K"].includes(f.form)) return false;
      const t = new Date(f.filedAt).getTime();
      if (Number.isNaN(t) || t < fiveDaysAgo) return false;
      const text = `${f.items ?? ""}`;
      return /4\.0[12]|non-reliance|restatement|going concern|delisting|3\.01|2\.04/i.test(
        text,
      );
    });
  } catch {
    alert = null;
  }
  filingAlertCache.set(entry.symbol, { at: Date.now(), alert });
  return alert;
}

function barsToFactors(bars: Bar[]): Partial<FactorVector> {
  const closes = bars.map((b) => b.close);
  const sma50 = sma(closes, 50);
  const sma200 = sma(closes, 200);
  const last = closes[closes.length - 1];
  return {
    momentum20d: returns(closes, 20),
    momentum60d: returns(closes, 60),
    rsi14: rsi(closes, 14),
    macdHist: macdHistogram(closes),
    aboveSma50: sma50 != null ? last > sma50 : null,
    aboveSma200: sma200 != null ? last > sma200 : null,
    volumeRatio: volumeRatio(bars, 20),
    volatility20d: annualizedVolatility(closes, 20),
    drawdownFrom52w: drawdownFromHigh(closes, 252),
  };
}

export async function runScan(opts?: {
  symbols?: string[];
  force?: boolean;
}): Promise<ScanResult> {
  const db = getDb();
  const { version: weightVersion, weights } = await getCurrentWeights();
  const universe = opts?.symbols?.length
    ? UNIVERSE.filter((u) => opts.symbols!.includes(u.symbol))
    : UNIVERSE;

  // social scan once for the whole universe
  const social = await getSocialTrends();

  const scannedAt = new Date().toISOString();
  const sources: Record<string, { ok: boolean; note?: string }> = {
    market: { ok: true },
    social: { ok: social.meta.live, note: social.meta.note },
  };
  let cacheMode = false;

  const results = await mapPool(universe, SCAN_CONCURRENCY, async (entry) => {
    const snap = await getSnapshot(entry);
    if (!snap.live) cacheMode = true;
    const closes = snap.bars.map((b) => b.close);
    const factors: FactorVector = {
      momentum20d: null,
      momentum60d: null,
      rsi14: null,
      macdHist: null,
      aboveSma50: null,
      aboveSma200: null,
      volumeRatio: null,
      volatility20d: null,
      drawdownFrom52w: null,
      pe: null,
      pb: null,
      profitMargin: null,
      revenueGrowthYoY: null,
      debtToEquity: null,
      redditMentions: null,
      redditSentiment: null,
      newsSentiment: null,
      catalystDays: null,
      recentFilingAlert: null,
      ...barsToFactors(snap.bars),
    };

    // social factors
    const trend = social.trends.get(entry.symbol);
    if (trend) {
      factors.redditMentions = trend.mentions;
      factors.redditSentiment = trend.meta.live || trend.meta.source === "cache" ? trend.sentiment : null;
    }

    // fundamentals (yahoo → SEC XBRL; may be null — factors stay null, honestly)
    const { data: fund, secNote } = await getFundamentals(entry);
    if (fund) {
      factors.pe = fund.pe;
      factors.pb = fund.pb;
      factors.profitMargin = fund.profitMargin;
      factors.revenueGrowthYoY = fund.revenueGrowthYoY;
      factors.debtToEquity = fund.debtToEquity;
      if (fund.earningsDate) {
        const days = Math.ceil(
          (new Date(fund.earningsDate + "T00:00:00Z").getTime() - Date.now()) /
            86400000,
        );
        factors.catalystDays = days >= 0 ? days : null;
      }
    }

    // SEC filing alert
    factors.recentFilingAlert = await getRecentFilingAlert(entry);

    const fs = computeFactorScores(factors);
    const composed = composeScore(fs, weights);

    const meta: SourceMeta = {
      source: snap.source,
      asOf: snap.asOf.toISOString(),
      live: snap.live,
      note:
        [
          snap.live
            ? null
            : `live feed unavailable — cached snapshot from ${snap.asOf.toISOString().slice(0, 10)}`,
          secNote ? "fundamentals from SEC XBRL filings" : null,
        ]
          .filter(Boolean)
          .join("; ") || undefined,
    };

    const signal: StockSignal = {
      symbol: entry.symbol,
      name: entry.name,
      exchange: entry.exchange,
      group: entry.group,
      sector: entry.sector,
      price: snap.price,
      currency: snap.currency,
      changePct: snap.changePct,
      score: composed.score,
      rating: composed.rating,
      confidence: composed.confidence,
      factors,
      contributions: composed.contributions,
      meta,
      spark: closes.slice(-30),
    };

    // persist signal for the learner (dedupe: only if >4h since last signal for symbol)
    try {
      const recent = await db
        .select()
        .from(signalTable)
        .where(eq(signalTable.symbol, entry.symbol))
        .orderBy(desc(signalTable.createdAt))
        .limit(1);
      const tooSoon =
        recent.length > 0 &&
        Date.now() - new Date(recent[0].createdAt).getTime() < 4 * 3600000;
      if (!tooSoon && snap.price != null) {
        await db.insert(signalTable).values({
          symbol: entry.symbol,
          score: signal.score,
          rating: signal.rating,
          confidence: signal.confidence,
          factors,
          factorScores: Object.fromEntries(
            Object.entries(fs.scores).filter(([, v]) => v != null),
          ) as Record<string, number>,
          priceAtSignal: snap.price,
          weightVersion,
        });
      }
    } catch {
      /* signal persistence is best-effort */
    }

    return signal;
  });

  const signals: StockSignal[] = [];
  let failed = 0;
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") signals.push(r.value);
    else failed++;
  }
  signals.sort((a, b) => b.score - a.score);
  if (failed > 0) {
    sources.market = {
      ok: failed < universe.length / 2,
      note: `${failed}/${universe.length} symbols had no live or cached data and were omitted (not fabricated).`,
    };
  }

  return {
    signals,
    meta: {
      scannedAt,
      universeSize: universe.length,
      succeeded: signals.length,
      failed,
      sources,
      cacheMode,
    },
  };
}

/** Price lookup for the learning engine: cached bars first, live fetch second. */
export async function priceAt(symbol: string, date: Date): Promise<number | null> {
  const db = getDb();
  const entry = UNIVERSE.find((u) => u.symbol === symbol);
  if (!entry) return null;
  const target = date.toISOString().slice(0, 10);
  const pick = (bars: Bar[]): number | null => {
    // first bar on/after target date (forward return from signal date)
    const after = bars.filter((b) => b.date >= target);
    if (after.length > 0) return after[0].close;
    return bars.length > 0 ? bars[bars.length - 1].close : null;
  };
  const rows = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.symbol, symbol))
    .limit(1);
  if (rows.length > 0 && rows[0].bars) {
    const p = pick(rows[0].bars);
    if (p != null) return p;
  }
  try {
    const { bars } = await fetchBars(entry);
    return pick(bars);
  } catch {
    return null;
  }
}

/** Catalyst feed: SEC filings (works) + yahoo earnings dates (when reachable). */
export async function getCatalystFeed(limit = 60): Promise<CatalystEvent[]> {
  const db = getDb();
  const out: CatalystEvent[] = [];
  const usEntries = UNIVERSE.filter((u) => u.cik);
  const results = await mapPool(usEntries.slice(0, 40), 4, async (entry) => {
    try {
      const filings = await fetchRecentFilings(entry, 4);
      return { entry, filings };
    } catch {
      return { entry, filings: [] };
    }
  });

  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000)
    .toISOString()
    .slice(0, 10);
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    const { entry, filings } = r.value;
    for (const f of filings) {
      if (f.filedAt < fourteenDaysAgo) continue;
      out.push({
        symbol: entry.symbol,
        name: entry.name,
        type:
          f.form === "8-K"
            ? "FILING_8K"
            : f.form === "10-K"
              ? "FILING_10K"
              : f.form === "10-Q"
                ? "FILING_10Q"
                : "OTHER",
        date: f.filedAt,
        title: f.items ? `SEC ${f.form} — ${f.items}` : `SEC ${f.form} filed`,
        url: f.url,
        direction: /4\.0[12]|non-reliance|restatement|going concern|delisting|3\.01|2\.04/i.test(
          f.items ?? "",
        )
          ? "negative"
          : f.form === "8-K"
            ? "unknown"
            : "neutral",
        meta: { source: "sec-edgar", asOf: f.filedAt, live: true },
      });
    }
    // upcoming earnings from yahoo fundamentals (best effort)
    try {
      const { data: fund } = await getFundamentals(entry);
      if (fund?.earningsDate && fund.earningsDate >= new Date().toISOString().slice(0, 10)) {
        out.push({
          symbol: entry.symbol,
          name: entry.name,
          type: "EARNINGS",
          date: fund.earningsDate,
          title: `${entry.name} earnings report`,
          url: null,
          direction: "unknown",
          meta: { source: "yahoo", asOf: new Date().toISOString(), live: true },
        });
      }
    } catch {
      /* skip */
    }
  }

  out.sort((a, b) => (a.date < b.date ? -1 : 1));
  // persist (best-effort, replace recent)
  try {
    for (const c of out.slice(0, 200)) {
      await db.insert(catalystTable).values({
        symbol: c.symbol,
        type: c.type,
        date: c.date,
        title: c.title.slice(0, 500),
        url: c.url,
        direction: c.direction,
        source: c.meta.source,
      });
    }
  } catch {
    /* ignore */
  }
  void filingTable;
  return out.slice(0, limit);
}
