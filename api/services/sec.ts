import type { CatalystEvent, FilingItem, UniverseEntry } from "../../contracts/types";
import { fetchJson, SourceError } from "./http";

/**
 * SEC EDGAR — official US filings source (data.sec.gov / efts.sec.gov).
 * Only used for entries with a known CIK; everything is attributed.
 */

const SEC_UA = "apex-stock-scanner/1.0 (research; contact: admin@example.com)";

interface SecSubmissions {
  name?: string;
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      accessionNumber?: string[];
      primaryDocument?: string[];
      items?: string[];
    };
  };
}

const MATERIAL_FORMS = new Set([
  "8-K",
  "10-K",
  "10-Q",
  "S-1",
  "4",
  "SC 13D",
  "SC 13G",
  "DEF 14A",
]);

function formToType(form: string): FilingItem["form"] {
  return form;
}

export async function fetchRecentFilings(
  entry: UniverseEntry,
  limit = 8,
): Promise<FilingItem[]> {
  if (!entry.cik)
    throw new SourceError("sec-edgar", `no CIK for ${entry.symbol}`);
  const url = `https://data.sec.gov/submissions/CIK${entry.cik}.json`;
  const data = await fetchJson<SecSubmissions>(url, {
    source: "sec-edgar",
    ua: SEC_UA,
  });
  const r = data.filings?.recent;
  if (!r?.form) return [];
  const out: FilingItem[] = [];
  for (let i = 0; i < r.form.length && out.length < limit; i++) {
    const form = r.form[i];
    if (!MATERIAL_FORMS.has(form)) continue;
    const acc = (r.accessionNumber?.[i] ?? "").replace(/-/g, "");
    const doc = r.primaryDocument?.[i] ?? "";
    out.push({
      symbol: entry.symbol,
      form: formToType(form),
      filedAt: r.filingDate?.[i] ?? "",
      title: `${data.name ?? entry.name} — ${form}`,
      url: `https://www.sec.gov/Archives/edgar/data/${Number(entry.cik)}/${acc}/${doc}`,
      items: r.items?.[i] ?? null,
    });
  }
  return out;
}

/** Negative-signal 8-K item keywords (real SEC item descriptions). */
const NEGATIVE_ITEMS = [
  /4\.0[12]/i, // auditor change / non-reliance
  /non-reliance/i,
  /restatement/i,
  /going concern/i,
  /delisting/i,
  /2\.04/i, // triggering events that accelerate obligations
  /3\.01/i, // notice of delisting / failure to satisfy listing rule
];

export function classifyFilingDirection(
  f: FilingItem,
): "positive" | "negative" | "neutral" | "unknown" {
  if (f.form === "4") return "neutral";
  if (f.form === "10-K" || f.form === "10-Q") return "neutral";
  const text = `${f.title} ${f.items ?? ""}`;
  if (NEGATIVE_ITEMS.some((re) => re.test(text))) return "negative";
  if (f.form === "8-K") return "unknown";
  return "neutral";
}

/* ── Fundamentals from official XBRL company facts ──────────────────────── */

interface CompanyFacts {
  facts?: {
    "us-gaap"?: Record<
      string,
      {
        units?: Record<
          string,
          { fy?: number; fp?: string; form?: string; val?: number; end?: string; start?: string }[]
        >;
      }
    >;
  };
}

function annualSeries(
  facts: CompanyFacts,
  tag: string,
): { end: string; val: number }[] {
  const items =
    facts.facts?.["us-gaap"]?.[tag]?.units?.["USD"] ??
    facts.facts?.["us-gaap"]?.[tag]?.units?.["shares"] ??
    [];
  const annual = items.filter(
    (i) =>
      i.fp === "FY" &&
      i.end &&
      i.start &&
      // ~12-month periods only (avoid quarterly noise)
      Math.abs(
        (new Date(i.end).getTime() - new Date(i.start).getTime()) / 86400000 - 365,
      ) < 45,
  );
  const byEnd = new Map<string, number>();
  for (const i of annual) if (i.val != null) byEnd.set(i.end!, i.val);
  return [...byEnd.entries()]
    .map(([end, val]) => ({ end, val }))
    .sort((a, b) => (a.end < b.end ? -1 : 1));
}

