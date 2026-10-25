import { type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { ok, fail } from '@/lib/api/respond';
import { env } from '@/lib/env';
import { makeCookieValue } from '@/lib/auth/reviewer';

export async function POST(request: NextRequest): Promise<Response> {
  let body: { passcode?: string };
  try {
    body = (await request.json()) as { passcode?: string };
  } catch {
    return fail('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const passcode = body.passcode ?? '';
  const expected = env.REVIEWER_PASSCODE;

  // Constant-time comparison — pad both to the same length
  const maxLen = Math.max(passcode.length, expected.length);
  const paddedActual = Buffer.alloc(maxLen, 0);
  const paddedExpected = Buffer.alloc(maxLen, 0);
  Buffer.from(passcode, 'utf8').copy(paddedActual, 0);
  Buffer.from(expected, 'utf8').copy(paddedExpected, 0);

  const match = timingSafeEqual(paddedActual, paddedExpected) && passcode === expected;

  if (!match) {
    return fail('UNAUTHORIZED', 'Invalid passcode', 401);
  }

  const cookieValue = makeCookieValue();
  const isProd = process.env.NODE_ENV === 'production';

  const response = ok({ success: true });
  // We need to set the cookie header on the response directly since NextResponse
  // is used via the ok() helper. Build the cookie string manually.
  const cookieHeader = [
    `pc_reviewer=${cookieValue}`,
    `Max-Age=28800`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    isProd ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');

  const headers = new Headers(response.headers);
  headers.set('Set-Cookie', cookieHeader);

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}
