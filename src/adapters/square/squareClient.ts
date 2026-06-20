import { setTimeout as sleepMs } from 'node:timers/promises';

/**
 * Minimal Square HTTP client — the cross-cutting concerns from connector
 * walkthrough Part 4, in one place so every Square write inherits them:
 *
 *  - **Pinned `Square-Version`** on every request (Square is version-scoped).
 *  - **Bearer auth** from a token that lives only in secret storage.
 *  - **429 / 5xx retry** with exponential backoff (honours `Retry-After`).
 *    Catalog updates are one-at-a-time per seller, so an occasional 429 is
 *    expected and must be retried, not surfaced as a hard failure.
 *  - **Sandbox vs production base URL** by config; defaults to sandbox and
 *    refuses production unless explicitly asked.
 *
 * Idempotency keys are passed per write in the body (Square's catalog/payment
 * upserts take an `idempotency_key`), not here.
 */

export const SQUARE_SANDBOX_BASE = 'https://connect.squareupsandbox.com';
export const SQUARE_PRODUCTION_BASE = 'https://connect.squareup.com';
export const SQUARE_VERSION = '2026-01-22';

export class SquareApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string,
  ) {
    super(`Square ${path} failed ${status}: ${body}`);
    this.name = 'SquareApiError';
  }
}

export interface SquareClientOptions {
  accessToken: string;
  baseUrl?: string;
  version?: string;
  /** Retries after the first attempt for 429/5xx. Default 4. */
  maxRetries?: number;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Base backoff in ms (default 250). */
  baseDelayMs?: number;
}

export class SquareClient {
  private readonly base: string;
  private readonly version: string;
  private readonly token: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly baseDelayMs: number;

  constructor(opts: SquareClientOptions) {
    this.token = opts.accessToken;
    this.base = opts.baseUrl ?? SQUARE_SANDBOX_BASE;
    this.version = opts.version ?? SQUARE_VERSION;
    this.maxRetries = opts.maxRetries ?? 4;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => sleepMs(ms));
    this.baseDelayMs = opts.baseDelayMs ?? 250;
  }

  get baseUrl(): string {
    return this.base;
  }

  post(path: string, body: unknown): Promise<unknown> {
    return this.request('POST', path, body);
  }

  get(path: string): Promise<unknown> {
    return this.request('GET', path);
  }

  delete(path: string): Promise<unknown> {
    return this.request('DELETE', path);
  }

  private backoffMs(attempt: number, retryAfterHeader: string | null): number {
    const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : NaN;
    if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000;
    const exp = this.baseDelayMs * 2 ** attempt;
    return Math.min(exp, 8000) + Math.floor(Math.random() * 100); // jitter
  }

  private async request(method: string, path: string, body?: unknown): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Square-Version': this.version,
      Accept: 'application/json',
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let lastError = '';
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers,
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });

      if (res.ok) {
        const text = await res.text();
        return text ? (JSON.parse(text) as unknown) : {};
      }

      lastError = await res.text();
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < this.maxRetries) {
        await this.sleep(this.backoffMs(attempt, res.headers.get('Retry-After')));
        continue;
      }
      throw new SquareApiError(res.status, lastError, path);
    }
    // Unreachable: the loop either returns or throws. Satisfies the type checker.
    throw new SquareApiError(0, lastError, path);
  }
}

/**
 * Build a client from env. Token from `SQUARE_ACCESS_TOKEN` (or
 * `SQUARE_SANDBOX_ACCESS_TOKEN`). Defaults to **sandbox**; only `SQUARE_ENV=production`
 * selects production, so a stray run can never hit the real catalog by accident.
 */
export function squareClientFromEnv(env: NodeJS.ProcessEnv = process.env): SquareClient {
  const accessToken = env.SQUARE_ACCESS_TOKEN ?? env.SQUARE_SANDBOX_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error('Set SQUARE_ACCESS_TOKEN (or SQUARE_SANDBOX_ACCESS_TOKEN) — never in the repo.');
  }
  const baseUrl = env.SQUARE_ENV === 'production' ? SQUARE_PRODUCTION_BASE : SQUARE_SANDBOX_BASE;
  return new SquareClient({ accessToken, baseUrl });
}
