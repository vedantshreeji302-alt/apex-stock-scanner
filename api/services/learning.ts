import { desc, isNull, lt, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { factorWeights, learningRuns, signals } from "@db/schema";
import {
  DEFAULT_WEIGHTS,
  type FactorWeights,
  type LearningStats,
} from "../../contracts/types";

/**
 * Self-evolving engine — completely transparent:
 *  1. Signals are stored with the factor scores that produced them.
 *  2. Once enough real time has passed, forward returns (1d/5d/10d) are
 *     resolved against actual prices.
 *  3. Per-factor Information Coefficient (Spearman corr of factor score vs
 *     realized 5d return) is computed on the resolved sample.
 *  4. Weights are nudged toward ICs (multiplicative update + renormalize),
 *     bounded so no factor can vanish or dominate, and every version is
 *     persisted with its reason. Nothing is overwritten — full history.
 */

const FACTOR_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof FactorWeights)[];

export async function getCurrentWeights(): Promise<{
  version: number;
  weights: FactorWeights;
}> {
  const db = getDb();
  const rows = await db
    .select()
    .from(factorWeights)
    .orderBy(desc(factorWeights.version))
    .limit(1);
  if (rows.length > 0) {
    return { version: rows[0].version, weights: rows[0].weights };
  }
  // bootstrap v1 with documented defaults
  await db.insert(factorWeights).values({
    version: 1,
    weights: DEFAULT_WEIGHTS,
    reason: "Initial hand-set priors (documented in contracts/types.ts)",
  });
  return { version: 1, weights: DEFAULT_WEIGHTS };
}

function rank(values: number[]): number[] {
  const sorted = values
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].v === sorted[i].v) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[sorted[k].i] = avg;
    i = j + 1;
  }
  return ranks;
}

