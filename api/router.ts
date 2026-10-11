import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import { runScan, getCatalystFeed, priceAt, getFundamentals } from "./services/scan";
import { getLearningStats, learn } from "./services/learning";
import { scanSocial } from "./services/social";
import { fetchBars } from "./services/market";
import { fetchRecentFilings } from "./services/sec";
import { UNIVERSE_BY_SYMBOL } from "./services/universe";
import { getDb } from "./queries/connection";
import { engineState, socialCache } from "@db/schema";
import { eq } from "drizzle-orm";
import type { RedditTrend, ScanResult, StockDetail } from "../contracts/types";

async function getStateJson<T>(k: string): Promise<T | null> {
  const rows = await getDb()
    .select()
    .from(engineState)
    .where(eq(engineState.k, k))
    .limit(1);
  return rows.length > 0 ? (rows[0].v as T) : null;
}

async function setStateJson(k: string, v: unknown): Promise<void> {
  await getDb()
    .insert(engineState)
    .values({ k, v: v as Record<string, never> })
    .onDuplicateKeyUpdate({ set: { v: v as Record<string, never> } });
}

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),

  scan: createRouter({
    /** Run a fresh scan (slow, ~30-60s) and cache the result. */
    run: publicQuery
      .input(z.object({ symbols: z.array(z.string()).optional() }).optional())
      .mutation(async ({ input }) => {
        const result = await runScan({ symbols: input?.symbols, force: true });
        await setStateJson("lastScan", result);
        return result;
      }),
    /** Last cached scan result (fast); null if never scanned. */
    latest: publicQuery.query(async () => {
      return await getStateJson<ScanResult>("lastScan");
    }),
  }),

  social: createRouter({
    trends: publicQuery.query(async () => {
      try {
        const { trends, source } = await scanSocial();
        return {
          trends: [...trends.values()].sort((a, b) => b.mentions - a.mentions),
          meta: { source, live: true as const },
        };
      } catch (e) {
        const rows = await getDb().select().from(socialCache);
        if (rows.length > 0) {
          const trends: RedditTrend[] = rows.map((r) => ({
            symbol: r.symbol,
            mentions: r.mentions,
            sentiment: r.sentiment ?? 0,
            bullishPct: r.bullishPct ?? 50,
            topSubreddits: r.topSubreddits ?? [],
            samplePosts: r.samplePosts ?? [],
            meta: {
              source: "cache" as const,
              asOf: new Date(r.scannedAt).toISOString(),
              live: false,
            },
          }));
          trends.sort((a, b) => b.mentions - a.mentions);
          return {
            trends,
            meta: {
              source: "cache" as const,
              live: false as const,
              note: `Live social sources unavailable (${e instanceof Error ? e.message : "unknown"}); showing cached data.`,
            },
          };
        }
        return {
          trends: [] as RedditTrend[],
          meta: {
            source: "unavailable" as const,
            live: false as const,
            note: `Social sources unavailable: ${e instanceof Error ? e.message : "unknown"}`,
          },
        };
      }
    }),
  }),

  catalysts: createRouter({
    list: publicQuery.query(() => getCatalystFeed(60)),
  }),

  brain: createRouter({
    stats: publicQuery.query(() => getLearningStats()),
    learn: publicQuery.mutation(() => learn(priceAt)),
  }),

  stock: createRouter({
    detail: publicQuery
      .input(z.object({ symbol: z.string() }))
      .query(async ({ input }): Promise<StockDetail | null> => {
        const entry = UNIVERSE_BY_SYMBOL.get(input.symbol);
        if (!entry) return null;

        // bars (live → cache)
        let bars = [] as StockDetail["bars"];
        try {
          bars = (await fetchBars(entry)).bars.slice(-130);
        } catch {
          const last = await getStateJson<ScanResult>("lastScan");
          const sig = last?.signals.find((s) => s.symbol === input.symbol);
          if (sig) {
            bars = sig.spark.map((close, i) => ({
              date: `d-${sig.spark.length - i}`,
              open: close,
              high: close,
              low: close,
              close,
              volume: 0,
            }));
          }
        }

        // reuse latest scan signal if present, else a minimal one
        const last = await getStateJson<ScanResult>("lastScan");
        let signal = last?.signals.find((s) => s.symbol === input.symbol);
        if (!signal) {
          const mini = await runScan({ symbols: [input.symbol] });
          signal = mini.signals[0];
        }
        if (!signal) return null;

        // filings + fundamentals (best effort, honest nulls)
        let filings: StockDetail["filings"] = [];
        try {
          filings = await fetchRecentFilings(entry, 10);
        } catch {
          filings = [];
        }
        let fundamentals: StockDetail["fundamentals"] = null;
        try {
          const { data: f } = await getFundamentals(entry);
          if (f) {
            fundamentals = {
              marketCap: f.marketCap,
              pe: f.pe,
              pb: f.pb,
              profitMargin: f.profitMargin,
              revenueGrowthYoY: f.revenueGrowthYoY,
              debtToEquity: f.debtToEquity,
              dividendYield: f.dividendYield,
            };
          }
        } catch {
          fundamentals = null;
        }

        // social trend for this symbol
        let reddit: StockDetail["reddit"] = null;
        const rows = await getDb()
          .select()
          .from(socialCache)
          .where(eq(socialCache.symbol, input.symbol))
          .limit(1);
        if (rows.length > 0) {
          const r = rows[0];
          reddit = {
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
          };
        }

        const catalysts = (await getCatalystFeed(60)).filter(
          (c) => c.symbol === input.symbol,
        );

        return { signal, bars, filings, catalysts, reddit, fundamentals };
      }),
  }),
});

export type AppRouter = typeof appRouter;
