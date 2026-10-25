import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { fail } from '@/lib/api/respond';

const COOKIE_NAME = 'pc_reviewer';
const MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours

function hmacFor(expiry: number): string {
  return createHmac('sha256', env.SESSION_SECRET)
    .update(`reviewer:${expiry}`)
    .digest('hex');
}

/**
 * Sign a reviewer cookie.
 * @param expiry Unix timestamp (seconds) when the cookie expires
 */
export function signCookie(expiry: number): string {
  const sig = hmacFor(expiry);
  return `${expiry}.${sig}`;
}

/**
 * Verify a reviewer cookie value.
 * Returns true only if the cookie is well-formed, not expired, and the HMAC matches.
 */
export function verifyCookie(cookie: string): boolean {
  const dotIdx = cookie.indexOf('.');
  if (dotIdx === -1) return false;

  const expiryStr = cookie.slice(0, dotIdx);
  const sig = cookie.slice(dotIdx + 1);
  const expiry = parseInt(expiryStr, 10);

  if (isNaN(expiry)) return false;
  if (expiry <= Math.floor(Date.now() / 1000)) return false;

  const expected = hmacFor(expiry);

  // Constant-time comparison — pad to equal byte length
  try {
    const expectedBuf = Buffer.from(expected, 'utf8');
    const actualBuf = Buffer.alloc(expectedBuf.length);
    const sigBuf = Buffer.from(sig, 'utf8');
    sigBuf.copy(actualBuf, 0, 0, Math.min(sigBuf.length, actualBuf.length));
    return timingSafeEqual(expectedBuf, actualBuf) && sig.length === expected.length;
  } catch {
    return false;
  }
}

/**
 * Build a new cookie value with an 8-hour expiry from now.
 */
export function makeCookieValue(): string {
  const expiry = Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS;
  return signCookie(expiry);
}

/**
 * Assert the request has a valid reviewer cookie. Throws a Response (via fail())
 * if the cookie is absent or invalid.
 */
export function requireReviewer(request: NextRequest): void {
  const cookieValue = request.cookies.get(COOKIE_NAME)?.value;
  if (!cookieValue || !verifyCookie(cookieValue)) {
    throw fail('UNAUTHORIZED', 'Reviewer authentication required', 401);
  }
}
