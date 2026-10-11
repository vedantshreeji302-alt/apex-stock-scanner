/**
 * Transparent lexicon sentiment scorer.
 * Finance lexicon (Loughran-McDonald style) + retail-trader slang.
 * Every score is reproducible from the word lists below — no black box.
 */

const POSITIVE = [
  "beat", "beats", "surge", "surges", "soar", "soars", "rally", "rallies",
  "upgrade", "upgraded", "outperform", "buy", "bullish", "profit", "profits",
  "growth", "record", "exceeds", "strong", "gain", "gains", "breakout",
  "moon", "rocket", "calls", "long", "undervalued", "squeeze", "green",
  "raises guidance", "raised guidance", "top pick", "accumulate", "yolo",
  "tendies", "diamond hands", "upside", "momentum", "rebound", "recovery",
  "dividend increase", "buyback", "approval", "approved", "partnership",
  "contract win", "blowout", "crushed earnings", "beat earnings",
];

const NEGATIVE = [
  "miss", "misses", "missed", "plunge", "plunges", "crash", "crashes",
  "downgrade", "downgraded", "underperform", "sell", "bearish", "loss",
  "losses", "decline", "falls", "fell", "drop", "drops", "weak", "warning",
  "warns", "layoffs", "lawsuit", "sued", "fraud", "investigation", "recall",
  "bankruptcy", "default", "delisting", "halt", "dilution", "offering",
  "puts", "short", "overvalued", "bubble", "red", "dump", "dumping",
  "guidance cut", "lowered guidance", "cuts guidance", "sec probe", "fine",
  "penalty", "recalls", "recall", "restatement", "going concern", "fear",
];

const NEGATORS = ["not", "no", "never", "isn't", "aren't", "don't", "won't"];

export function scoreText(text: string): number {
  const lower = ` ${text.toLowerCase()} `;
  let score = 0;
  const words = lower.split(/[^a-z']+/);
  const hasNegatorBefore = (phrase: string) => {
    const idx = lower.indexOf(phrase);
    if (idx < 0) return false;
    const before = lower.slice(Math.max(0, idx - 30), idx);
    return NEGATORS.some((n) => before.includes(` ${n} `));
  };
  for (const p of POSITIVE) {
    if (lower.includes(p)) score += hasNegatorBefore(p) ? -1 : 1;
  }
  for (const n of NEGATIVE) {
    if (lower.includes(n)) score -= hasNegatorBefore(n) ? -1 : 1;
  }
  // dampen: raw count → -1..1 via tanh
  void words;
  return Math.tanh(score / 3);
}

/** Extract cashtags and likely tickers from free text against a known set. */
export function extractTickers(
  text: string,
  known: Set<string>,
): Map<string, number> {
  const found = new Map<string, number>();
  const add = (s: string, w: number) =>
    found.set(s, (found.get(s) ?? 0) + w);
  // $TICKER cashtags — highest confidence
  for (const m of text.matchAll(/\$([A-Z]{1,6})\b/g)) {
    if (known.has(m[1])) add(m[1], 2);
  }
  // bare uppercase tokens (avoid common words)
  const STOP = new Set([
    "CEO", "CFO", "EPS", "IPO", "ETF", "SEC", "FDA", "FBI", "DOJ", "GDP",
    "CPI", "FOMC", "FED", "USA", "USD", "IMO", "LOL", "YOLO", "FOMO", "DD",
    "ATH", "ATL", "AH", "PM", "AM", "AI", "EV", "PE", "PB", "WSB", "EDIT",
    "TLDR", "THE", "AND", "FOR", "ARE", "BUT", "NOT", "YOU", "ALL", "CAN",
    "HAS", "NEW", "NOW", "OUT", "WAY", "WHO", "DID", "GET", "HIS", "HOW",
    "ITS", "MAY", "SAY", "SHE", "TOO", "USE", "HER", "HIM", "OUR", "TWO",
  ]);
  for (const m of text.matchAll(/\b([A-Z]{2,5})\b/g)) {
    const t = m[1];
    if (STOP.has(t)) continue;
    if (known.has(t)) add(t, 1);
  }
  return found;
}
