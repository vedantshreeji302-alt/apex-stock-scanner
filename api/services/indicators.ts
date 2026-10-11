import type { Bar } from "../../contracts/types";

/** Classic technical indicators — pure math over real OHLCV bars. */

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

export function returns(values: number[], days: number): number | null {
  if (values.length < days + 1) return null;
  const last = values[values.length - 1];
  const prev = values[values.length - 1 - days];
  if (!prev) return null;
  return ((last - prev) / prev) * 100;
}

export function rsi(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  if (losses === 0) return 100;
  const rs = gains / period / (losses / period);
  return 100 - 100 / (1 + rs);
}

export function macdHistogram(closes: number[]): number | null {
  const ema = (p: number): number[] | null => {
    if (closes.length < p) return null;
    const k = 2 / (p + 1);
    let e = closes.slice(0, p).reduce((a, b) => a + b, 0) / p;
    const out = [e];
    for (let i = p; i < closes.length; i++) {
      e = closes[i] * k + e * (1 - k);
      out.push(e);
    }
    return out;
  };
  const fast = ema(12);
  const slow = ema(26);
  if (!fast || !slow) return null;
  const macdSeries: number[] = [];
  const offset = fast.length - slow.length;
  for (let i = 0; i < slow.length; i++) macdSeries.push(fast[i + offset] - slow[i]);
  if (macdSeries.length < 9) return null;
  const k = 2 / 10;
  let sig = macdSeries.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
  for (let i = 9; i < macdSeries.length; i++) {
    sig = macdSeries[i] * k + sig * (1 - k);
  }
  return macdSeries[macdSeries.length - 1] - sig;
}

export function annualizedVolatility(closes: number[], days = 20): number | null {
  if (closes.length < days + 1) return null;
  const rets: number[] = [];
  for (let i = closes.length - days; i < closes.length; i++) {
    rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / rets.length;
  return Math.sqrt(varr) * Math.sqrt(252) * 100;
}

export function drawdownFromHigh(closes: number[], lookback = 252): number | null {
  if (closes.length < 2) return null;
  const window = closes.slice(-lookback);
  const high = Math.max(...window);
  const last = window[window.length - 1];
  if (!high) return null;
  return ((last - high) / high) * 100; // negative or 0
}

export function volumeRatio(bars: Bar[], days = 20): number | null {
  if (bars.length < days + 1) return null;
  const recent = bars.slice(-days - 1, -1);
  const avg = recent.reduce((a, b) => a + b.volume, 0) / recent.length;
  if (!avg) return null;
  return bars[bars.length - 1].volume / avg;
}
