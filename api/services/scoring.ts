import type {
  FactorContribution,
  FactorVector,
  FactorWeights,
  SignalRating,
} from "../../contracts/types";

/**
 * Composite signal engine. Each factor group is normalized to -1..1 with
 * explicit, documented rules — then multiplied by the *learned* weights.
 * Nothing here is hidden: the UI exposes every contribution.
 */

const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

export interface FactorScores {
  scores: Partial<Record<keyof FactorWeights, number>>;
  details: Partial<Record<keyof FactorWeights, string>>;
}

export function computeFactorScores(f: FactorVector): FactorScores {
  const scores: FactorScores["scores"] = {};
  const details: FactorScores["details"] = {};

  // Momentum: blend of 20d & 60d returns, tanh-squashed (±20% ≈ saturated)
  if (f.momentum20d != null || f.momentum60d != null) {
    const m20 = f.momentum20d ?? 0;
    const m60 = f.momentum60d ?? m20;
    const blended = 0.6 * m20 + 0.4 * m60;
    scores.momentum = clamp(Math.tanh(blended / 12));
    details.momentum = `20d ${m20.toFixed(1)}%, 60d ${m60.toFixed(1)}%`;
  }

  // Trend: SMA alignment + RSI (overbought/oversold aware)
  if (f.aboveSma50 != null || f.rsi14 != null) {
    let s = 0;
    let n = 0;
    if (f.aboveSma50 != null) {
      s += f.aboveSma50 ? 0.4 : -0.4;
      n += 0.4;
    }
    if (f.aboveSma200 != null) {
      s += f.aboveSma200 ? 0.3 : -0.3;
      n += 0.3;
    }
    if (f.rsi14 != null) {
      // RSI: 45-65 bullish zone; >75 overbought risk; <30 oversold bounce
      const r = f.rsi14;
      const rsiScore = r >= 45 && r <= 65 ? 0.3 : r > 75 ? -0.15 : r < 30 ? 0.15 : r < 45 ? -0.1 : 0.1;
      s += rsiScore;
      n += 0.3;
    }
    scores.trend = clamp(n > 0 ? s / Math.max(n, 0.7) : 0);
    details.trend = `RSI ${f.rsi14?.toFixed(0) ?? "?"}, ${f.aboveSma50 ? "above" : "below"} SMA50, ${f.aboveSma200 ? "above" : "below"} SMA200`;
  }

  // Volume: unusual activity is mildly positive (attention), extreme is risk
  if (f.volumeRatio != null) {
    const v = f.volumeRatio;
    scores.volume = clamp(v >= 1 && v <= 2.5 ? (v - 1) * 0.5 : v > 2.5 ? 0.1 : (v - 1) * 0.3);
    details.volume = `volume ${v.toFixed(2)}× 20d avg`;
  }

  // Volatility: lower is better (risk-adjusted); >60% annualized penalized
  if (f.volatility20d != null) {
    const vol = f.volatility20d;
    scores.volatility = clamp(vol <= 25 ? 0.5 : vol <= 45 ? (45 - vol) / 40 : -Math.min(1, (vol - 45) / 40));
    details.volatility = `20d vol ${vol.toFixed(0)}% annualized`;
  }

  // Fundamentals: margin + revenue growth
  if (f.profitMargin != null || f.revenueGrowthYoY != null) {
    const pm = f.profitMargin ?? 0;
    const g = f.revenueGrowthYoY ?? 0;
    scores.fundamentals = clamp(Math.tanh(pm / 25) * 0.5 + Math.tanh(g / 20) * 0.5);
    details.fundamentals = `margin ${pm.toFixed(1)}%, rev growth ${g.toFixed(1)}% YoY`;
  }

  // Valuation: cheap vs expensive (PE-based; missing PE → neutral)
  if (f.pe != null && f.pe > 0) {
    const pe = f.pe;
    scores.valuation = clamp(pe <= 12 ? 0.7 : pe <= 20 ? 0.4 : pe <= 30 ? 0.1 : pe <= 45 ? -0.2 : -0.5);
    details.valuation = `P/E ${pe.toFixed(1)}`;
  } else if (f.pe != null && f.pe <= 0) {
    scores.valuation = -0.3;
    details.valuation = "negative earnings (P/E < 0)";
  }

  // Social sentiment: Reddit mentions + tone
  if (f.redditSentiment != null) {
    const buzz = f.redditMentions != null ? Math.min(1, f.redditMentions / 30) : 0;
    scores.socialSentiment = clamp(f.redditSentiment * (0.4 + 0.6 * buzz));
    details.socialSentiment = `${f.redditMentions ?? 0} mentions, tone ${f.redditSentiment.toFixed(2)}`;
  }

  // News sentiment
  if (f.newsSentiment != null) {
    scores.newsSentiment = clamp(f.newsSentiment);
    details.newsSentiment = `headline tone ${f.newsSentiment.toFixed(2)}`;
  }

  // Catalyst: earnings within 7d = uncertainty (slightly negative for risk,
  // but Reddit+positive momentum flips it positive — handled by interaction)
  if (f.catalystDays != null) {
    const d = f.catalystDays;
    scores.catalyst =
      d < 0 ? 0 : d <= 3 ? -0.25 : d <= 7 ? -0.15 : d <= 14 ? 0.05 : 0;
    details.catalyst = d >= 0 ? `catalyst in ${d}d` : "no known catalyst";
  }

  // Filing risk: recent material filing with negative items
  if (f.recentFilingAlert === true) {
    scores.filingRisk = -0.7;
    details.filingRisk = "material SEC filing within 5 days (negative items)";
  } else if (f.recentFilingAlert === false) {
    scores.filingRisk = 0.05;
    details.filingRisk = "no adverse filings";
  }

  return { scores, details };
}

export function composeScore(
  fs: FactorScores,
  weights: FactorWeights,
): { score: number; rating: SignalRating; confidence: number; contributions: FactorContribution[] } {
  const keys = Object.keys(weights) as (keyof FactorWeights)[];
  const wSum = keys.reduce((a, k) => a + weights[k], 0) || 1;
  const contributions: FactorContribution[] = [];
  let raw = 0;
  let availableWeight = 0;
  for (const k of keys) {
    const s = fs.scores[k];
    if (s == null) continue;
    const w = weights[k] / wSum;
    availableWeight += w;
    raw += s * w;
    contributions.push({
      key: k,
      label: k,
      raw: s,
      weight: w,
      contribution: s * w,
      detail: fs.details[k] ?? "",
    });
  }
  // Rescale by available data so missing factors don't bias toward 50
  const adjusted = availableWeight > 0 ? raw / availableWeight : 0;
  const score = Math.round((adjusted + 1) * 50);
  const rating: SignalRating =
    score >= 72
      ? "STRONG_BULLISH"
      : score >= 58
        ? "BULLISH"
        : score >= 43
          ? "NEUTRAL"
          : score >= 30
            ? "BEARISH"
            : "STRONG_BEARISH";
  contributions.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  return {
    score: Math.max(0, Math.min(100, score)),
    rating,
    confidence: availableWeight,
    contributions,
  };
}
