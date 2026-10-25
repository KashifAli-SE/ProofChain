import { type NextRequest } from 'next/server';
import { verifyCookie } from '@/lib/auth/reviewer';
import { ok, fail } from '@/lib/api/respond';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<Response> {
  const cookieValue = request.cookies.get('pc_reviewer')?.value;
  if (!cookieValue || !verifyCookie(cookieValue)) {
    return fail('UNAUTHORIZED', 'Not authenticated', 401);
  }
  return ok({ authenticated: true });
}