function spearman(x: number[], y: number[]): number | null {
  if (x.length < 8) return null; // too few samples — say so, don't fake it
  const rx = rank(x);
  const ry = rank(y);
  const mx = rx.reduce((a, b) => a + b, 0) / rx.length;
  const my = ry.reduce((a, b) => a + b, 0) / ry.length;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < rx.length; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

/**
 * Resolve matured signals using a price lookup supplied by the caller
 * (kept injectable so the router can pass the live/cache price source).
 */
export async function resolveOutcomes(
  priceAt: (symbol: string, date: Date) => Promise<number | null>,
): Promise<number> {
  const db = getDb();
  const unresolved = await db
    .select()
    .from(signals)
    .where(isNull(signals.resolvedAt))
    .orderBy(desc(signals.createdAt))
    .limit(500);
  let resolved = 0;
  const now = new Date();
  for (const s of unresolved) {
    const ageMs = now.getTime() - new Date(s.createdAt).getTime();
    const ageDays = ageMs / 86400000;
    if (ageDays < 1 || s.priceAtSignal == null) continue;
    const ret = async (days: number, minAge: number) => {
      if (ageDays < minAge) return null;
      const target = new Date(
        new Date(s.createdAt).getTime() + days * 86400000,
      );
      const p = await priceAt(s.symbol, target);
      return p != null ? ((p - s.priceAtSignal!) / s.priceAtSignal!) * 100 : null;
    };
    const r1 = await ret(1, 1);
    const r5 = await ret(5, 5);
    const r10 = await ret(10, 10);
    if (r1 == null && r5 == null && r10 == null) continue;
    await db
      .update(signals)
      .set({ ret1d: r1, ret5d: r5, ret10d: r10, resolvedAt: now })
      .where(sql`id = ${s.id}`);
    resolved++;
  }
  return resolved;
}

/** Run one learning cycle: compute ICs and evolve the weight vector. */
export async function learn(
  priceAt: (symbol: string, date: Date) => Promise<number | null>,
): Promise<{ resolved: number; sampleSize: number; toVersion: number }> {
  const db = getDb();
  const resolved = await resolveOutcomes(priceAt);
  const { version, weights } = await getCurrentWeights();

  const sample = await db
    .select()
    .from(signals)
    .where(sql`ret_5d IS NOT NULL`)
    .orderBy(desc(signals.createdAt))
    .limit(2000);

  const ic: Record<string, number | null> = {};
  for (const k of FACTOR_KEYS) {
    const pairs = sample
      .map((s) => ({ x: s.factorScores?.[k], y: s.ret5d }))
      .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
    ic[k] = pairs.length >= 8 ? spearman(pairs.map((p) => p.x), pairs.map((p) => p.y)) : null;
  }

  // Directional hit rate on 5d: bullish signals (score>=58) up, bearish (<43) down
  const dir = sample.filter((s) => s.score >= 58 || s.score < 43);
  const hits = dir.filter((s) =>
    s.score >= 58 ? s.ret5d! > 0 : s.ret5d! < 0,
  ).length;
  const hitRate5d = dir.length >= 8 ? hits / dir.length : null;

  // Multiplicative update: w' ∝ w * exp(IC). Guard rails keep weights sane.
  const next: FactorWeights = { ...weights };
  let changed = false;
  for (const k of FACTOR_KEYS) {
    const v = ic[k];
    if (v == null) continue;
    const updated = weights[k] * Math.exp(Math.max(-0.5, Math.min(0.5, v)));
    next[k] = updated;
    changed = true;
  }
  const sum = FACTOR_KEYS.reduce((a, k) => a + next[k], 0);
  for (const k of FACTOR_KEYS) next[k] = next[k] / sum;
  // guard rails: no factor below 2% or above 30%
  for (const k of FACTOR_KEYS) next[k] = Math.min(0.3, Math.max(0.02, next[k]));
  const sum2 = FACTOR_KEYS.reduce((a, k) => a + next[k], 0);
  for (const k of FACTOR_KEYS) next[k] = next[k] / sum2;

  const usable = Object.values(ic).filter((v) => v != null).length >= 4;
  let toVersion = version;
  if (changed && usable && sample.length >= 30) {
    toVersion = version + 1;
    await db.insert(factorWeights).values({
      version: toVersion,
      weights: next,
      reason: `IC-driven update on ${sample.length} resolved signals (5d fwd returns)`,
    });
  }
  await db.insert(learningRuns).values({
    resolvedCount: resolved,
    sampleSize: sample.length,
    hitRate5d,
    factorIC: ic,
    fromVersion: version,
    toVersion,
    notes:
      sample.length < 30
        ? "Insufficient resolved signals (<30) — weights unchanged. Honesty over motion."
        : !usable
          ? "Too few computable ICs — weights unchanged."
          : toVersion > version
            ? "Weights updated."
            : "No material change.",
  });
  return { resolved, sampleSize: sample.length, toVersion };
}

export async function getLearningStats(): Promise<LearningStats> {
  const db = getDb();
  const { version, weights } = await getCurrentWeights();
  const totalRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(signals);
  const resolvedRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(signals)
    .where(sql`resolved_at IS NOT NULL`);
  const sample = await db
    .select()
    .from(signals)
    .where(sql`ret_5d IS NOT NULL`)
    .limit(2000);
  const dir = sample.filter((s) => s.score >= 58 || s.score < 43);
  const hit5 =
    dir.length >= 8
      ? dir.filter((s) => (s.score >= 58 ? s.ret5d! > 0 : s.ret5d! < 0)).length /
        dir.length
      : null;
  const dir1 = sample.filter((s) => s.ret1d != null && (s.score >= 58 || s.score < 43));
  const hit1 =
    dir1.length >= 8
      ? dir1.filter((s) => (s.score >= 58 ? s.ret1d! > 0 : s.ret1d! < 0)).length /
        dir1.length
      : null;
  const bull = sample.filter((s) => s.score >= 58);
  const bear = sample.filter((s) => s.score < 43);
  const avg = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  const ic: Partial<Record<keyof FactorWeights, number | null>> = {};
  for (const k of FACTOR_KEYS) {
    const pairs = sample
      .map((s) => ({ x: s.factorScores?.[k], y: s.ret5d }))
      .filter((p): p is { x: number; y: number } => p.x != null && p.y != null);
    ic[k] = pairs.length >= 8 ? spearman(pairs.map((p) => p.x), pairs.map((p) => p.y)) : null;
  }

  const hist = await db
    .select()
    .from(factorWeights)
    .orderBy(desc(factorWeights.version))
    .limit(20);
  const lastRun = await db
    .select()
    .from(learningRuns)
    .orderBy(desc(learningRuns.ranAt))
    .limit(1);

  return {
    currentWeights: weights,
    weightVersion: version,
    totalSignals: totalRows[0]?.c ?? 0,
    resolvedSignals: resolvedRows[0]?.c ?? 0,
    hitRate1d: hit1,
    hitRate5d: hit5,
    avgReturnBullish5d: avg(bull.map((s) => s.ret5d!)),
    avgReturnBearish5d: avg(bear.map((s) => s.ret5d!)),
    factorIC: ic,
    lastRunAt: lastRun[0] ? new Date(lastRun[0].ranAt).toISOString() : null,
    history: hist.map((h) => ({
      version: h.version,
      createdAt: new Date(h.createdAt).toISOString(),
      reason: h.reason,
      weights: h.weights,
    })),
  };
}

/** Purge signals older than 45 days that never resolved (data hygiene). */
export async function pruneStale(): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - 45 * 86400000);
  await db
    .delete(signals)
    .where(sql`resolved_at IS NULL AND created_at < ${cutoff}`);
  void lt;
}
