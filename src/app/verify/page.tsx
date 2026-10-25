'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';

const HASH_RE = /^0x[0-9a-f]{64}$/;

interface VerifyResult {
  result: 'MATCH' | 'MISMATCH' | 'NOT_ON_CHAIN';
  explanation?: string;
  record_hash?: string;
  stored_hash?: string;
  recomputed_hash?: string;
  explorer_url?: string | null;
  block_number?: number | null;
  on_chain_status?: number | null;
  recorder?: string | null;
  timestamp?: number | null;
}

function shortHash(hash: string): string {
  if (!hash) return '—';
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export default function VerifyPage() {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const value = input.trim();
    if (!value) {
      setError('Enter a batch code or record hash');
      setLoading(false);
      return;
    }

    try {
      let recordHash = value;
      if (!HASH_RE.test(value)) {
        // Treat as a batch code: resolve its record hash via the passport route.
        const pRes = await fetch(`/api/passport/${encodeURIComponent(value)}`);
        if (pRes.status === 404) {
          setError(`No batch found with code '${value}'`);
          setLoading(false);
          return;
        }
        if (!pRes.ok) {
          const pJson = await pRes.json().catch(() => null);
          setError(pJson?.error?.message ?? 'Failed to look up batch');
          setLoading(false);
          return;
        }
        const pJson = await pRes.json();
        const passport = pJson?.data ?? null;
        if (!passport?.record_hash) {
          setResult({
            result: 'NOT_ON_CHAIN',
            explanation: `Batch '${value}' has no recorded decision yet.`,
          });
          setLoading(false);
          return;
        }
        recordHash = passport.record_hash as string;
      }

      const res = await fetch(`/api/records/${encodeURIComponent(recordHash)}/verify`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Verification request failed');
        setLoading(false);
        return;
      }
      setResult(json.data as VerifyResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="mb-4">
        <Link href="/" className="text-sm text-indigo-600 hover:underline">
          ← Home
        </Link>
      </div>

      <h1 className="mb-6 text-2xl font-bold text-gray-900">Verify a record</h1>

      <form onSubmit={handleSubmit} className="mb-6">
        <label htmlFor="verify-input" className="block text-sm font-medium text-gray-700">
          Batch code or record hash
        </label>
        <input
          id="verify-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Batch code (e.g. TX-1042) or record hash (0x…)"
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-300"
        >
          {loading ? 'Verifying…' : 'Verify'}
        </button>
      </form>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading && !error && (
        <div className="flex items-center justify-center py-6">
          <svg
            className="h-5 w-5 animate-spin text-indigo-500"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {!loading && !error && result && (
        <div className="space-y-3">
          {result.result === 'MATCH' && (
            <div className="rounded-md border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-semibold text-green-800">✓ Match</p>
              <p className="mt-1 text-sm text-gray-700">
                {result.explanation ?? 'The database record matches the hash recorded on chain.'}
              </p>
              {result.record_hash && (
                <p className="mt-2 break-all font-mono text-xs text-gray-600">
                  {shortHash(result.record_hash)}
                </p>
              )}
              {result.block_number != null && (
                <p className="text-xs text-gray-500">Block {result.block_number}</p>
              )}
              {result.explorer_url && (
                <a
                  href={result.explorer_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-indigo-600 hover:underline"
                >
                  View on Etherscan ↗
                </a>
              )}
            </div>
          )}

          {result.result === 'MISMATCH' && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-800">✗ Mismatch</p>
              <p className="mt-1 text-sm text-gray-700">{result.explanation}</p>
              {result.stored_hash && (
                <p className="mt-2 text-xs text-gray-600">
                  Stored: <span className="break-all font-mono">{result.stored_hash}</span>
                </p>
              )}
              {result.recomputed_hash && (
                <p className="text-xs text-gray-600">
                  Recomputed: <span className="break-all font-mono">{result.recomputed_hash}</span>
                </p>
              )}
            </div>
          )}

          {result.result === 'NOT_ON_CHAIN' && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm font-semibold text-yellow-800">○ Not on chain</p>
              <p className="mt-1 text-sm text-gray-700">{result.explanation}</p>
            </div>
          )}
        </div>
      )}

      {!loading && !error && !result && (
        <p className="text-sm text-gray-500">
          Enter a batch code or record hash above to check whether the recorded decision matches the
          blockchain registry.
        </p>
      )}
    </main>
  );
}
