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
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EvidenceTable({ documents }: EvidenceTableProps) {
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
            <th className="px-4 py-3 text-left font-medium text-gray-500">Filename</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">SHA-256</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Size</th>
            <th className="px-4 py-3 text-left font-medium text-gray-500">Extraction</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {documents.map((doc) => (
            <tr key={doc.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{doc.filename}</td>
              <td className="px-4 py-3 font-mono text-gray-600">
                {doc.sha256_hash.slice(0, 12)}...
              </td>
              <td className="px-4 py-3 text-gray-600">{doc.mime_type}</td>
              <td className="px-4 py-3 text-gray-600">{formatBytes(doc.size_bytes)}</td>
              <td className="px-4 py-3">
                <StatusBadge status={doc.extraction_status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
