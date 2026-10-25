import { type NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/api/respond';
import { appendAudit } from '@/lib/audit/log';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DELETABLE_STATUSES = ['DRAFT', 'IN_REVIEW', 'NEEDS_EVIDENCE', 'REJECTED', 'RECHECK_REQUIRED'];

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; docId: string } }
): Promise<Response> {
  const { id: batchId, docId } = params;

  // Load the batch to check its status
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('id, status')
    .eq('id', batchId)
    .single();

  if (batchError || !batch) {
    return fail('BATCH_NOT_FOUND', 'Batch not found', 404);
  }

  if (!DELETABLE_STATUSES.includes(batch.status)) {
    return fail(
      'DELETE_NOT_ALLOWED',
      `Cannot delete evidence from a batch with status ${batch.status}. Only allowed for: ${DELETABLE_STATUSES.join(', ')}.`,
      403
    );
  }

  // Load the evidence document to get storage_path
  const { data: doc, error: docError } = await supabase
    .from('evidence_documents')
    .select('id, filename, storage_path, batch_id')
    .eq('id', docId)
    .eq('batch_id', batchId)
    .single();

  if (docError || !doc) {
    return fail('NOT_FOUND', 'Evidence document not found', 404);
  }

  // Delete from storage bucket
  const { error: storageError } = await supabase.storage
    .from('evidence')
    .remove([doc.storage_path]);

  if (storageError) {
    // Log but don't block — the DB row is the source of truth
    console.error('[evidence/delete] Storage delete failed:', storageError.message);
  }

  // Delete the DB row
  const { error: deleteError } = await supabase
    .from('evidence_documents')
    .delete()
    .eq('id', docId)
    .eq('batch_id', batchId);

  if (deleteError) {
    return fail('INTERNAL', 'Failed to delete evidence document', 500);
  }

  // Audit entry
  await appendAudit(batchId, 'evidence_deleted', {
    docId,
    filename: doc.filename,
    storage_path: doc.storage_path,
  });

  return ok({ deleted: true, docId });
}
