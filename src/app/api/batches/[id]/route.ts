import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/api/respond';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const { data: batch, error } = await supabase
    .from('batches')
    .select(
      `
      id,
      batch_code,
      status,
      is_demo,
      created_at,
      production_date,
      claims,
      activity_data,
      products (
        id,
        product_name,
        supplier_name,
        category
      ),
      evidence_documents (
        id,
        filename,
        mime_type,
        size_bytes,
        storage_path,
        sha256_hash,
        document_type,
        extraction_status,
        extracted_data,
        created_at
      ),
      verification_runs (
        id,
        run_number,
        status,
        error_code,
        findings,
        carbon_result,
        audit_report,
        recommendation_ceiling,
        ai_recommendation,
        created_at,
        completed_at
      ),
      review_decisions (
        id,
        decision,
        reviewer_note,
        override_confirmed,
        record_hash,
        decided_at
      ),
      blockchain_records (
        id,
        chain_id,
        contract_address,
        transaction_hash,
        record_hash,
        block_number,
        created_at
      )
    `
    )
    .eq('id', id)
    .single();

  if (error || !batch) {
    return fail('BATCH_NOT_FOUND', `No batch found with id '${id}'`, 404);
  }

  // Pick the latest verification run
  const runs = Array.isArray(batch.verification_runs) ? batch.verification_runs : [];
  const latestRun = runs.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0] ?? null;

  // Pick the latest review decision
  const decisions = Array.isArray(batch.review_decisions) ? batch.review_decisions : [];
  const latestDecision = decisions.sort(
    (a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime()
  )[0] ?? null;

  // Pick the latest blockchain record
  const blockchainRecords = Array.isArray(batch.blockchain_records) ? batch.blockchain_records : [];
  const latestBlockchainRecord = blockchainRecords.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )[0] ?? null;

  return ok({
    id: batch.id,
    batchCode: batch.batch_code,
    status: batch.status,
    isDemo: batch.is_demo,
    createdAt: batch.created_at,
    productionDate: batch.production_date,
    claims: batch.claims,
    activityData: batch.activity_data,
    product: batch.products,
    evidenceDocuments: batch.evidence_documents ?? [],
    latestRun,
    latestDecision,
    latestBlockchainRecord,
  });
}
