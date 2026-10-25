import { type NextRequest } from 'next/server';
import { requireReviewer } from '@/lib/auth/reviewer';
import { ok, fail } from '@/lib/api/respond';
import { supabase } from '@/lib/supabase/server';
import { appendAudit } from '@/lib/audit/log';
import { buildRecord, recordHash } from '@/lib/hash/record';
import type { Finding, CarbonResult } from '@/lib/agents/schemas';

type Decision = 'VERIFIED' | 'REJECTED' | 'NEEDS_EVIDENCE';

interface EvidenceDoc {
  id: string;
  sha256_hash: string;
  document_type: string | null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  // 1. Check reviewer auth
  try {
    requireReviewer(request);
  } catch (err) {
    return err as Response;
  }

  const batchId = params.id;

  // 2. Parse body
  let body: {
    decision?: string;
    reviewer_note?: string;
    override_confirmed?: boolean;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return fail('VALIDATION_ERROR', 'Invalid JSON body', 400);
  }

  const decision = body.decision as Decision | undefined;
  const reviewer_note = body.reviewer_note ?? '';
  const override_confirmed = body.override_confirmed ?? false;

  if (!decision || !['VERIFIED', 'REJECTED', 'NEEDS_EVIDENCE'].includes(decision)) {
    return fail('VALIDATION_ERROR', 'decision must be VERIFIED, REJECTED, or NEEDS_EVIDENCE', 400);
  }

  // 3. Validate reviewer_note >= 10 chars
  if (reviewer_note.length < 10) {
    return fail('VALIDATION_ERROR', 'reviewer_note must be at least 10 characters', 400);
  }

  // 4. Load latest COMPLETED verification_run for this batch
  const { data: runData, error: runError } = await supabase
    .from('verification_runs')
    .select(
      'id, run_number, findings, carbon_result, audit_report, ai_recommendation, recommendation_ceiling, batch_id'
    )
    .eq('batch_id', batchId)
    .eq('status', 'COMPLETED')
    .order('run_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError || !runData) {
    return fail('BATCH_NOT_FOUND', 'No completed verification run found for this batch', 404);
  }

  const run = runData as {
    id: string;
    run_number: number;
    findings: Finding[] | null;
    carbon_result: CarbonResult | null;
    audit_report: { recommendation: string } | null;
    ai_recommendation: string | null;
    recommendation_ceiling: string | null;
    batch_id: string;
  };

  // 5. Check no existing review_decision for this run_id
  const { data: existingDecision } = await supabase
    .from('review_decisions')
    .select('id')
    .eq('verification_run_id', run.id)
    .maybeSingle();

  if (existingDecision) {
    return fail('DECISION_EXISTS', 'A review decision already exists for this verification run', 409);
  }

  // 6. If decision=VERIFIED and any finding has severity=high and result=FLAG: require override_confirmed
  const findings: Finding[] = (run.findings as Finding[]) ?? [];
  if (decision === 'VERIFIED') {
    const hasHighFlag = findings.some((f) => f.severity === 'high' && f.result === 'FLAG');
    if (hasHighFlag && !override_confirmed) {
      return fail(
        'OVERRIDE_REQUIRED',
        'There are high-severity flags. Set override_confirmed=true to confirm you have reviewed them.',
        422
      );
    }
  }

  // Load batch + evidence for building the record
  const { data: batchData, error: batchError } = await supabase
    .from('batches')
    .select(
      `
      batch_code,
      claims,
      evidence_documents ( id, sha256_hash, document_type )
    `
    )
    .eq('id', batchId)
    .single();

  if (batchError || !batchData) {
    return fail('BATCH_NOT_FOUND', 'Batch not found', 404);
  }

  const batch = batchData as {
    batch_code: string;
    claims: Array<{ claim_type: string }>;
    evidence_documents: EvidenceDoc[];
  };

  // 7. Build VerificationRecord via buildRecord()
  const claimTypes = batch.claims.map((c) => c.claim_type);
  const evidence = (batch.evidence_documents ?? []).map((doc) => ({
    sha256: doc.sha256_hash,
    document_type: doc.document_type ?? 'other',
  }));
  const decided_at = new Date().toISOString();

  const record = buildRecord({
    batch_code: batch.batch_code,
    claims: claimTypes,
    run_number: run.run_number,
    ai_recommendation: run.ai_recommendation ?? '',
    evidence,
    findings,
    carbon_result: run.carbon_result,
    decision,
    override_confirmed,
    decided_at,
  });

  // 8. Compute record_hash
  const hash = recordHash(record);

  // 9. Insert review_decisions row
  const { data: insertedDecision, error: insertError } = await supabase
    .from('review_decisions')
    .insert({
      batch_id: batchId,
      verification_run_id: run.id,
      decision,
      reviewer_note,
      override_confirmed,
      record_json: record,
      record_hash: hash,
      decided_at,
    })
    .select('id')
    .single();

  if (insertError || !insertedDecision) {
    console.error('[review] Insert failed:', insertError);
    return fail('INTERNAL', 'Failed to save review decision', 500);
  }

  // 10. Update batch status to match decision
  const newStatus = decision; // 'VERIFIED' | 'REJECTED' | 'NEEDS_EVIDENCE' all map directly
  await supabase.from('batches').update({ status: newStatus }).eq('id', batchId);

  // 11. appendAudit
  await appendAudit(batchId, 'decision_recorded', {
    decision,
    record_hash: hash,
    decisionId: insertedDecision.id,
  });

  // 12. Return
  return ok({ decisionId: insertedDecision.id, record_hash: hash });
}
