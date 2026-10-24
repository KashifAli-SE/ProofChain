import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuditReport, Finding, CarbonResult } from '../src/lib/agents/schemas';

// We need to mock generateJson before importing auditor.ts
vi.mock('../src/lib/llm/gemini', () => ({
  generateJson: vi.fn(),
}));

// Also mock env (so it doesn't try to parse process.env at import time)
vi.mock('../src/lib/env', () => ({
  env: new Proxy({} as Record<string, unknown>, {
    get(_t, prop) {
      const vals: Record<string, unknown> = {
        GEMINI_API_KEY: 'test-key',
        GEMINI_MODEL: 'gemini-pro',
      };
      return vals[prop as string] ?? 'test';
    },
  }),
}));

import { generateJson } from '../src/lib/llm/gemini';
import { runAuditor } from '../src/lib/agents/auditor';

const mockGenerateJson = vi.mocked(generateJson);

const FINDING_1: Finding = {
  finding_id: 'CERTIFICATE_DATE_VALIDITY:0',
  rule_id: 'CERTIFICATE_DATE_VALIDITY',
  result: 'FLAG',
  severity: 'high',
  finding: 'Certificate expired before production date.',
  reason: 'Expired 2024-01-01, production 2025-06-15.',
  evidence_ids: [],
  claim_type: null,
};

const FINDING_2: Finding = {
  finding_id: 'BATCH_ID_MATCH:1',
  rule_id: 'BATCH_ID_MATCH',
  result: 'PASS',
  severity: 'high',
  finding: 'Batch ID matched.',
  reason: 'Found in document.',
  evidence_ids: [],
  claim_type: null,
};

const FINDINGS = [FINDING_1, FINDING_2];

const CARBON: CarbonResult = {
  completeness: 'COMPLETE',
  factor_status: 'ILLUSTRATIVE_FACTORS',
  boundary: 'Test boundary.',
  lines: [],
  total_kgco2e: 450,
  kgco2e_per_unit: 0.45,
  assumptions: [],
  limitations: [],
};

const CLAIMS = [{ claim_type: 'recycled_content', value: 100, unit: 'percent' }];

beforeEach(() => {
  mockGenerateJson.mockReset();
});

