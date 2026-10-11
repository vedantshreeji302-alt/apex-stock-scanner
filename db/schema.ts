import {
  mysqlTable,
  serial,
  varchar,
  text,
  timestamp,
  double,
  int,
  json,
  index,
  uniqueIndex,
} from "drizzle-orm/mysql-core";
import type { Bar, FactorVector, FactorWeights } from "../contracts/types";

/** Latest price/indicator snapshot per symbol — doubles as the offline cache. */
export const snapshots = mysqlTable(
  "snapshots",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    price: double("price"),
    changePct: double("change_pct"),
    currency: varchar("currency", { length: 8 }),
    bars: json("bars").$type<Bar[]>(), // trailing daily bars used for indicators
    factors: json("factors").$type<Partial<FactorVector>>(),
    source: varchar("source", { length: 32 }).notNull(),
    asOf: timestamp("as_of").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => [uniqueIndex("snap_symbol").on(t.symbol)],
);

/** Every signal the engine emits — the raw material the learner trains on. */
export const signals = mysqlTable(
  "signals",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    score: double("score").notNull(),
    rating: varchar("rating", { length: 24 }).notNull(),
    confidence: double("confidence").notNull(),
    factors: json("factors").$type<Partial<FactorVector>>().notNull(),
    /** normalized factor scores keyed by factor-group name */
    factorScores: json("factor_scores").$type<Record<string, number>>().notNull(),
    priceAtSignal: double("price_at_signal"),
    weightVersion: int("weight_version").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    // outcome resolution (filled by the learning job)
    ret1d: double("ret_1d"),
    ret5d: double("ret_5d"),
    ret10d: double("ret_10d"),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [index("sig_symbol_created").on(t.symbol, t.createdAt)],
);

/** Versioned factor-weight vectors — the "brain" that evolves over time. */
export const factorWeights = mysqlTable("factor_weights", {
  id: serial("id").primaryKey(),
  version: int("version").notNull().unique(),
  weights: json("weights").$type<FactorWeights>().notNull(),
  reason: varchar("reason", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/** Audit log of learning runs — full transparency, nothing hidden. */
export const learningRuns = mysqlTable("learning_runs", {
  id: serial("id").primaryKey(),
  ranAt: timestamp("ran_at").notNull().defaultNow(),
  resolvedCount: int("resolved_count").notNull(),
  sampleSize: int("sample_size").notNull(),
  hitRate5d: double("hit_rate_5d"),
  factorIC: json("factor_ic").$type<Record<string, number | null>>(),
  fromVersion: int("from_version").notNull(),
  toVersion: int("to_version").notNull(),
  notes: text("notes"),
});

/** Reddit / social sentiment cache per symbol. */
export const socialCache = mysqlTable(
  "social_cache",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    mentions: int("mentions").notNull(),
    sentiment: double("sentiment"),
    bullishPct: double("bullish_pct"),
    topSubreddits: json("top_subreddits").$type<string[]>(),
    samplePosts:
      json("sample_posts").$type<
        { title: string; subreddit: string; url: string; score: number }[]
      >(),
    source: varchar("source", { length: 32 }).notNull(),
    scannedAt: timestamp("scanned_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("social_symbol").on(t.symbol)],
);

/** Known catalysts (earnings, splits, dividends, material filings). */
export const catalysts = mysqlTable(
  "catalysts",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    type: varchar("type", { length: 24 }).notNull(),
    date: varchar("date", { length: 32 }).notNull(), // ISO date string
    title: varchar("title", { length: 512 }).notNull(),
    url: varchar("url", { length: 1024 }),
    direction: varchar("direction", { length: 16 }).notNull().default("unknown"),
    source: varchar("source", { length: 32 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("cat_symbol_date").on(t.symbol, t.date)],
);

/** Recent material filings feed (SEC EDGAR). */
export const filings = mysqlTable(
  "filings",
  {
    id: serial("id").primaryKey(),
    symbol: varchar("symbol", { length: 32 }).notNull(),
    form: varchar("form", { length: 16 }).notNull(),
    filedAt: varchar("filed_at", { length: 32 }).notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    url: varchar("url", { length: 1024 }).notNull(),
    items: text("items"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("fil_symbol").on(t.symbol)],
);

/** Key-value scratch store for engine state (last scan time, provider health). */
export const engineState = mysqlTable("engine_state", {
  id: serial("id").primaryKey(),
  k: varchar("k", { length: 64 }).notNull().unique(),
  v: json("v"),
  updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
});
