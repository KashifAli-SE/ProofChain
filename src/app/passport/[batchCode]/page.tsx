import { notFound } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/server';
import { env } from '@/lib/env';
import { StatusBadge } from '@/components/StatusBadge';
import { DemoBanner } from '@/components/DemoBanner';

export const dynamic = 'force-dynamic';

const CAVEAT =
  'A blockchain record proves this decision was not altered after it was recorded. It does not prove the underlying claims are true.';

interface Claim {
  claim_type: string;
  value?: number | null;
  unit?: string | null;
}

export default async function PassportPage({ params }: { params: { batchCode: string } }) {
  const { data: batch } = await supabase
    .from('batches')
    .select(
      'id, batch_code, status, is_demo, production_date, claims, products ( product_name, supplier_name, category )'
    )
    .eq('batch_code', params.batchCode)
    .maybeSingle();

  if (!batch) {
    notFound();
  }

  const { data: latestDecision } = await supabase
    .from('review_decisions')
    .select('id, decided_at, record_hash')
    .eq('batch_id', batch.id)
    .order('decided_at', { ascending: false })
    .limit(1)
    .maybeSingle();

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

  const product = Array.isArray(batch.products) ? batch.products[0] ?? null : batch.products;
  const claims = (Array.isArray(batch.claims) ? batch.claims : []) as Claim[];

  return (
    <div>
      <DemoBanner isDemo={batch.is_demo} />

      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-4">
          <Link href="/" className="text-sm text-indigo-600 hover:underline">
            ← Home
          </Link>
        </div>

        <h1 className="text-2xl font-bold text-gray-900">
          {product?.product_name ?? batch.batch_code}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{product?.supplier_name ?? '—'}</p>

        <div className="mt-4">
          <StatusBadge status={batch.status} className="text-sm" />
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-gray-500">Category</dt>
            <dd className="text-gray-900">{product?.category ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Production date</dt>
            <dd className="text-gray-900">{batch.production_date ?? '—'}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Decision date</dt>
            <dd className="text-gray-900">
              {latestDecision ? new Date(latestDecision.decided_at).toLocaleString() : '—'}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">Record hash</dt>
            <dd className="break-all font-mono text-xs text-gray-700">
              {latestDecision
                ? `${latestDecision.record_hash.slice(0, 10)}…${latestDecision.record_hash.slice(-6)}`
                : '—'}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-gray-500">Explorer</dt>
            <dd>
              {explorer_url ? (
                <a
                  href={explorer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-indigo-600 hover:underline"
                >
                  View on Etherscan ↗
                </a>
              ) : (
                <span className="text-gray-400">Not anchored on chain yet</span>
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="font-medium text-gray-500">Claims</dt>
            <dd>
              {claims.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {claims.map((c, i) => (
                    <li key={i} className="text-gray-900">
                      {c.claim_type}
                      {c.value != null ? ` — ${c.value}${c.unit ? ` ${c.unit}` : ''}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="text-gray-400">No claims</span>
              )}
            </dd>
          </div>
        </dl>

        <div className="mt-6 rounded-lg border border-gray-300 bg-gray-50 p-4">
          <p className="text-sm text-gray-700">{CAVEAT}</p>
        </div>
      </main>
    </div>
  );
}
