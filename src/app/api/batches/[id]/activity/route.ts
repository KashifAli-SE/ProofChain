import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/api/respond';
import { appendAudit } from '@/lib/audit/log';
import { activityDataSchema } from '@/lib/agents/schemas';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const batchId = params.id;

  // Verify batch exists
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('id')
    .eq('id', batchId)
    .single();

  if (batchError || !batch) {
    return fail('BATCH_NOT_FOUND', `No batch found with id '${batchId}'`, 404);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail('INVALID_JSON', 'Request body must be valid JSON');
  }

  const parsed = activityDataSchema.safeParse(body);
  if (!parsed.success) {
    return fail('VALIDATION_ERROR', parsed.error.issues[0]?.message ?? 'Invalid activity data');
  }

  const { error: updateError } = await supabase
    .from('batches')
    .update({ activity_data: parsed.data })
    .eq('id', batchId);

  if (updateError) {
    return fail('DB_ERROR', 'Failed to update activity data', 500);
  }

  await appendAudit(batchId, 'activity_data_updated', { fields: Object.keys(parsed.data) });

  return ok({ updated: true });
}
