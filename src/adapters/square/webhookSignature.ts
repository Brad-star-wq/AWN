import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Square webhook signature verification.
 *
 * Square signs each webhook with HMAC-SHA256 over the exact bytes of
 * `notificationUrl + rawBody`, keyed by the subscription's signature key,
 * base64-encoded, and delivered in the `x-square-hmacsha256-signature`
 * header. (See Square's "Validate notifications" guide; this is the current
 * SHA-256 scheme, not the legacy SHA-1 `x-square-signature` one.)
 *
 * Two things are load-bearing and easy to get wrong:
 *
 *  1. **Verify the RAW body, byte-for-byte.** The signature is over the bytes
 *     Square sent. Parsing JSON and re-serializing it (key reordering, spacing,
 *     unicode escaping) changes those bytes and breaks the check. The webhook
 *     route must hand us the untouched request body, before any `JSON.parse`.
 *  2. **The URL must be the exact notification URL** configured on the
 *     subscription (scheme, host, path, no trailing slash drift). A proxy that
 *     rewrites the path will silently fail every signature.
 *
 * This module is pure — no I/O, no secrets baked in — so it is unit-testable
 * against a fixed known-good vector.
 */

export interface SquareSignatureInput {
  /** The subscription's signature key (from secret storage, never the repo). */
  signatureKey: string;
  /** The exact notification URL configured on the webhook subscription. */
  notificationUrl: string;
  /** The raw request body, exactly as received — NOT a re-serialized object. */
  rawBody: string | Buffer;
  /** The value of the `x-square-hmacsha256-signature` request header. */
  signatureHeader: string | null | undefined;
}

/**
 * Compute the expected Square signature for a payload. Exposed so tests (and
 * sandbox tooling) can produce a signature with the documented algorithm.
 */
export function computeSquareSignature(
  signatureKey: string,
  notificationUrl: string,
  rawBody: string | Buffer,
): string {
  const hmac = createHmac('sha256', signatureKey);
  hmac.update(notificationUrl);
  hmac.update(rawBody);
  return hmac.digest('base64');
}

/**
 * True iff the header signature matches the HMAC of (url + raw body).
 *
 * Constant-time comparison so a caller can't probe the key byte-by-byte via
 * timing. A missing header, or any length/value mismatch, returns false —
 * never throws on bad input.
 */
export function verifySquareWebhookSignature(input: SquareSignatureInput): boolean {
  const { signatureKey, notificationUrl, rawBody, signatureHeader } = input;
  if (!signatureHeader) return false;

  const expected = computeSquareSignature(signatureKey, notificationUrl, rawBody);

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(signatureHeader, 'utf8');
  // timingSafeEqual requires equal lengths; a length mismatch is already a
  // non-match, so short-circuit rather than throw.
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}
