'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Link from 'next/link';

interface QrCardProps {
  batchCode: string;
}

export function QrCard({ batchCode }: QrCardProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // NEXT_PUBLIC_APP_URL is inlined at build time for the client bundle.
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/passport/${batchCode}`;

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, { width: 240, margin: 1 })
      .then((d) => {
        if (!cancelled) setDataUrl(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to generate QR code');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5">
      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt={`QR code linking to the public passport for batch ${batchCode}`}
          width={240}
          height={240}
          className="mx-auto"
        />
      ) : (
        <div className="mx-auto flex h-[240px] w-[240px] items-center justify-center">
          <svg
            className="h-6 w-6 animate-spin text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      )}

      <div className="mt-4 text-center">
        <Link href={url} className="text-sm font-medium text-indigo-600 hover:underline">
          Scan to view public passport
        </Link>
        <p className="mt-1 break-all font-mono text-xs text-gray-400">{url}</p>
      </div>
    </div>
  );
}
