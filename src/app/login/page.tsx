'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [passcode, setPasscode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/reviewer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ passcode }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Invalid passcode');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Login request failed. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-[80vh] items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-3xl">🔐</span>
          <h1 className="mt-3 text-2xl font-bold text-gray-900">Reviewer login</h1>
          <p className="mt-2 text-sm text-gray-500">
            Enter your passcode to access review and anchoring functions.
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="passcode" className="block text-sm font-medium text-gray-700">
                Passcode
              </label>
              <input
                id="passcode"
                type="password"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                autoFocus
                required
                placeholder="Enter reviewer passcode"
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !passcode}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        </div>

        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-800">What reviewers can do</p>
          <ul className="mt-2 space-y-1 text-xs text-amber-700">
            <li>✓ Submit VERIFIED / REJECTED / NEEDS EVIDENCE decisions</li>
            <li>✓ Anchor decisions on Sepolia blockchain</li>
            <li>✗ Cannot create or delete batches</li>
          </ul>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          <Link href="/" className="hover:underline">← Back to dashboard</Link>
        </p>
      </div>
    </main>
  );
}
