import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/StatusBadge';
import { DemoBanner } from '@/components/DemoBanner';
import { EvidenceTable, type EvidenceDocument } from '@/components/EvidenceTable';
import { ActivityForm } from './ActivityForm';
import { AnalysisPanel } from './AnalysisPanel';

export const dynamic = 'force-dynamic';

interface BatchDetail {
  id: string;
  batch_code: string;
  status: string;
  is_demo: boolean;
  created_at: string;
  production_date: string | null;
  claims: unknown[];
  activity_data: Record<string, unknown> | null;
  products: {
    product_name: string;
    supplier_name: string;
    category: string;
  }[] | null;
  evidence_documents: EvidenceDocument[];
}

async function getBatch(id: string): Promise<BatchDetail | null> {
  const { data, error } = await supabase
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
        product_name,
        supplier_name,
        category
      ),
      evidence_documents (
        id,
        filename,
        sha256_hash,
        mime_type,
        size_bytes,
        extraction_status,
        created_at
      )
    `
    )
    .eq('id', id)
    .single();

  if (error || !data) return null;

  return data as BatchDetail;
}

export default async function BatchDetailPage({ params }: { params: { id: string } }) {
  const batch = await getBatch(params.id);

  if (!batch) {
    notFound();
  }

  const docs = batch.evidence_documents ?? [];
  const product = Array.isArray(batch.products) ? batch.products[0] ?? null : batch.products;

  return (
    <div>
      <DemoBanner isDemo={batch.is_demo} />

      <main className="mx-auto max-w-4xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/" className="text-sm text-indigo-600 hover:underline">
            ← All batches
          </Link>
        </div>

        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 font-mono">{batch.batch_code}</h1>
            <p className="mt-1 text-gray-500">{product?.product_name ?? '—'}</p>
          </div>
          <StatusBadge status={batch.status} className="text-sm" />
        </div>

        {/* Batch metadata */}
        <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Batch details
          </h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="font-medium text-gray-500">Supplier</dt>
              <dd className="text-gray-900">{product?.supplier_name ?? '—'}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">Category</dt>
              <dd className="text-gray-900">{product?.category ?? '—'}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">Production date</dt>
              <dd className="text-gray-900">{batch.production_date ?? '—'}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">Created</dt>
              <dd className="text-gray-900">{new Date(batch.created_at).toLocaleDateString()}</dd>
            </div>
            <div className="col-span-2">
              <dt className="font-medium text-gray-500">Claims</dt>
              <dd className="mt-1">
                {Array.isArray(batch.claims) && batch.claims.length > 0 ? (
                  <pre className="rounded bg-gray-50 p-2 text-xs text-gray-700 overflow-x-auto">
                    {JSON.stringify(batch.claims, null, 2)}
                  </pre>
                ) : (
                  <span className="text-gray-400">No claims</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* Evidence documents */}
        <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Evidence documents
          </h2>
          <EvidenceTable documents={docs} />
        </section>

        {/* Activity data */}
        <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Activity data
          </h2>
          <ActivityForm batchId={batch.id} initialData={batch.activity_data} />
        </section>

        {/* Run analysis */}
        <AnalysisPanel batchId={batch.id} />

        {/* QR card — stub (FEAT-005) */}
        <section className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">
            QR card
          </h2>
          <p className="text-sm text-gray-400">QR card generation coming in FEAT-005.</p>
        </section>
      </main>
    </div>
  );
}
