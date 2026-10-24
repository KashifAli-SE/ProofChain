import type { Finding } from '@/lib/agents/schemas';

interface FindingCardProps {
  finding: Finding;
}

const severityClasses: Record<string, string> = {
  high: 'bg-red-100 text-red-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-blue-100 text-blue-800',
};

export function FindingCard({ finding }: FindingCardProps) {
  const badgeClass = severityClasses[finding.severity] ?? 'bg-gray-100 text-gray-800';

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold text-gray-600">
              {finding.rule_id}
            </span>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
            >
              {finding.severity}
            </span>
            {finding.claim_type && (
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                {finding.claim_type}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-medium text-gray-900">{finding.finding}</p>
          <p className="mt-1 text-sm text-gray-500">{finding.reason}</p>
          {finding.evidence_ids.length > 0 && (
            <div className="mt-2">
              <span className="text-xs text-gray-400">Evidence: </span>
              {finding.evidence_ids.map((eid) => (
                <span
                  key={eid}
                  className="mr-1 inline-block rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600"
                >
                  {eid}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
