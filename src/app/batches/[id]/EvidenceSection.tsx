'use client';

import { useState, useEffect, useCallback } from 'react';
import { EvidenceTable, type EvidenceDocument } from '@/components/EvidenceTable';
import { EvidenceUpload } from '@/components/EvidenceUpload';

interface EvidenceSectionProps {
  batchId: string;
  batchStatus: string;
  initialDocs: EvidenceDocument[];
}

const DELETABLE = ['DRAFT', 'IN_REVIEW', 'NEEDS_EVIDENCE', 'REJECTED', 'RECHECK_REQUIRED'];

export function EvidenceSection({ batchId, batchStatus, initialDocs }: EvidenceSectionProps) {
  const [docs, setDocs] = useState<EvidenceDocument[]>(initialDocs);
  const [refreshing, setRefreshing] = useState(false);

  const fetchDocs = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/batches/${batchId}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.evidenceDocuments)) {
        setDocs(json.data.evidenceDocuments as EvidenceDocument[]);
      }
    } catch {
      // keep showing initialDocs on network error
    } finally {
      setRefreshing(false);
    }
  }, [batchId]);

  // Always fetch fresh docs from the API on mount
  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  function handleDeleted(docId: string) {
    setDocs((prev) => prev.filter((d) => d.id !== docId));
  }

  const showUpload = DELETABLE.includes(batchStatus);

  return (
    <div>
      {refreshing && docs.length === 0 ? (
        <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
          <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading documents…
        </div>
      ) : (
        <EvidenceTable
          documents={docs}
          batchId={batchId}
          batchStatus={batchStatus}
          onDeleted={handleDeleted}
        />
      )}
      {refreshing && docs.length > 0 && (
        <p className="mt-1 text-xs text-gray-400">Refreshing…</p>
      )}
      {showUpload && (
        <EvidenceUpload batchId={batchId} onUploaded={() => void fetchDocs()} />
      )}
    </div>
  );
}
