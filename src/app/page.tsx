import Link from 'next/link';
import { supabase } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/StatusBadge';

export const dynamic = 'force-dynamic';

interface BatchRow {
  id: string;
  batch_code: string;
  status: string;
  created_at: string;
  products: {
    product_name: string;
    supplier_name: string;
  }[] | null;
}

async function getBatches(): Promise<{ batches: BatchRow[] | null; error: string | null }> {
  const { data, error } = await supabase
    .from('batches')
    .select(
      `
      id,
      batch_code,
      status,
      created_at,
      products (
        product_name,
        supplier_name
      )
    `
    )
    .order('created_at', { ascending: false });

  if (error) {
    return { batches: null, error: error.message };
  }

  return { batches: data as BatchRow[], error: null };
}

export default async function DashboardPage() {
  const { batches, error } = await getBatches();

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">ProofChain AI — Batches</h1>
        <Link
          href="/batches/new"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          New batch
        </Link>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
          Failed to load batches: {error}
        </div>
      )}

      {!error && batches && batches.length === 0 && (
        <div className="rounded-md border border-dashed border-gray-300 p-12 text-center">
          <p className="text-gray-500">No batches yet. Create your first batch to get started.</p>
          <Link
            href="/batches/new"
            className="mt-4 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            New batch
          </Link>
        </div>
      )}

      {!error && batches && batches.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Batch code</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Product</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Supplier</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {batches.map((batch) => (
                <tr key={batch.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/batches/${batch.id}`}
                      className="font-mono font-medium text-indigo-600 hover:underline"
                    >
                      {batch.batch_code}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-900">
                    {Array.isArray(batch.products) ? batch.products[0]?.product_name ?? '—' : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {Array.isArray(batch.products) ? batch.products[0]?.supplier_name ?? '—' : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={batch.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(batch.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
