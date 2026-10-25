'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { StatusBadge } from '@/components/StatusBadge';
import { FindingCard } from '@/components/FindingCard';
import type { Finding } from '@/lib/agents/schemas';

interface BlockchainRecord {
  id: string;
  chain_id: number;
  contract_address: string;
  transaction_hash: string;
  record_hash: string;
  block_number: number;
  created_at: string;
}

interface LatestDecision {
  id: string;
  decision: string;
  reviewer_note: string;
  override_confirmed: boolean;
  record_hash: string;
  decided_at: string;
}

interface LatestRun {
  id: string;
  run_number: number;
  status: string;
  error_code: string | null;
  findings: Finding[] | null;
  recommendation_ceiling: string | null;
  ai_recommendation: string | null;
  created_at: string;
  completed_at: string | null;
}

interface BatchDetail {
  id: string;
  batchCode: string;
  status: string;
  isDemo: boolean;
  createdAt: string;
  productionDate: string | null;
  product:
    | { product_name: string; supplier_name: string; category: string }
    | { product_name: string; supplier_name: string; category: string }[]
    | null;
  latestRun: LatestRun | null;
  latestDecision: LatestDecision | null;
  latestBlockchainRecord: BlockchainRecord | null;
}

interface AnchorResult {
  id: string;
  chain_id: number;
  contract_address: string;
  transaction_hash: string;
  record_hash: string;
  block_number: number;
  created_at: string;
  explorer_url: string;
}

type DecisionValue = 'VERIFIED' | 'REJECTED' | 'NEEDS_EVIDENCE';

function recBadgeClass(rec: string | null | undefined): string {
  if (rec === 'APPROVE') return 'rounded-full px-3 py-1 text-sm font-semibold bg-green-100 text-green-800';
  if (rec === 'REJECT') return 'rounded-full px-3 py-1 text-sm font-semibold bg-red-100 text-red-800';
  return 'rounded-full px-3 py-1 text-sm font-semibold bg-yellow-100 text-yellow-800';
}

