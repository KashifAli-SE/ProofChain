'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [reviewerAuthed, setReviewerAuthed] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Check reviewer auth by pinging a lightweight endpoint
  useEffect(() => {
    fetch('/api/auth/reviewer/check', { credentials: 'same-origin' })
      .then((r) => setReviewerAuthed(r.ok))
      .catch(() => setReviewerAuthed(false));
  }, [pathname]);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch('/api/auth/reviewer/logout', { method: 'POST', credentials: 'same-origin' });
    setReviewerAuthed(false);
    setLoggingOut(false);
    router.refresh();
  }

  const navLinks = [
    { href: '/', label: 'Batches' },
    { href: '/verify', label: 'Verify' },
  ];

  return (
    <nav className="sticky top-0 z-50 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-bold text-indigo-600">⛓ ProofChain</span>
          <span className="hidden rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-500 sm:inline">
            AI
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                pathname === link.href
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Auth indicator */}
        <div className="flex items-center gap-3">
          {reviewerAuthed ? (
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                Reviewer
              </span>
              <button
                onClick={() => void handleLogout()}
                disabled={loggingOut}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                {loggingOut ? 'Logging out…' : 'Log out'}
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                pathname === '/login'
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
            >
              Reviewer login
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
