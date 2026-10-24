import { describe, it, expect } from 'vitest';
import { deriveCeiling, clamp, RANK } from '../src/lib/agents/status-policy';
import type { Finding, CarbonResult } from '../src/lib/agents/schemas';

function makeFinding(overrides: Partial<Finding>): Finding {
  return {
    finding_id: 'RULE:0',
    rule_id: 'SOME_RULE',
    result: 'PASS',
    severity: 'low',
    finding: 'Test finding',
    reason: 'Test reason',
    evidence_ids: [],
    claim_type: null,
    ...overrides,
  };
}

const COMPLETE_CARBON: CarbonResult = {
  completeness: 'COMPLETE',
  factor_status: 'ILLUSTRATIVE_FACTORS',
  boundary: 'Test boundary',
  lines: [],
  total_kgco2e: null,
  kgco2e_per_unit: null,
  assumptions: [],
  limitations: [],
};

const INSUFFICIENT_CARBON: CarbonResult = {
  ...COMPLETE_CARBON,
  completeness: 'INSUFFICIENT',
};

// ---- RANK ----
describe('RANK', () => {
  it('APPROVE > REQUEST_EVIDENCE > REJECT', () => {
    expect(RANK.APPROVE).toBeGreaterThan(RANK.REQUEST_EVIDENCE);
    expect(RANK.REQUEST_EVIDENCE).toBeGreaterThan(RANK.REJECT);
  });
});

// ---- clamp ----
describe('clamp', () => {
  it('APPROVE with ceiling REQUEST_EVIDENCE -> REQUEST_EVIDENCE (clamped down)', () => {
    expect(clamp('APPROVE', 'REQUEST_EVIDENCE')).toBe('REQUEST_EVIDENCE');
  });

  it('REJECT with ceiling APPROVE -> REJECT (not upgraded)', () => {
    expect(clamp('REJECT', 'APPROVE')).toBe('REJECT');
  });

  it('REQUEST_EVIDENCE with ceiling REQUEST_EVIDENCE -> REQUEST_EVIDENCE', () => {
    expect(clamp('REQUEST_EVIDENCE', 'REQUEST_EVIDENCE')).toBe('REQUEST_EVIDENCE');
  });

  it('REJECT with ceiling REJECT -> REJECT', () => {
    expect(clamp('REJECT', 'REJECT')).toBe('REJECT');
  });

  it('APPROVE with ceiling APPROVE -> APPROVE', () => {
    expect(clamp('APPROVE', 'APPROVE')).toBe('APPROVE');
  });
});

// ---- deriveCeiling ----
describe('deriveCeiling', () => {
  it('APPROVE when all findings PASS and carbon COMPLETE', () => {
    const findings = [makeFinding({ result: 'PASS' })];
    expect(deriveCeiling(findings, COMPLETE_CARBON, [])).toBe('APPROVE');
  });

  // Rule 1: FLAG high on CERTIFICATE_DATE_VALIDITY -> REQUEST_EVIDENCE
  it('REQUEST_EVIDENCE on FLAG high on CERTIFICATE_DATE_VALIDITY', () => {
    const findings = [
      makeFinding({
        rule_id: 'CERTIFICATE_DATE_VALIDITY',
        result: 'FLAG',
        severity: 'high',
      }),
    ];
    expect(deriveCeiling(findings, COMPLETE_CARBON, [])).toBe('REQUEST_EVIDENCE');
  });

  // Rule 1: FLAG high on BATCH_ID_MATCH -> REQUEST_EVIDENCE
  it('REQUEST_EVIDENCE on FLAG high on BATCH_ID_MATCH', () => {
    const findings = [
      makeFinding({
        rule_id: 'BATCH_ID_MATCH',
        result: 'FLAG',
        severity: 'high',
      }),
    ];
    expect(deriveCeiling(findings, COMPLETE_CARBON, [])).toBe('REQUEST_EVIDENCE');
  });

  // Rule 1: FLAG high on RECYCLED_CONTENT_VALUE_MATCH -> REQUEST_EVIDENCE
  it('REQUEST_EVIDENCE on FLAG high on RECYCLED_CONTENT_VALUE_MATCH', () => {
    const findings = [
      makeFinding({
        rule_id: 'RECYCLED_CONTENT_VALUE_MATCH',
        result: 'FLAG',
        severity: 'high',
      }),
    ];
    expect(deriveCeiling(findings, COMPLETE_CARBON, [])).toBe('REQUEST_EVIDENCE');
  });

  // Rule 1: FLAG medium on CERTIFICATE_DATE_VALIDITY should NOT trigger rule 1
  it('APPROVE on FLAG medium on CERTIFICATE_DATE_VALIDITY (not high)', () => {
    const findings = [
      makeFinding({
        rule_id: 'CERTIFICATE_DATE_VALIDITY',
        result: 'FLAG',
        severity: 'medium', // not high
      }),
    ];
    // Rule 2 won't fire either (not an evidence rule)
    expect(deriveCeiling(findings, COMPLETE_CARBON, [])).toBe('APPROVE');
  });

  // Rule 2: FLAG on REQUIRED_EVIDENCE_PRESENT -> REQUEST_EVIDENCE
  it('REQUEST_EVIDENCE on FLAG on REQUIRED_EVIDENCE_PRESENT', () => {
    const findings = [
      makeFinding({
        rule_id: 'REQUIRED_EVIDENCE_PRESENT',
        result: 'FLAG',
        severity: 'high',
      }),
    ];
    expect(deriveCeiling(findings, COMPLETE_CARBON, [])).toBe('REQUEST_EVIDENCE');
  });

  // Rule 2: UNKNOWN on ENERGY_DATA_PRESENT -> REQUEST_EVIDENCE
  it('REQUEST_EVIDENCE on UNKNOWN on ENERGY_DATA_PRESENT', () => {
    const findings = [
      makeFinding({
        rule_id: 'ENERGY_DATA_PRESENT',
        result: 'UNKNOWN',
        severity: 'high',
      }),
    ];
    expect(deriveCeiling(findings, COMPLETE_CARBON, [])).toBe('REQUEST_EVIDENCE');
  });

  // Rule 3: carbon INSUFFICIENT + low_carbon_manufacturing claim -> REQUEST_EVIDENCE
  it('REQUEST_EVIDENCE on INSUFFICIENT carbon with low_carbon_manufacturing claim', () => {
    expect(
      deriveCeiling([], INSUFFICIENT_CARBON, ['low_carbon_manufacturing'])
    ).toBe('REQUEST_EVIDENCE');
  });

  // Rule 3: carbon INSUFFICIENT without low_carbon_manufacturing -> APPROVE
  it('APPROVE on INSUFFICIENT carbon without low_carbon_manufacturing claim', () => {
    expect(deriveCeiling([], INSUFFICIENT_CARBON, [])).toBe('APPROVE');
  });
});
