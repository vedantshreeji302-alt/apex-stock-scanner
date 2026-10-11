export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function fmtMarketCap(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  return String(n);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function scoreColor(score: number): string {
  if (score >= 72) return "text-emerald-400";
  if (score >= 58) return "text-emerald-300";
  if (score >= 43) return "text-slate-300";
  if (score >= 30) return "text-orange-400";
  return "text-red-400";
}

export function ratingLabel(r: string): string {
  return r.replace(/_/g, " ");
}

export function ratingClasses(r: string): string {
  switch (r) {
    case "STRONG_BULLISH":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "BULLISH":
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    case "NEUTRAL":
      return "bg-slate-500/10 text-slate-300 border-slate-500/20";
    case "BEARISH":
      return "bg-orange-500/10 text-orange-400 border-orange-500/20";
    default:
      return "bg-red-500/10 text-red-400 border-red-500/20";
  }
}