describe('Auditor post-processing', () => {
  it('drops statements with cites referencing nonexistent finding IDs', async () => {
    const fakeReport: AuditReport = {
      summary: 'Audit complete.',
      claims: [{ claim_type: 'recycled_content', status: 'UNVERIFIED', basis: [] }],
      statements: [
        {
          text: 'Valid statement citing real finding.',
          cites: ['CERTIFICATE_DATE_VALIDITY:0'],
        },
        {
          text: 'Invalid statement citing nonexistent ID.',
          cites: ['NONEXISTENT_FINDING:999'],
        },
        {
          text: 'Valid limitation statement.',
          cites: ['LIMITATION'],
        },
      ],
      next_actions: [],
      recommendation: 'APPROVE',
    };

    mockGenerateJson.mockResolvedValueOnce(fakeReport);

    const report = await runAuditor(FINDINGS, CARBON, CLAIMS, 'REQUEST_EVIDENCE');

    // Statement with nonexistent finding_id must be dropped
    expect(report.statements).toHaveLength(2);
    expect(report.statements.some((s) => s.cites.includes('NONEXISTENT_FINDING:999'))).toBe(false);
    expect(report.statements.some((s) => s.cites.includes('CERTIFICATE_DATE_VALIDITY:0'))).toBe(true);
    expect(report.statements.some((s) => s.cites.includes('LIMITATION'))).toBe(true);
  });

  it('clamps recommendation to ceiling when LLM returns higher recommendation', async () => {
    const fakeReport: AuditReport = {
      summary: 'Audit complete.',
      claims: [],
      statements: [
        { text: 'Statement.', cites: ['CERTIFICATE_DATE_VALIDITY:0'] },
      ],
      next_actions: [],
      recommendation: 'APPROVE', // higher than ceiling
    };

    mockGenerateJson.mockResolvedValueOnce(fakeReport);

    const report = await runAuditor(FINDINGS, CARBON, CLAIMS, 'REQUEST_EVIDENCE');

    expect(report.recommendation).toBe('REQUEST_EVIDENCE'); // clamped down
  });

  it('does not upgrade recommendation when LLM returns lower recommendation than ceiling', async () => {
    const fakeReport: AuditReport = {
      summary: 'Audit complete.',
      claims: [],
      statements: [
        { text: 'Statement.', cites: ['CERTIFICATE_DATE_VALIDITY:0'] },
      ],
      next_actions: [],
      recommendation: 'REJECT', // lower than ceiling
    };

    mockGenerateJson.mockResolvedValueOnce(fakeReport);

    const report = await runAuditor(FINDINGS, CARBON, CLAIMS, 'APPROVE');

    expect(report.recommendation).toBe('REJECT'); // not upgraded
  });

  it('builds fallback report when LLM fails twice', async () => {
    const llmError = new Error('LLM unavailable');
    (llmError as NodeJS.ErrnoException).code = 'LLM_UNAVAILABLE';

    // Both calls fail (generateJson internally retries once, then throws — here we simulate
    // the already-retried error)
    mockGenerateJson.mockRejectedValueOnce(llmError);

    const report = await runAuditor(FINDINGS, CARBON, CLAIMS, 'REQUEST_EVIDENCE');

    // Fallback summary starts with "Automated narrative unavailable."
    expect(report.summary).toMatch(/^Automated narrative unavailable\./);
    // Recommendation is the ceiling
    expect(report.recommendation).toBe('REQUEST_EVIDENCE');
    // Statements exist for FLAG/UNKNOWN findings
    const flagFinding = FINDINGS.find((f) => f.result === 'FLAG');
    expect(
      report.statements.some((s) => s.cites.includes(flagFinding!.finding_id))
    ).toBe(true);
  });

  it('drops statements with empty cites array', async () => {
    const fakeReport: AuditReport = {
      summary: 'Audit.',
      claims: [],
      statements: [
        { text: 'Empty cites.', cites: [] },
        { text: 'Valid.', cites: ['CERTIFICATE_DATE_VALIDITY:0'] },
      ],
      next_actions: [],
      recommendation: 'APPROVE',
    };

    mockGenerateJson.mockResolvedValueOnce(fakeReport);

    const report = await runAuditor(FINDINGS, CARBON, CLAIMS, 'APPROVE');

    expect(report.statements.every((s) => s.cites.length > 0)).toBe(true);
    expect(report.statements).toHaveLength(1);
  });

  it('forces UNSUPPORTED for claim with REQUIRED_EVIDENCE_PRESENT FLAG', async () => {
    const findingWithReqEvidence: Finding = {
      finding_id: 'REQUIRED_EVIDENCE_PRESENT:0',
      rule_id: 'REQUIRED_EVIDENCE_PRESENT',
      result: 'FLAG',
      severity: 'high',
      finding: 'certificate missing for recycled_content',
      reason: 'hint',
      evidence_ids: [],
      claim_type: 'recycled_content',
    };

    const fakeReport: AuditReport = {
      summary: 'Audit.',
      claims: [
        { claim_type: 'recycled_content', status: 'UNVERIFIED', basis: [] },
      ],
      statements: [
        { text: 'Statement.', cites: ['REQUIRED_EVIDENCE_PRESENT:0'] },
      ],
      next_actions: [],
      recommendation: 'REQUEST_EVIDENCE',
    };

    mockGenerateJson.mockResolvedValueOnce(fakeReport);

    const report = await runAuditor(
      [findingWithReqEvidence],
      CARBON,
      [{ claim_type: 'recycled_content' }],
      'REQUEST_EVIDENCE'
    );

    const claim = report.claims.find((c) => c.claim_type === 'recycled_content');
    expect(claim?.status).toBe('UNSUPPORTED');
  });
});
