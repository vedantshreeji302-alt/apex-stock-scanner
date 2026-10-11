# APEX Stock Scanner

An intelligent, self-evolving, multi-factor stock scanner dashboard covering 100+ liquid
stocks across 10 exchange groups (US, UK, Germany, France, Japan, Hong Kong, Korea,
Canada, Australia, India).

**Radical data honesty**: every figure is labeled with its source and as-of time. When a
feed is unreachable, the UI shows cached data marked as cached — or states unavailability.
Nothing is fabricated, simulated, or silently substituted.

## What it does

- **Global scanner** — composite 0–100 signal per stock from 10 factor groups: momentum,
  trend (SMA/RSI), volume, volatility, fundamentals, valuation, social sentiment, news
  sentiment, catalyst proximity, and filing risk. Every factor's weight and contribution
  is exposed in the UI.
- **Reddit Radar** — early-trend detection across r/wallstreetbets, r/stocks, r/investing
  and r/StockMarket: cashtag/ticker extraction, transparent lexicon sentiment
  (finance + retail-trader slang), mention counts, and links to the actual posts.
  Stocktwits trending is the fallback source.
- **Catalysts & risk events** — real SEC EDGAR filings (8-K/10-K/10-Q/Form 4/S-1) with
  negative-item flagging based on actual item codes (4.01/4.02 auditor changes &
  non-reliance, 3.01 delisting notices, 2.04 obligation acceleration, restatements,
  going-concern), plus scheduled earnings dates when available.
- **Fundamentals from official filings** — profit margin, revenue growth, and leverage
  computed from SEC XBRL `companyfacts` (same-period matched, staleness-discarded),
  with Yahoo fundamentals preferred when reachable.
- **Self-evolving engine** — every scan's factor scores are stored; after 1/5/10 trading
  days the engine resolves real forward returns, computes per-factor Information
  Coefficients (Spearman rank correlation vs realized 5-day returns), and multiplicatively
  re-weights factors with guard rails (2%–30%). All weight versions and learning runs are
  persisted and shown. If the resolved sample is too small (<30), the engine refuses to
  change and says so.

## Data providers (fallback chain, per data type)

| Data | Providers (in order) |
|------|----------------------|
| Prices / history | Yahoo Finance → Nasdaq → CNBC → Tencent (HK/US) → Stooq → DB cache |
| Fundamentals | Yahoo quoteSummary → SEC XBRL companyfacts (US) |
| Filings / catalysts | SEC EDGAR (submissions API) |
| Social sentiment | Reddit public JSON → Stocktwits trending → DB cache |

Provider calls use a three-transport strategy (undici fetch → node:https → system curl)
plus per-source circuit breakers, because several CDNs fingerprint server-side clients
differently.

## Stack

- **Frontend**: React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui + Recharts
- **Backend**: Hono + tRPC 11 + Drizzle ORM (MySQL)
- **Shared contracts**: `contracts/types.ts`

## Run

```bash
npm install
npm run db:push   # sync schema (needs DATABASE_URL in .env)
npm run dev       # http://localhost:3000
```

Production:

```bash
npm run build
npm start         # serves API + built SPA on :3000
# or: docker build -t apex-scanner . && docker run -p 3000:3000 apex-scanner
```

> Note: `src/components/ui/*` are stock shadcn/ui components scaffolded by the official
> CLI (`npx shadcn@latest add <component>`). `.env` (database credentials) is deliberately
> not committed.

## Layout

```
api/services/    provider clients, indicators, scoring, learning, scan orchestrator
api/router.ts    tRPC procedures
contracts/       shared types (source-labeled payloads)
db/schema.ts     snapshots, signals, factor_weights, learning_runs, social, catalysts
src/sections/    Scanner / Reddit Radar / Catalysts / AI Brain tabs
src/components/  stock drawer, gauges, sparklines, source badges
```

## Disclaimer

Scores are analytical signals computed from public data — not investment advice.
The learning engine is genuinely adaptive but small-sample statistics are noisy;
past factor IC does not guarantee future predictive power.
