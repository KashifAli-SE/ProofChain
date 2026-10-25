import { supabase } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/api/respond';
import { env } from '@/lib/env';
import { buildRecord, recordHash, batchIdHash } from '@/lib/hash/record';
import { readOnChainRecord, type OnChainRecord } from '@/lib/chain/read';
import type { Finding, CarbonResult } from '@/lib/agents/schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HASH_RE = /^0x[0-9a-f]{64}$/;

export async function GET(
  _req: Request,
  { params }: { params: { recordHash: string } }
): Promise<Response> {
  // (a) Validate the hash format.
  if (!HASH_RE.test(params.recordHash)) {
    return fail('VALIDATION_ERROR', 'recordHash must be a 0x-prefixed 32-byte hash', 400);
  }

  // (b) Find the review decision by record_hash.
  const { data: decision } = await supabase
    .from('review_decisions')
    .select(
      'id, batch_id, verification_run_id, decision, override_confirmed, decided_at, record_hash'
    )
    .eq('record_hash', params.recordHash)
    .maybeSingle();

  if (!decision) {
    return ok({
      result: 'NOT_ON_CHAIN',
      explanation:
        'No review decision with this record hash was found in the database, and it is not recorded on chain.',
    });
  }

  // (c) Load supporting data to rebuild the canonical record.
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('batch_code, claims')
    .eq('id', decision.batch_id)
    .single();

  const { data: docs } = await supabase
    .from('evidence_documents')
    .select('sha256_hash, document_type')
    .eq('batch_id', decision.batch_id);

  const { data: run, error: runError } = await supabase
    .from('verification_runs')
    .select('run_number, findings, carbon_result, ai_recommendation')
    .eq('id', decision.verification_run_id)
    .single();

  const { data: bc } = await supabase
    .from('blockchain_records')
    .select('transaction_hash, block_number')
    .eq('review_decision_id', decision.id)
    .maybeSingle();

  if (batchError || !batch || runError || !run) {
    return fail('INTERNAL', 'Could not load linked batch or verification run', 500);
  }

  // (d) Rebuild the record EXACTLY as the review route did. The decided_at
  // normalization is critical: Postgres returns timestamptz with a +00:00 offset
  // (and may drop trailing zeros), which would not match the Z-form string the
  // review route hashed with. new Date(...).toISOString() reproduces that form.
  const claims = (batch.claims as { claim_type: string }[]).map((c) => c.claim_type);
  const evidence = ((docs ?? []) as { sha256_hash: string; document_type: string | null }[]).map(
    (d) => ({ sha256: d.sha256_hash, document_type: d.document_type ?? 'other' })
  );
  const findings = (run.findings as Finding[] | null) ?? [];
  const carbon = (run.carbon_result as CarbonResult | null) ?? null;
  const decided_at = new Date(decision.decided_at).toISOString();

  const rebuilt = buildRecord({
    batch_code: batch.batch_code,
    claims,
    run_number: run.run_number,
    ai_recommendation: run.ai_recommendation ?? '',
    evidence,
    findings,
    carbon_result: carbon,
    decision: decision.decision as 'VERIFIED' | 'REJECTED' | 'NEEDS_EVIDENCE',
    override_confirmed: decision.override_confirmed,
    decided_at,
  });

  // (e) Recompute the hash and compare.
  const recomputed = recordHash(rebuilt);
  if (recomputed !== params.recordHash) {
    return ok({
      result: 'MISMATCH',
      explanation:
        'The record rebuilt from the current database state no longer matches the stored hash. The underlying data may have been altered since the decision was recorded.',
      stored_hash: params.recordHash,
      recomputed_hash: recomputed,
    });
  }

  // (g) Read the on-chain record.
  let onChain: OnChainRecord;
  try {
    onChain = await readOnChainRecord(batchIdHash(batch.batch_code), params.recordHash);
  } catch {
    return fail('CHAIN_UNAVAILABLE', 'Could not read the on-chain registry', 503);
  }

  if (!onChain.found) {
    return ok({
      result: 'NOT_ON_CHAIN',
      explanation:
        'The record hash matches the database but has not been recorded on chain yet.',
      record_hash: params.recordHash,
    });
  }

  const explorer_url = bc?.transaction_hash
    ? `${env.EXPLORER_BASE_URL}/tx/${bc.transaction_hash}`
    : null;

  return ok({
    result: 'MATCH',
    record_hash: params.recordHash,
    explorer_url,
    block_number: bc?.block_number ?? null,
    on_chain_status: onChain.status,
    recorder: onChain.recorder,
    timestamp: onChain.timestamp,
  });
}
