import { ok } from '@/lib/api/respond';

export const runtime = 'nodejs';

export async function POST(): Promise<Response> {
  const response = ok({ success: true });
  const headers = new Headers(response.headers);
  // Expire the cookie immediately
  headers.set(
    'Set-Cookie',
    'pc_reviewer=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax'
  );
  return new Response(response.body, { status: response.status, headers });
}