function shortHash(hash: string | null | undefined): string {
  if (!hash) return '—';
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

function anchorButtonLabel(state: string, hasExplorer: boolean): string {
  if (state === 'anchoring') return 'Anchoring…';
  if (state === 'anchored') return hasExplorer ? 'Re-anchor' : 'Load explorer link';
  return 'Anchor on Sepolia';
}

export default function ReviewPage({ params }: { params: { id: string } }) {
  const { id } = params;

  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [passcode, setPasscode] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [decision, setDecision] = useState<DecisionValue | ''>('');
  const [reviewerNote, setReviewerNote] = useState('');
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [anchorState, setAnchorState] = useState<'idle' | 'anchoring' | 'anchored' | 'error'>('idle');
  const [anchorRecord, setAnchorRecord] = useState<AnchorResult | null>(null);
  const [anchorError, setAnchorError] = useState<string | null>(null);

  const fetchBatch = useCallback(async () => {
    setLoading(true);
    setPageError(null);
    try {
      const res = await fetch(`/api/batches/${id}`);
      const json = await res.json();
      if (json.success) {
        setBatch(json.data as BatchDetail);
        if (json.data?.latestBlockchainRecord) {
          setAnchorState('anchored');
        }
      } else {
        setPageError(json.error?.message ?? 'Failed to load batch');
      }
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Failed to load batch');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchBatch();
  }, [fetchBatch]);

  // Check if already authenticated via cookie on mount
  useEffect(() => {
    fetch('/api/auth/reviewer/check', { credentials: 'same-origin' })
      .then((r) => setAuthed(r.ok))
      .catch(() => setAuthed(false));
  }, []);

  const highFlag =
    batch?.latestRun?.findings?.some((f) => f.severity === 'high' && f.result === 'FLAG') ?? false;
  const highFlagFindings =
    batch?.latestRun?.findings?.filter((f) => f.severity === 'high' && f.result === 'FLAG') ?? [];
  const latestDecision = batch?.latestDecision ?? null;
  const latestBlockchainRecord = batch?.latestBlockchainRecord ?? null;
  const product = batch
    ? Array.isArray(batch.product)
      ? batch.product[0] ?? null
      : batch.product
    : null;

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoginError(null);
    setLoggingIn(true);
    try {
      const res = await fetch('/api/auth/reviewer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ passcode }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setAuthed(true);
        setPasscode('');
      } else {
        setLoginError(json?.error?.message ?? 'Invalid passcode');
      }
    } catch {
      setLoginError('Login request failed');
    } finally {
      setLoggingIn(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);
    if (!decision) {
      setSubmitError('Select a decision');
      return;
    }
    if (reviewerNote.length < 10) {
      setSubmitError('Reviewer note must be at least 10 characters');
      return;
    }
    if (decision === 'VERIFIED' && highFlag && !overrideConfirmed) {
      setSubmitError('Confirm the high-severity flags override before verifying');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/batches/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          decision,
          reviewer_note: reviewerNote,
          override_confirmed: overrideConfirmed,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setSubmitError(json.error?.message ?? 'Failed to submit decision');
        return;
      }
      await fetchBatch();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAnchor() {
    setAnchorError(null);
    setAnchorState('anchoring');
    try {
      const res = await fetch(`/api/batches/${id}/anchor`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setAnchorState('error');
        setAnchorError(json.error?.message ?? 'Anchoring failed');
        return;
      }
      setAnchorRecord(json.data as AnchorResult);
      setAnchorState('anchored');
    } catch (e) {
      setAnchorState('error');
      setAnchorError(e instanceof Error ? e.message : 'Anchoring failed');
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <Link href={`/batches/${id}`} className="text-sm text-indigo-600 hover:underline">
          ← Batch detail
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-gray-900">Review</h1>

      {loading && (
        <div className="flex items-center gap-2 py-12 text-gray-500">
          <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm">Loading…</span>
        </div>
      )}

      {pageError && !loading && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{pageError}</p>
        </div>
      )}

      {!loading && batch && (
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono text-lg font-semibold text-gray-900">{batch.batchCode}</p>
              {product?.product_name && (
                <p className="text-sm text-gray-500">{product.product_name}</p>
              )}
            </div>
            <StatusBadge status={batch.status} className="text-sm" />
          </div>

          {authed === null ? (
            // Still checking cookie
            <div className="flex items-center gap-2 py-6 text-gray-500">
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm">Checking authentication…</span>
            </div>
          ) : !authed ? (
            <section className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                Reviewer login
              </h2>
              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <label htmlFor="passcode" className="block text-sm font-medium text-gray-700">
                    Passcode
                  </label>
                  <input
                    id="passcode"
                    type="password"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                    required
                  />
                </div>
                {loginError && <p className="text-sm text-red-600">{loginError}</p>}
                <button
                  type="submit"
                  disabled={loggingIn}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-300"
                >
                  {loggingIn ? 'Logging in…' : 'Log in'}
                </button>
              </form>
            </section>
          ) : (
            <>
              {batch.latestRun ? (
                <section className="rounded-lg border border-gray-200 bg-white p-5">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    AI recommendation
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-gray-500">Recommendation:</span>
                    <span className={recBadgeClass(batch.latestRun.ai_recommendation)}>
                      {batch.latestRun.ai_recommendation ?? '—'}
                    </span>
                    <span className="text-xs text-gray-400">
                      (ceiling: {batch.latestRun.recommendation_ceiling ?? '—'})
                    </span>
                  </div>

                  {highFlagFindings.length > 0 && (
                    <div className="mt-4">
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-red-600">
                        High-severity flags ({highFlagFindings.length})
                      </h3>
                      <div className="space-y-2">
                        {highFlagFindings.map((f) => (
                          <FindingCard key={f.finding_id} finding={f} />
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              ) : (
                <section className="rounded-lg border border-gray-200 bg-white p-5">
                  <p className="text-sm text-gray-600">No analysis run yet.</p>
                  <Link
                    href={`/batches/${id}`}
                    className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
                  >
                    Go to batch detail to run analysis →
                  </Link>
                </section>
              )}

              {latestDecision ? (
                <>
                  <section className="rounded-lg border border-gray-200 bg-white p-5">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                      Decision recorded
                    </h2>
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="font-medium text-gray-500">Decision</dt>
                        <dd className="text-gray-900">{latestDecision.decision.replace(/_/g, ' ')}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-500">Decided at</dt>
                        <dd className="text-gray-900">
                          {new Date(latestDecision.decided_at).toLocaleString()}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="font-medium text-gray-500">Record hash</dt>
                        <dd className="break-all font-mono text-xs text-gray-700">
                          {latestDecision.record_hash}
                        </dd>
                      </div>
                    </dl>
                  </section>

                  <section className="rounded-lg border border-gray-200 bg-white p-5">
                    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                      Blockchain anchor
                    </h2>

                    {anchorState === 'anchoring' && (
                      <p className="text-sm text-gray-500">Anchoring on Sepolia… (up to 60s)</p>
                    )}

                    {anchorState === 'error' && (
                      <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-3">
                        <p className="text-sm text-red-700">{anchorError}</p>
                      </div>
                    )}

                    {anchorState === 'anchored' && (
                      <div className="space-y-1 rounded-md border border-green-200 bg-green-50 p-3">
                        <p className="text-sm font-medium text-green-800">✓ Anchored on Sepolia</p>
                        <p className="break-all font-mono text-xs text-gray-700">
                          tx:{' '}
                          {shortHash(
                            anchorRecord?.transaction_hash ?? latestBlockchainRecord?.transaction_hash
                          )}
                        </p>
                        <p className="text-xs text-gray-500">
                          block:{' '}
                          {anchorRecord?.block_number ?? latestBlockchainRecord?.block_number ?? '—'}
                        </p>
                        {anchorRecord?.explorer_url && (
                          <a
                            href={anchorRecord.explorer_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-sm text-indigo-600 hover:underline"
                          >
                            View on Etherscan ↗
                          </a>
                        )}
                      </div>
                    )}

                    {anchorState === 'idle' && (
                      <p className="text-sm text-gray-500">Not yet anchored on chain.</p>
                    )}

                    <button
                      onClick={() => void handleAnchor()}
                      disabled={anchorState === 'anchoring'}
                      className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-300"
                    >
                      {anchorButtonLabel(anchorState, !!anchorRecord?.explorer_url)}
                    </button>
                  </section>
                </>
              ) : batch.latestRun ? (
                <section className="rounded-lg border border-gray-200 bg-white p-5">
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Record decision
                  </h2>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium text-gray-700">Decision</legend>
                      {(['VERIFIED', 'REJECTED', 'NEEDS_EVIDENCE'] as const).map((d) => (
                        <label key={d} className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="decision"
                            value={d}
                            checked={decision === d}
                            onChange={() => setDecision(d)}
                          />
                          {d.replace(/_/g, ' ')}
                        </label>
                      ))}
                    </fieldset>

                    <div>
                      <label htmlFor="note" className="block text-sm font-medium text-gray-700">
                        Reviewer note (min 10 chars)
                      </label>
                      <textarea
                        id="note"
                        value={reviewerNote}
                        onChange={(e) => setReviewerNote(e.target.value)}
                        rows={4}
                        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                        placeholder="Explain the rationale for this decision…"
                      />
                      <p className="mt-1 text-xs text-gray-400">{reviewerNote.length} characters</p>
                    </div>

                    {highFlag && (
                      <label className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={overrideConfirmed}
                          onChange={(e) => setOverrideConfirmed(e.target.checked)}
                          className="mt-0.5"
                        />
                        <span className="text-gray-700">
                          I have reviewed the high-severity flags above and confirm this decision
                          despite them.
                        </span>
                      </label>
                    )}

                    {submitError && <p className="text-sm text-red-600">{submitError}</p>}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-300"
                    >
                      {submitting ? 'Submitting…' : 'Submit decision'}
                    </button>
                  </form>
                </section>
              ) : null}
            </>
          )}
        </div>
      )}
    </main>
  );
}
