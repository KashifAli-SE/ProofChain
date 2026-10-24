'use client';

import { useState } from 'react';

interface ActivityFormProps {
  batchId: string;
  initialData: Record<string, unknown> | null;
}

export function ActivityForm({ batchId, initialData }: ActivityFormProps) {
  const [value, setValue] = useState(
    initialData ? JSON.stringify(initialData, null, 2) : ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      setError('Invalid JSON — please fix the syntax before saving.');
      setSaving(false);
      return;
    }

    try {
      const res = await fetch(`/api/batches/${batchId}/activity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });

      const json = (await res.json()) as
        | { success: true }
        | { success: false; error: { message: string } };

      if (!json.success) {
        setError(json.error.message);
        return;
      }

      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save activity data.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => { setValue(e.target.value); setSaved(false); }}
        rows={8}
        placeholder='{"transportMode": "sea", "distanceKm": 12000, ...}'
        className="block w-full rounded-md border-gray-300 font-mono text-xs shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
        aria-label="Activity data JSON"
      />
      {error && (
        <p className="mt-2 text-sm text-red-600">{error}</p>
      )}
      {saved && (
        <p className="mt-2 text-sm text-green-600">Activity data saved.</p>
      )}
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save activity data'}
      </button>
    </div>
  );
}
