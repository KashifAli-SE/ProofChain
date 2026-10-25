'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';
import { DemoBanner } from '@/components/DemoBanner';

interface BatchRow {
  id: string;
  batch_code: string;
  status: string;
  is_demo: boolean;
  created_at: string;
  production_date: string | null;
  products: { product_name: string; supplier_name: string; category: string }[] | null;
  latestRunStatus: string | null;
}

const STATUS_ORDER: Record<string, number> = {
  ANALYZING: 0,
  IN_REVIEW: 1,
  RECHECK_REQUIRED: 2,
  NEEDS_EVIDENCE: 3,
  DRAFT: 4,
  VERIFIED: 5,
  REJECTED: 6,
};

export default function DashboardPage() {
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('ALL');

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/batches', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Failed to load batches');
        return;
      }
      const sorted = (json.data as BatchRow[]).sort(
        (a, b) =>
          (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99) ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setBatches(sorted);
    } catch {
      setError('Could not connect to the server. Is the app running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBatches();
  }, [fetchBatches]);

  const statuses = ['ALL', 'DRAFT', 'ANALYZING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'NEEDS_EVIDENCE', 'RECHECK_REQUIRED'];
  const filtered = filter === 'ALL' ? batches : batches.filter((b) => b.status === filter);
  const hasDemoData = batches.some((b) => b.is_demo);

  const stats = {
    total: batches.length,
    verified: batches.filter((b) => b.status === 'VERIFIED').length,
    inReview: batches.filter((b) => b.status === 'IN_REVIEW').length,
    needsAction: batches.filter((b) =>
      ['NEEDS_EVIDENCE', 'RECHECK_REQUIRED'].includes(b.status)
    ).length,
  };

  return (
    <>
      {hasDemoData && <DemoBanner isDemo />}
      <main className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Batch dashboard</h1>
            <p className="mt-0.5 text-sm text-gray-500">
              Track and verify supplier sustainability claims
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void fetchBatches()}
              disabled={loading}
              className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 shadow-sm hover:bg-gray-50 disabled:opacity-50"
              title="Refresh"
            >
              {loading ? '↻' : '↻ Refresh'}
            </button>
            <Link
              href="/batches/new"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              + New batch
            </Link>
          </div>
        </div>

        {/* Stats cards */}
        {!loading && !error && batches.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: 'Total batches', value: stats.total, color: 'text-gray-900' },
              { label: 'Verified', value: stats.verified, color: 'text-green-700' },
              { label: 'In review', value: stats.inReview, color: 'text-indigo-700' },
              { label: 'Needs action', value: stats.needsAction, color: 'text-amber-700' },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <p className="text-xs font-medium text-gray-500">{s.label}</p>
                <p className={`mt-1 text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Filter tabs */}
        {!loading && !error && batches.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {statuses.map((s) => {
              const count = s === 'ALL' ? batches.length : batches.filter((b) => b.status === s).length;
              if (s !== 'ALL' && count === 0) return null;
              return (
                <button
                  key={s}
                  onClick={() => setFilter(s)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    filter === s
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s.replace(/_/g, ' ')} {count > 0 && `(${count})`}
                </button>
              );
            })}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <svg className="h-8 w-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-gray-500">Loading batches…</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <button
              onClick={() => void fetchBatches()}
              className="mt-3 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-200"
            >
              Try again
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && batches.length === 0 && (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-16 text-center">
            <span className="text-4xl">📦</span>
            <p className="mt-3 text-base font-medium text-gray-700">No batches yet</p>
            <p className="mt-1 text-sm text-gray-500">
              Create your first batch to start verifying supplier claims.
            </p>
            <Link
              href="/batches/new"
              className="mt-5 inline-block rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              + New batch
            </Link>
          </div>
        )}

        {/* Batch table */}
        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Batch</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Product</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Supplier</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Created</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((batch) => {
                  const product = Array.isArray(batch.products) ? batch.products[0] : batch.products;
                  return (
                    <tr key={batch.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/batches/${batch.id}`}
                            className="font-mono font-semibold text-indigo-600 hover:underline"
                          >
                            {batch.batch_code}
                          </Link>
                          {batch.is_demo && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                              DEMO
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-900">{product?.product_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{product?.supplier_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={batch.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-400">
                        {new Date(batch.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/batches/${batch.id}`}
                          className="rounded-md bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Empty filtered state */}
        {!loading && !error && filtered.length === 0 && batches.length > 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 p-10 text-center">
            <p className="text-sm text-gray-500">No batches with status {filter.replace(/_/g, ' ')}.</p>
            <button onClick={() => setFilter('ALL')} className="mt-2 text-sm text-indigo-600 hover:underline">
              Show all
            </button>
          </div>
        )}
      </main>
    </>
  );
}
