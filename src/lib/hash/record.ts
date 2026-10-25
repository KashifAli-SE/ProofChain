import { keccak256, toUtf8Bytes } from 'ethers';
import { createHash } from 'node:crypto';
import { canonicalJson } from './canonical';
import type { Finding, CarbonResult } from '@/lib/agents/schemas';

export const sha256Hex = (s: string): string =>
  createHash('sha256').update(s).digest('hex');

export const recordHash = (record: unknown): string =>
  keccak256(toUtf8Bytes(canonicalJson(record)));

export const batchIdHash = (batchCode: string): string =>
  keccak256(toUtf8Bytes(batchCode));

// ---------- VerificationRecord shape (design.md §Canonical record and hashing) ----------

export interface EvidenceEntry {
  sha256: string;
  document_type: string;
}

export interface VerificationRecord {
  schema: 'proofchain/1';
  batch_code: string;
  claims: string[]; // sorted
  run_number: number;
  ai_recommendation: string;
  evidence: EvidenceEntry[]; // sorted by sha256
  findings_digest: string; // sha256 of canonicalJson(findings sorted by finding_id)
  carbon_digest: string; // sha256 of canonicalJson(carbon_result) or '' if null
  decision: 'VERIFIED' | 'REJECTED' | 'NEEDS_EVIDENCE';
  override_confirmed: boolean;
  decided_at: string; // ISO UTC
}

export interface BuildRecordParams {
  batch_code: string;
  claims: string[];
  run_number: number;
  ai_recommendation: string;
  evidence: EvidenceEntry[];
  findings: Finding[];
  carbon_result: CarbonResult | null;
  decision: 'VERIFIED' | 'REJECTED' | 'NEEDS_EVIDENCE';
  override_confirmed: boolean;
  decided_at: string;
}

export function buildRecord(params: BuildRecordParams): VerificationRecord {
  const sortedClaims = [...params.claims].sort();
  const sortedEvidence = [...params.evidence].sort((a, b) =>
    a.sha256.localeCompare(b.sha256)
  );
  const sortedFindings = [...params.findings].sort((a, b) =>
    a.finding_id.localeCompare(b.finding_id)
  );

  const findings_digest = sha256Hex(canonicalJson(sortedFindings));
  const carbon_digest = params.carbon_result
    ? sha256Hex(canonicalJson(params.carbon_result))
    : '';

  return {
    schema: 'proofchain/1',
    batch_code: params.batch_code,
    claims: sortedClaims,
    run_number: params.run_number,
    ai_recommendation: params.ai_recommendation,
    evidence: sortedEvidence,
    findings_digest,
    carbon_digest,
    decision: params.decision,
    override_confirmed: params.override_confirmed,
    decided_at: params.decided_at,
  };
}
