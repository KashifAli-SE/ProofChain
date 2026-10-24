'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Claim {
  claim_type: 'recycled_content' | 'low_carbon_manufacturing' | 'certificate_provided';
  value?: number;
  unit?: 'percent';
}

export default function NewBatchPage() {
  const router = useRouter();

  const [productName, setProductName] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [category, setCategory] = useState('textile');
  const [batchCode, setBatchCode] = useState('');
  const [productionDate, setProductionDate] = useState('');
  const [isDemo, setIsDemo] = useState(true);

  const [recycledContent, setRecycledContent] = useState(false);
  const [recycledContentValue, setRecycledContentValue] = useState(0);
  const [lowCarbon, setLowCarbon] = useState(false);
  const [certificateProvided, setCertificateProvided] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const claims: Claim[] = [];
    if (recycledContent) {
      claims.push({ claim_type: 'recycled_content', value: recycledContentValue, unit: 'percent' });
    }
    if (lowCarbon) {
      claims.push({ claim_type: 'low_carbon_manufacturing' });
    }
    if (certificateProvided) {
      claims.push({ claim_type: 'certificate_provided' });
    }

    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productName,
          supplierName,
          category,
          batchCode,
          productionDate: productionDate || undefined,
          claims,
          isDemo,
        }),
      });

      const json = (await res.json()) as
        | { success: true; data: { id: string } }
        | { success: false; error: { code: string; message: string } };

      if (!json.success) {
        setError(json.error.message);
        return;
      }

      router.push(`/batches/${json.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">New batch</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Product name */}
        <div>
          <label htmlFor="productName" className="block text-sm font-medium text-gray-700">
            Product name <span className="text-red-500">*</span>
          </label>
          <input
            id="productName"
            type="text"
            required
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        {/* Supplier name */}
        <div>
          <label htmlFor="supplierName" className="block text-sm font-medium text-gray-700">
            Supplier name <span className="text-red-500">*</span>
          </label>
          <input
            id="supplierName"
            type="text"
            required
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        {/* Category */}
        <div>
          <label htmlFor="category" className="block text-sm font-medium text-gray-700">
            Category
          </label>
          <input
            id="category"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        {/* Batch code */}
        <div>
          <label htmlFor="batchCode" className="block text-sm font-medium text-gray-700">
            Batch code <span className="text-red-500">*</span>
          </label>
          <input
            id="batchCode"
            type="text"
            required
            value={batchCode}
            onChange={(e) => setBatchCode(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        {/* Production date */}
        <div>
          <label htmlFor="productionDate" className="block text-sm font-medium text-gray-700">
            Production date
          </label>
          <input
            id="productionDate"
            type="date"
            value={productionDate}
            onChange={(e) => setProductionDate(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          />
        </div>

        {/* Demo batch */}
        <div className="flex items-center gap-2">
          <input
            id="isDemo"
            type="checkbox"
            checked={isDemo}
            onChange={(e) => setIsDemo(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="isDemo" className="text-sm font-medium text-gray-700">
            Demo batch
          </label>
        </div>

        {/* Claims */}
        <fieldset className="rounded-md border border-gray-200 p-4">
          <legend className="px-1 text-sm font-medium text-gray-700">Claims</legend>
          <div className="space-y-3">
            {/* Recycled content */}
            <div>
              <div className="flex items-center gap-2">
                <input
                  id="recycledContent"
                  type="checkbox"
                  checked={recycledContent}
                  onChange={(e) => setRecycledContent(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="recycledContent" className="text-sm text-gray-700">
                  Recycled content
                </label>
              </div>
              {recycledContent && (
                <div className="mt-2 ml-6 flex items-center gap-2">
                  <input
                    id="recycledContentValue"
                    type="number"
                    min={0}
                    max={100}
                    value={recycledContentValue}
                    onChange={(e) => setRecycledContentValue(Number(e.target.value))}
                    className="w-24 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              )}
            </div>

            {/* Low carbon manufacturing */}
            <div className="flex items-center gap-2">
              <input
                id="lowCarbon"
                type="checkbox"
                checked={lowCarbon}
                onChange={(e) => setLowCarbon(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="lowCarbon" className="text-sm text-gray-700">
                Low carbon manufacturing
              </label>
            </div>

            {/* Certificate provided */}
            <div className="flex items-center gap-2">
              <input
                id="certificateProvided"
                type="checkbox"
                checked={certificateProvided}
                onChange={(e) => setCertificateProvided(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <label htmlFor="certificateProvided" className="text-sm text-gray-700">
                Certificate provided
              </label>
            </div>
          </div>
        </fieldset>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create batch'}
          </button>
        </div>
      </form>
    </main>
  );
}
