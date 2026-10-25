import { type NextRequest } from 'next/server';
import { requireReviewer } from '@/lib/auth/reviewer';
import { ok, fail } from '@/lib/api/respond';
import { supabase } from '@/lib/supabase/server';
import { anchorDecision, type AnchorResult } from '@/lib/chain/anchor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  // 1. Reviewer auth
  try {
    requireReviewer(request);
  } catch (err) {
    return err as Response;
  }

  // 2. Load the latest review decision for this batch
  const { data: decision, error } = await supabase
    .from('review_decisions')
    .select('id')
    .eq('batch_id', params.id)
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !decision) {
    return fail('NO_DECISION', 'No review decision found for this batch', 404);
  }

  // 3. Anchor (idempotent)
  try {
    const record: AnchorResult = await anchorDecision(decision.id);
    return ok(record);
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'ANCHOR_FAILED';
    if (code === 'CHAIN_UNAVAILABLE') {
      return fail('CHAIN_UNAVAILABLE', 'Could not reach the blockchain network', 503);
    }
    if (code === 'NO_DECISION') {
      return fail('NO_DECISION', 'No review decision found for this batch', 404);
    }
    return fail('ANCHOR_FAILED', err instanceof Error ? err.message : 'Anchoring failed', 500);
  }
}
