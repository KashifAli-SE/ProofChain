'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { FindingCard } from '@/components/FindingCard';
import { CarbonPanel } from '@/components/CarbonPanel';
import type { Finding, CarbonResult, AuditReport } from '@/lib/agents/schemas';

interface RunReport {
  id: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  error_code?: string | null;
  findings?: Finding[] | null;
  carbon_result?: CarbonResult | null;
  audit_report?: AuditReport | null;
  recommendation_ceiling?: string | null;
  ai_recommendation?: string | null;
  completed_at?: string | null;
}

interface AnalysisPanelProps {
  batchId: string;
  batchStatus?: string;
}

type GroupLabel = 'Verified by check' | 'Inconsistent' | 'Missing' | 'Unverified';

function groupFindings(
  findings: Finding[]
): Record<GroupLabel, Finding[]> {
  const groups: Record<GroupLabel, Finding[]> = {
    'Verified by check': [],
    'Inconsistent': [],
    'Missing': [],
    'Unverified': [],
  };

  for (const f of findings) {
    if (f.result === 'PASS') {
      groups['Verified by check'].push(f);
    } else if (f.result === 'FLAG') {
      groups['Inconsistent'].push(f);
    } else if (f.result === 'UNKNOWN' && f.rule_id === 'REQUIRED_EVIDENCE_PRESENT') {
      groups['Missing'].push(f);
    } else {
      groups['Unverified'].push(f);
    }
  }

  return groups;
}

export function AnalysisPanel({ batchId, batchStatus }: AnalysisPanelProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<RunReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const fetchReport = useCallback(async (): Promise<RunReport | null> => {
    const res = await fetch(`/api/batches/${batchId}/report`);
    if (!res.ok) return null;
    const json = (await res.json()) as { success: boolean; data: RunReport };
    return json.success ? json.data : null;
  }, [batchId]);

  // Poll until status is COMPLETED or FAILED
  useEffect(() => {
    if (!polling) return;

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    async function poll() {
      if (cancelled) return;
      const run = await fetchReport();
      if (cancelled) return;

      if (run) {
        setReport(run);
        if (run.status === 'COMPLETED' || run.status === 'FAILED') {
          setPolling(false);
          setIsRunning(false);
          return;
        }
      }

      timeoutId = setTimeout(poll, 2000);
    }

    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [polling, fetchReport]);

  async function handleRunAnalysis() {
    setIsRunning(true);
    setError(null);
    setReport(null);

    try {
      const res = await fetch(`/api/batches/${batchId}/analyze`, {
        method: 'POST',
      });
      const json = (await res.json()) as {
        success: boolean;
        data?: { runId: string; status: string };
        error?: { code: string; message: string };
      };

      if (!json.success) {
        setError(json.error?.message ?? 'Failed to start analysis');
        setIsRunning(false);
        return;
      }

      // Start polling
      setPolling(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setIsRunning(false);
    }
  }

  const findings = report?.findings ?? [];
  const groupedFindings = groupFindings(findings);
  const groupOrder: GroupLabel[] = ['Inconsistent', 'Missing', 'Unverified', 'Verified by check'];

  return (
    <section className="mb-8 rounded-lg border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Run analysis
        </h2>
        <div className="flex items-center gap-2">
          {batchStatus && ['IN_REVIEW','VERIFIED','REJECTED','NEEDS_EVIDENCE','RECHECK_REQUIRED'].includes(batchStatus) && (
            <Link
              href={`/batches/${batchId}/review`}
              className="rounded-lg border border-indigo-600 px-4 py-2 text-sm font-semibold text-indigo-600 hover:bg-indigo-50"
            >
              Review →
            </Link>
          )}
          <button
            onClick={() => void handleRunAnalysis()}
            disabled={isRunning}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              isRunning
                ? 'bg-indigo-300 text-white cursor-not-allowed'
                : 'bg-indigo-600 text-white hover:bg-indigo-700'
            }`}
          >
            {isRunning ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analysing…
              </span>
            ) : (
              'Run analysis'
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {report?.status === 'FAILED' && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 mb-4">
          <p className="text-sm text-red-700">
            Analysis failed{report.error_code ? ` (${report.error_code})` : ''}.
          </p>
        </div>
      )}

      {report?.status === 'COMPLETED' && (
        <div className="space-y-6">
          {/* Recommendation + Review CTA */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-100 bg-indigo-50 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-gray-600">AI recommendation:</span>
              <span
                className={`rounded-full px-3 py-1 text-sm font-semibold ${
                  report.ai_recommendation === 'APPROVE'
                    ? 'bg-green-100 text-green-800'
                    : report.ai_recommendation === 'REJECT'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {report.ai_recommendation ?? '—'}
              </span>
              <span className="text-xs text-gray-400">(ceiling: {report.recommendation_ceiling})</span>
            </div>
            <Link
              href={`/batches/${batchId}/review`}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow hover:bg-indigo-700"
            >
              Submit review →
            </Link>
          </div>

          {/* Audit summary */}
          {report.audit_report?.summary && (
            <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
              {report.audit_report.summary}
            </div>
          )}

          {/* Findings grouped */}
          {findings.length > 0 && (
            <div className="space-y-4">
              {groupOrder.map((group) => {
                const items = groupedFindings[group];
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {group} ({items.length})
                    </h3>
                    <div className="space-y-2">
                      {items.map((f) => (
                        <FindingCard key={f.finding_id} finding={f} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Carbon panel */}
          {report.carbon_result && <CarbonPanel carbon={report.carbon_result} />}

          {/* Next actions */}
          {report.audit_report?.next_actions && report.audit_report.next_actions.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Recommended next actions</h3>
              <ul className="space-y-2">
                {report.audit_report.next_actions.map((action, i) => (
                  <li key={i} className="flex gap-2 text-sm text-gray-700">
                    <span className="text-gray-400">→</span>
                    <span>
                      {action.action}{' '}
                      <span className="font-mono text-xs text-gray-400">({action.finding_id})</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
