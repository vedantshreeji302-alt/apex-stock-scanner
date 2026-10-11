/** Fetch helpers with hard timeouts and honest errors — never silent fabrication. */
import https from "node:https";
import { execFile } from "node:child_process";

/** Some CDNs fingerprint Node's undici fetch (403) but accept a plain TLS
 *  request. We therefore try undici first and retry once via node:https. */
function httpsRequest(
  url: string,
  opts: { timeoutMs: number; ua: string; accept?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": opts.ua,
          Accept: opts.accept ?? "*/*",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: opts.timeoutMs,
      },
      (res) => {
        // follow one redirect
        if (
          res.statusCode &&
          [301, 302, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          res.resume();
          const loc = new URL(res.headers.location, url).toString();
          httpsRequest(loc, opts).then(resolve, reject);
          return;
        }
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

/** Last-resort transport: the system curl binary (most "browser-like"
 *  fingerprint of the three, and present in the runtime image). */
function curlGet(
  url: string,
  opts: { timeoutMs: number; ua: string; accept?: string },
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const args = [
      "-sS",
      "-L",
      "-m",
      String(Math.ceil(opts.timeoutMs / 1000)),
      "-H",
      `User-Agent: ${opts.ua}`,
      "-H",
      `Accept: ${opts.accept ?? "*/*"}`,
      "-w",
      "\n%{http_code}",
      url,
    ];
    execFile("curl", args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(err);
      const m = /(\d{3})\s*$/.exec(stdout);
      const status = m ? Number(m[1]) : 0;
      const body = m ? stdout.slice(0, stdout.length - m[0].length - 1) : stdout;
      resolve({ status, body });
    });
  });
}

/* ── Tiny circuit breaker per source so a dead provider can't stall a scan ── */
const circuits = new Map<string, { fails: number; openUntil: number }>();

export function circuitOpen(source: string): boolean {
  const c = circuits.get(source);
  return !!c && c.openUntil > Date.now();
}

function noteResult(source: string, ok: boolean) {
  const c = circuits.get(source) ?? { fails: 0, openUntil: 0 };
  if (ok) {
    circuits.set(source, { fails: 0, openUntil: 0 });
  } else {
    c.fails += 1;
    if (c.fails >= 3) {
      c.openUntil = Date.now() + 5 * 60 * 1000; // rest the source for 5 min
      c.fails = 0;
    }
    circuits.set(source, c);
  }
}

export class SourceError extends Error {
  source: string;
  constructor(source: string, message: string) {
    super(message);
    this.name = "SourceError";
    this.source = source;
  }
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export async function fetchJson<T = unknown>(
  url: string,
  opts: { timeoutMs?: number; ua?: string; source: string },
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  if (circuitOpen(opts.source)) {
    throw new SourceError(opts.source, `circuit open for ${opts.source} (recent failures)`);
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent": opts.ua ?? BROWSER_UA,
          Accept: "application/json",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as T;
      noteResult(opts.source, true);
      return data;
    } finally {
      clearTimeout(timer);
    }
  } catch (firstErr) {
    // retry via node:https (different TLS fingerprint)
    try {
      const r = await httpsRequest(url, {
        timeoutMs,
        ua: opts.ua ?? BROWSER_UA,
        accept: "application/json",
      });
      if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
      noteResult(opts.source, true);
      return JSON.parse(r.body) as T;
    } catch {
      // final fallback: system curl
      try {
        const r = await curlGet(url, {
          timeoutMs,
          ua: opts.ua ?? BROWSER_UA,
          accept: "application/json",
        });
        if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
        noteResult(opts.source, true);
        return JSON.parse(r.body) as T;
      } catch (finalErr) {
        noteResult(opts.source, false);
        throw new SourceError(
          opts.source,
          `${finalErr instanceof Error ? finalErr.message : String(finalErr)} (all transports failed; first: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}) ${url}`,
        );
      }
    }
  }
}

export async function fetchText(
  url: string,
  opts: { timeoutMs?: number; ua?: string; source: string },
): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 10000;
  if (circuitOpen(opts.source)) {
    throw new SourceError(opts.source, `circuit open for ${opts.source} (recent failures)`);
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "User-Agent": opts.ua ?? BROWSER_UA },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      noteResult(opts.source, true);
      return text;
    } finally {
      clearTimeout(timer);
    }
  } catch (firstErr) {
    try {
      const r = await httpsRequest(url, {
        timeoutMs,
        ua: opts.ua ?? BROWSER_UA,
      });
      if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
      noteResult(opts.source, true);
      return r.body;
    } catch {
      try {
        const r = await curlGet(url, { timeoutMs, ua: opts.ua ?? BROWSER_UA });
        if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
        noteResult(opts.source, true);
        return r.body;
      } catch (finalErr) {
        noteResult(opts.source, false);
        throw new SourceError(
          opts.source,
          `${finalErr instanceof Error ? finalErr.message : String(finalErr)} (all transports failed; first: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}) ${url}`,
        );
      }
    }
  }
}

/** Run promises over a pool with limited concurrency. */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return results;
}