function instantLatest(facts: CompanyFacts, tag: string): number | null {
  const items = facts.facts?.["us-gaap"]?.[tag]?.units?.["USD"] ?? [];
  const withVal = items.filter((i) => i.val != null && i.end);
  if (withVal.length === 0) return null;
  withVal.sort((a, b) => (a.end! < b.end! ? -1 : 1));
  return withVal[withVal.length - 1].val!;
}

export interface SecFundamentals {
  profitMargin: number | null; // %
  revenueGrowthYoY: number | null; // %
  debtToEquity: number | null; // %
  revenue: number | null;
  netIncome: number | null;
  fiscalYearEnd: string | null;
}

export async function fetchFundamentalsSec(
  entry: UniverseEntry,
): Promise<SecFundamentals> {
  if (!entry.cik)
    throw new SourceError("sec-edgar", `no CIK for ${entry.symbol}`);
  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${entry.cik}.json`;
  const facts = await fetchJson<CompanyFacts>(url, {
    source: "sec-edgar",
    ua: SEC_UA,
    timeoutMs: 15000,
  });
  const revenue =
    annualSeries(facts, "RevenueFromContractWithCustomerExcludingAssessedTax");
  const rev = revenue.length > 0 ? revenue : annualSeries(facts, "Revenues");
  const ni = annualSeries(facts, "NetIncomeLoss");
  const lastRev = rev.length > 0 ? rev[rev.length - 1] : null;
  const prevRev = rev.length > 1 ? rev[rev.length - 2] : null;
  // discard stale series (tag discontinued >18 months ago) rather than
  // presenting old figures as current
  const stale =
    lastRev != null &&
    Date.now() - new Date(lastRev.end).getTime() > 548 * 86400000;
  const liabilities =
    instantLatest(facts, "Liabilities") ??
    instantLatest(facts, "LiabilitiesCurrent");
  const equity =
    instantLatest(facts, "StockholdersEquity") ??
    instantLatest(facts, "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest");

  const growth =
    !stale && lastRev && prevRev && prevRev.val !== 0
      ? ((lastRev.val - prevRev.val) / Math.abs(prevRev.val)) * 100
      : null;
  // Only compute margin when NI and revenue cover the SAME fiscal period —
  // companies switch XBRL tags over time, mixing periods gives nonsense.
  const niByEnd = new Map(ni.map((x) => [x.end, x.val]));
  let margin: number | null = null;
  if (!stale && lastRev) {
    const sameNi = niByEnd.get(lastRev.end);
    if (sameNi != null && lastRev.val !== 0) {
      const m = (sameNi / lastRev.val) * 100;
      // sanity clamp: |margin| > 95% is almost certainly a tagging artifact
      if (Math.abs(m) <= 95) margin = m;
    }
  }
  const de =
    liabilities != null && equity != null && equity !== 0
      ? (liabilities / equity) * 100
      : null;

  if (growth == null && margin == null && de == null) {
    throw new SourceError("sec-edgar", "no usable XBRL facts");
  }
  return {
    profitMargin: margin,
    revenueGrowthYoY: growth,
    debtToEquity: de,
    revenue: stale ? null : (lastRev?.val ?? null),
    netIncome: stale ? null : (lastRev ? (niByEnd.get(lastRev.end) ?? null) : null),
    fiscalYearEnd: stale ? null : (lastRev?.end ?? null),
  };
}

/** Convert recent filings into catalyst-like events for the feed. */
export function filingsToCatalysts(
  entry: UniverseEntry,
  items: FilingItem[],
): CatalystEvent[] {
  return items
    .filter((f) => ["8-K", "10-K", "10-Q", "S-1"].includes(f.form))
    .map((f) => ({
      symbol: entry.symbol,
      name: entry.name,
      type:
        f.form === "8-K"
          ? ("FILING_8K" as const)
          : f.form === "10-K"
            ? ("FILING_10K" as const)
            : f.form === "10-Q"
              ? ("FILING_10Q" as const)
              : ("OTHER" as const),
      date: f.filedAt,
      title: f.items ? `SEC ${f.form}: ${f.items}` : `SEC ${f.form} filed`,
      url: f.url,
      direction: classifyFilingDirection(f),
      meta: {
        source: "sec-edgar" as const,
        asOf: f.filedAt,
        live: true,
      },
    }));
}
