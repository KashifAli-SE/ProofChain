import { supabase } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/api/respond';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CAVEAT =
  'A blockchain record proves this decision was not altered after it was recorded. It does not prove the underlying claims are true.';

export async function GET(
  _req: Request,
  { params }: { params: { batchCode: string } }
): Promise<Response> {
  // (a) Load the batch with its product.
  const { data: batch, error } = await supabase
    .from('batches')
    .select(
      'id, batch_code, status, is_demo, production_date, claims, products ( product_name, supplier_name, category )'
    )
    .eq('batch_code', params.batchCode)
    .maybeSingle();

  if (error || !batch) {
    return fail('BATCH_NOT_FOUND', `No batch found with code '${params.batchCode}'`, 404);
  }

  // (b) Latest review decision for this batch.
  const { data: latestDecision } = await supabase
    .from('review_decisions')
    .select('id, decided_at, record_hash')
    .eq('batch_id', batch.id)
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // (c) Blockchain record (explorer link) for that decision, if any.
  let explorer_url: string | null = null;
  if (latestDecision) {
    const { data: bc } = await supabase
      .from('blockchain_records')
      .select('transaction_hash')
      .eq('review_decision_id', latestDecision.id)
      .maybeSingle();
    if (bc?.transaction_hash) {
      explorer_url = `${env.EXPLORER_BASE_URL}/tx/${bc.transaction_hash}`;
    }
  }

  // (d) products is returned as an array (FK join); take the first.
  const product = Array.isArray(batch.products) ? batch.products[0] ?? null : batch.products;

  // (e) Sanitized public passport — no ids, filenames, notes, or docs.
  return ok({
    batch_code: batch.batch_code,
    product_name: product?.product_name ?? null,
    supplier_name: product?.supplier_name ?? null,
    category: product?.category ?? null,
    production_date: batch.production_date ?? null,
    claims: batch.claims ?? [],
    status: batch.status,
    is_demo: batch.is_demo,
    decision_date: latestDecision?.decided_at ?? null,
    record_hash: latestDecision?.record_hash ?? null,
    explorer_url,
    caveat: CAVEAT,
  });
}
