import { NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase/server';
import { ok, fail } from '@/lib/api/respond';
import { sha256Hex } from '@/lib/hash/sha256';
import { appendAudit } from '@/lib/audit/log';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const ALLOWED_MIME_TYPES = ['application/pdf', 'text/plain'];

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const batchId = params.id;

  // Verify batch exists
  const { data: batch, error: batchError } = await supabase
    .from('batches')
    .select('id, status')
    .eq('id', batchId)
    .single();

  if (batchError || !batch) {
    return fail('BATCH_NOT_FOUND', `No batch found with id '${batchId}'`, 404);
  }

  // Parse multipart form data
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return fail('INVALID_FORM', 'Request must be multipart/form-data');
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return fail('EVIDENCE_INVALID', 'A file field named "file" is required');
  }

  // Validate MIME type — also accept octet-stream for .txt files uploaded by some browsers
  const filename = file.name.toLowerCase();
  const effectiveMime =
    file.type === 'application/octet-stream' && filename.endsWith('.txt')
      ? 'text/plain'
      : file.type;

  if (!ALLOWED_MIME_TYPES.includes(effectiveMime)) {
    return fail(
      'EVIDENCE_INVALID',
      `File type '${file.type}' is not allowed. Only PDF and plain text (.txt) are accepted.`
    );
  }

  // Validate size
  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return fail(
      'EVIDENCE_INVALID',
      `File size ${file.size} bytes exceeds the maximum of ${env.MAX_UPLOAD_MB} MB.`
    );
  }

  // Read buffer and compute hash
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const sha256 = sha256Hex(buffer);

  // Upload to Supabase storage
  const storagePath = `${batchId}/${sha256}`;
  const { error: uploadError } = await supabase.storage
    .from(env.EVIDENCE_BUCKET)
    .upload(storagePath, buffer, {
      contentType: effectiveMime,
      upsert: false,
    });

  if (uploadError && uploadError.message !== 'The resource already exists') {
    return fail('UPLOAD_ERROR', 'Failed to upload file to storage', 500);
  }

  // Insert evidence_documents row
  const { data: doc, error: docError } = await supabase
    .from('evidence_documents')
    .insert({
      batch_id: batchId,
      filename: file.name,
      mime_type: effectiveMime,
      size_bytes: file.size,
      storage_path: storagePath,
      sha256_hash: sha256,
      extraction_status: 'PENDING',
    })
    .select('id, filename, sha256_hash, extraction_status')
    .single();

  if (docError) {
    // Unique violation on (batch_id, sha256_hash) means duplicate file
    if (docError.code === '23505') {
      return fail('DUPLICATE_EVIDENCE', 'This exact file has already been uploaded for this batch', 409);
    }
    return fail('DB_ERROR', 'Failed to record evidence document', 500);
  }

  // If batch was VERIFIED or REJECTED, set RECHECK_REQUIRED
  if (batch.status === 'VERIFIED' || batch.status === 'REJECTED') {
    await supabase
      .from('batches')
      .update({ status: 'RECHECK_REQUIRED' })
      .eq('id', batchId);
  }

  await appendAudit(batchId, 'evidence_uploaded', { filename: file.name, sha256 });

  return ok(
    {
      id: doc.id,
      filename: doc.filename,
      sha256Hash: doc.sha256_hash,
      extractionStatus: doc.extraction_status,
      storagePath,
      // Never return a public URL
    },
    201
  );
}
