import type { RedditTrend } from "../../contracts/types";
import { fetchJson, SourceError } from "./http";
import { extractTickers, scoreText } from "./sentiment";
import { UNIVERSE_BY_SYMBOL } from "./universe";

/**
 * Social sentiment provider chain:
 *   1. Reddit public JSON (r/wallstreetbets, r/stocks, r/investing, r/StockMarket)
 *   2. Stocktwits trending API
 * Fails loudly (SourceError) so callers can use the DB cache and label it.
 */

const SUBREDDITS = ["wallstreetbets", "stocks", "investing", "StockMarket"];

interface RedditListing {
  data?: {
    children?: {
      data?: {
        title?: string;
        selftext?: string;
        score?: number;
        permalink?: string;
        subreddit?: string;
        created_utc?: number;
      };
    }[];
  };
}

export async function scanReddit(): Promise<Map<string, RedditTrend>> {
  const known = new Set(UNIVERSE_BY_SYMBOL.keys());
  const agg = new Map<
    string,
    {
      mentions: number;
      sentimentSum: number;
      weightSum: number;
      bullish: number;
      subs: Map<string, number>;
      posts: { title: string; subreddit: string; url: string; score: number }[];
      latest: number;
    }
  >();

  let anyOk = false;
  let consecutiveFails = 0;
  let lastError = "";
  for (const sub of SUBREDDITS) {
    for (const sort of ["hot", "new"] as const) {
      if (consecutiveFails >= 2) break; // fail fast when the host is blocked
      try {
        const data = await fetchJson<RedditListing>(
          `https://www.reddit.com/r/${sub}/${sort}.json?limit=100`,
          { source: "reddit", timeoutMs: 8000, ua: "apex-scanner/1.0 by /u/apex_scanner" },
        );
        anyOk = true;
        consecutiveFails = 0;
        for (const child of data.data?.children ?? []) {
          const p = child.data;
          if (!p?.title) continue;
          const text = `${p.title} ${p.selftext?.slice(0, 500) ?? ""}`;
          const tickers = extractTickers(text, known);
          if (tickers.size === 0) continue;
          const s = scoreText(text);
          const w = 1 + Math.log10(1 + Math.max(0, p.score ?? 0));
          for (const [t] of tickers) {
            const a =
              agg.get(t) ?? {
                mentions: 0,
                sentimentSum: 0,
                weightSum: 0,
                bullish: 0,
                subs: new Map<string, number>(),
                posts: [],
                latest: 0,
              };
            a.mentions += 1;
            a.sentimentSum += s * w;
            a.weightSum += w;
            if (s > 0.15) a.bullish += 1;
            a.subs.set(sub, (a.subs.get(sub) ?? 0) + 1);
            if (a.posts.length < 3 && (p.score ?? 0) > 20) {
              a.posts.push({
                title: p.title,
                subreddit: sub,
                url: `https://www.reddit.com${p.permalink ?? ""}`,
                score: p.score ?? 0,
              });
            }
            a.latest = Math.max(a.latest, p.created_utc ?? 0);
            agg.set(t, a);
          }
        }
      } catch (e) {
        consecutiveFails += 1;
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
  }
  if (!anyOk) {
    throw new SourceError("reddit", lastError || "all subreddits failed");
  }

  const now = new Date().toISOString();
  const out = new Map<string, RedditTrend>();
  for (const [symbol, a] of agg) {
    out.set(symbol, {
      symbol,
      mentions: a.mentions,
      sentiment: a.weightSum > 0 ? a.sentimentSum / a.weightSum : 0,
      bullishPct: a.mentions > 0 ? (a.bullish / a.mentions) * 100 : 50,
      topSubreddits: [...a.subs.entries()]
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([s]) => `r/${s}`),
      samplePosts: a.posts,
      meta: {
        source: "reddit",
        asOf: a.latest
          ? new Date(a.latest * 1000).toISOString()
          : now,
        live: true,
      },
    });
  }
  return out;
}

interface StocktwitsTrending {
  status?: number;
  response?: { status?: number };
  symbols?: { symbol?: string; title?: string; watchlist_count?: number }[];
}

export async function scanStocktwits(): Promise<Map<string, RedditTrend>> {
  const data = await fetchJson<StocktwitsTrending>(
    "https://api.stocktwits.com/api/2/trending/symbols.json",
    { source: "stocktwits", timeoutMs: 10000 },
  );
  const list = data.symbols ?? [];
  if (list.length === 0) throw new SourceError("stocktwits", "empty trending");
  const now = new Date().toISOString();
  const out = new Map<string, RedditTrend>();
  const max = Math.max(...list.map((s) => s.watchlist_count ?? 1), 1);
  list.forEach((s, i) => {
    const sym = s.symbol ?? "";
    if (!UNIVERSE_BY_SYMBOL.has(sym)) return;
    out.set(sym, {
      symbol: sym,
      mentions: Math.round(((list.length - i) / list.length) * 100),
      sentiment: 0, // stocktwits trending has no sentiment — honest zero/unknown
      bullishPct: 50,
      topSubreddits: ["stocktwits"],
      samplePosts: [],
      meta: {
        source: "stocktwits",
        asOf: now,
        live: true,
        note: `trending rank #${i + 1}, watchlists ${s.watchlist_count ?? "?"} of max ${max}`,
      },
    });
  });
  return out;
}

export async function scanSocial(): Promise<{
  trends: Map<string, RedditTrend>;
  source: "reddit" | "stocktwits";
}> {
  try {
    return { trends: await scanReddit(), source: "reddit" };
  } catch {
    const trends = await scanStocktwits();
    return { trends, source: "stocktwits" };
  }
}
