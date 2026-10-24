import { supabase } from '@/lib/supabase/server';
import { appendAudit } from '@/lib/audit/log';
import { investigateDocument } from './document-investigator';
import { runChecks } from './cross-checker';
import { computeCarbon } from './climate-analyst';
import { deriveCeiling } from './status-policy';
import { runAuditor } from './auditor';
import type { ActivityData, DocumentExtraction } from './schemas';
import emissionFactors from '../../../config/emission-factors.json';

interface EvidenceDoc {
  id: string;
  filename: string;
  mime_type: string;
  storage_path: string;
}

interface BatchRow {
  id: string;
  batch_code: string;
  status: string;
  production_date: string | null;
  claims: Array<{ claim_type: string; value?: number | null; unit?: string | null }>;
  activity_data: ActivityData | null;
  products: Array<{ supplier_name: string }> | null;
  evidence_documents: EvidenceDoc[];
}

function makeError(message: string, code: string): Error {
  const err = new Error(message);
  (err as NodeJS.ErrnoException).code = code;
  return err;
}

export async function runPipeline(
  batchId: string
): Promise<{ runId: string; status: 'COMPLETED' | 'FAILED' }> {
  // 1. Load batch row
  const { data: batchData, error: batchError } = await supabase
    .from('batches')
    .select(
      `
      id,
      batch_code,
      status,
      production_date,
      claims,
      activity_data,
      products ( supplier_name ),
      evidence_documents ( id, filename, mime_type, storage_path )
    `
    )
    .eq('id', batchId)
    .single();

  if (batchError || !batchData) {
    throw makeError('Batch not found', 'BATCH_NOT_FOUND');
  }

  const batch = batchData as BatchRow;
  const previousStatus = batch.status;

  // 2. Check for existing RUNNING run
  const { data: runningRun } = await supabase
    .from('verification_runs')
    .select('id')
    .eq('batch_id', batchId)
    .eq('status', 'RUNNING')
    .maybeSingle();

  if (runningRun) {
    throw makeError('A verification run is already in progress for this batch', 'RUN_IN_PROGRESS');
  }

  // 3. Check evidence_documents count > 0
  const docs = batch.evidence_documents ?? [];
  if (docs.length === 0) {
    throw makeError('No evidence documents uploaded for this batch', 'NO_EVIDENCE');
  }

  // 4. appendAudit run_started
  await appendAudit(batchId, 'run_started');

  // 5. Insert verification_runs row with status RUNNING
  const { data: maxRunData } = await supabase
    .from('verification_runs')
    .select('run_number')
    .eq('batch_id', batchId)
    .order('run_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const runNumber = maxRunData ? (maxRunData.run_number as number) + 1 : 1;

  const { data: runRow, error: runInsertError } = await supabase
    .from('verification_runs')
    .insert({
      batch_id: batchId,
      run_number: runNumber,
      status: 'RUNNING',
    })
    .select('id')
    .single();

  if (runInsertError || !runRow) {
    throw makeError('Failed to create verification run', 'INTERNAL');
  }

  const runId = runRow.id as string;

  // 6. Set batch status ANALYZING
  await supabase.from('batches').update({ status: 'ANALYZING' }).eq('id', batchId);

  const supplier = Array.isArray(batch.products) ? batch.products[0] : batch.products;
  const batchForChecks = {
    id: batch.id,
    batch_code: batch.batch_code,
    production_date: batch.production_date,
    supplier_name: supplier?.supplier_name ?? null,
    claims: batch.claims,
    activity_data: batch.activity_data,
  };

  const extractions: DocumentExtraction[] = [];

  try {
    // 7. For each evidence doc: download, investigate, update
    for (const doc of docs) {
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('evidence')
        .download(doc.storage_path);

      if (downloadError || !fileData) {
        await supabase
          .from('evidence_documents')
          .update({ extraction_status: 'EXTRACTION_FAILED' })
          .eq('id', doc.id);
        extractions.push({
          document_type: 'other',
          issuer: null,
          supplier_name: null,
          certificate_id: null,
          issue_date: null,
          expiry_date: null,
          batch_ids: [],
          quantities: [],
          claims: [],
          is_demo_marked: false,
          missing_fields: ['all'],
          uncertainties: ['Failed to download document from storage.'],
        });
        continue;
      }

      const arrayBuffer = await (fileData as Blob).arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let extraction: DocumentExtraction;
      try {
        extraction = await investigateDocument(
          buffer,
          doc.mime_type,
          doc.filename,
          batch.batch_code
        );
        await supabase
          .from('evidence_documents')
          .update({
            extraction_status: 'EXTRACTED',
            extracted_data: extraction,
            document_type: extraction.document_type,
          })
          .eq('id', doc.id);
      } catch {
        await supabase
          .from('evidence_documents')
          .update({ extraction_status: 'EXTRACTION_FAILED' })
          .eq('id', doc.id);
        extraction = {
          document_type: 'other',
          issuer: null,
          supplier_name: null,
          certificate_id: null,
          issue_date: null,
          expiry_date: null,
          batch_ids: [],
          quantities: [],
          claims: [],
          is_demo_marked: false,
          missing_fields: ['all'],
          uncertainties: ['Extraction failed.'],
        };
      }
      extractions.push(extraction);
    }

    // 8. runChecks
    const findings = runChecks(batchForChecks, extractions, new Date());

    // 9. computeCarbon
    const activityData = batch.activity_data ?? {
      period_start: '',
      period_end: '',
      production_units: null,
      lines: [],
    };
    const carbonResult = computeCarbon(activityData, emissionFactors);

    // 10. deriveCeiling
    const claimTypes = batch.claims.map((c) => c.claim_type);
    const ceiling = deriveCeiling(findings, carbonResult, claimTypes);

    // 11. runAuditor
    const auditReport = await runAuditor(findings, carbonResult, batch.claims, ceiling);

    // 12. Update verification_runs
    await supabase
      .from('verification_runs')
      .update({
        status: 'COMPLETED',
        findings,
        carbon_result: carbonResult,
        audit_report: auditReport,
        recommendation_ceiling: ceiling,
        ai_recommendation: auditReport.recommendation,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    // 13. Set batch status IN_REVIEW
    await supabase.from('batches').update({ status: 'IN_REVIEW' }).eq('id', batchId);

    // 14. appendAudit run_completed
    await appendAudit(batchId, 'run_completed', { runId });

    return { runId, status: 'COMPLETED' };
  } catch (err) {
    // On any throw at steps 7-13: update run status FAILED
    const errorCode =
      (err as NodeJS.ErrnoException).code ?? 'INTERNAL';

    await supabase
      .from('verification_runs')
      .update({
        status: 'FAILED',
        error_code: errorCode,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    // Restore batch to previous status
    await supabase.from('batches').update({ status: previousStatus }).eq('id', batchId);

    await appendAudit(batchId, 'run_failed', { runId, errorCode });

    return { runId, status: 'FAILED' };
  }
}
