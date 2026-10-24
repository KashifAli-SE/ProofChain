import type { Finding, CarbonResult } from './schemas';

export type Rec = 'APPROVE' | 'REQUEST_EVIDENCE' | 'REJECT';

export const RANK: Record<Rec, number> = {
  APPROVE: 2,
  REQUEST_EVIDENCE: 1,
  REJECT: 0,
};

export const clamp = (llm: Rec, ceiling: Rec): Rec =>
  RANK[llm] <= RANK[ceiling] ? llm : ceiling;

/**
 * Derives the recommendation ceiling based on cross-checker findings,
 * carbon result, and declared claims.
 * From design.md §Status policy.
 */
export function deriveCeiling(
  findings: Finding[],
  carbon: CarbonResult,
  claims: string[]
): Rec {
  // 1. Any FLAG high on CERTIFICATE_DATE_VALIDITY, BATCH_ID_MATCH, or direct value
  //    mismatch (RECYCLED_CONTENT_VALUE_MATCH) -> REQUEST_EVIDENCE
  const highFlagRules = new Set([
    'CERTIFICATE_DATE_VALIDITY',
    'BATCH_ID_MATCH',
    'RECYCLED_CONTENT_VALUE_MATCH',
  ]);
  const hasHighFlagOnCritical = findings.some(
    (f) =>
      f.result === 'FLAG' &&
      f.severity === 'high' &&
      highFlagRules.has(f.rule_id)
  );
  if (hasHighFlagOnCritical) return 'REQUEST_EVIDENCE';

  // 2. Any UNKNOWN/FLAG on REQUIRED_EVIDENCE_PRESENT or ENERGY_DATA_PRESENT
  //    for a declared claim -> REQUEST_EVIDENCE
  const evidenceRules = new Set(['REQUIRED_EVIDENCE_PRESENT', 'ENERGY_DATA_PRESENT']);
  const hasEvidenceIssue = findings.some(
    (f) =>
      (f.result === 'UNKNOWN' || f.result === 'FLAG') &&
      evidenceRules.has(f.rule_id)
  );
  if (hasEvidenceIssue) return 'REQUEST_EVIDENCE';

  // 3. Carbon INSUFFICIENT with declared low_carbon_manufacturing -> REQUEST_EVIDENCE
  const hasLowCarbon = claims.includes('low_carbon_manufacturing');
  if (hasLowCarbon && carbon.completeness === 'INSUFFICIENT') {
    return 'REQUEST_EVIDENCE';
  }

  // 4. Otherwise APPROVE
  return 'APPROVE';
}
