'use client';

import { useState } from 'react';
import { StatusBadge } from './StatusBadge';

export interface EvidenceDocument {
  id: string;
  filename: string;
  sha256_hash: string;
  mime_type: string;
  size_bytes: number;
  extraction_status: string;
  created_at?: string;
}

interface EvidenceTableProps {
  documents: EvidenceDocument[];
  batchId?: string;
  batchStatus?: string;
  onDeleted?: (docId: string) => void;
}

const DELETABLE_STATUSES = ['DRAFT', 'IN_REVIEW', 'NEEDS_EVIDENCE', 'REJECTED', 'RECHECK_REQUIRED'];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocRow({
  doc,
  batchId,
  canDelete,
  onDeleted,
}: {
  doc: EvidenceDocument;
  batchId?: string;
  canDelete: boolean;
  onDeleted?: (docId: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    if (!batchId) return;
    if (!confirm(`Delete "${doc.filename}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/batches/${batchId}/evidence/${doc.id}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Delete failed');
        setDeleting(false);
        return;
      }
      onDeleted?.(doc.id);
    } catch {
      setError('Network error');
      setDeleting(false);
    }
  }

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <span className="font-medium text-gray-900">{doc.filename}</span>
        {error && <p className="mt-0.5 text-xs text-red-600">{error}</p>}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-gray-500">
        {doc.sha256_hash.slice(0, 12)}…
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {doc.mime_type === 'application/pdf' ? 'PDF' : 'TXT'}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">{formatBytes(doc.size_bytes)}</td>
      <td className="px-4 py-3">
        <StatusBadge status={doc.extraction_status} />
      </td>
      {canDelete && (
        <td className="px-4 py-3 text-right">
          <button
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40"
            title={`Delete ${doc.filename}`}
          >
            {deleting ? 'Deleting…' : '✕ Delete'}
          </button>
        </td>
      )}
    </tr>
  );
}

export function EvidenceTable({
  documents,
  batchId,
  batchStatus,
  onDeleted,
}: EvidenceTableProps) {
  const canDelete = !!batchId && !!batchStatus && DELETABLE_STATUSES.includes(batchStatus);

  if (documents.length === 0) {
    return (
      <p className="text-sm text-gray-500">No evidence documents uploaded yet.</p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Filename</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">SHA-256</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Type</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Size</th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Extraction</th>
            {canDelete && (
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">Actions</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {documents.map((doc) => (
            <DocRow
              key={doc.id}
              doc={doc}
              batchId={batchId}
              canDelete={canDelete}
              onDeleted={onDeleted}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
