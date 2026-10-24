import { describe, it, expect } from 'vitest';
import { runChecks } from '../src/lib/agents/cross-checker';
import type { DocumentExtraction } from '../src/lib/agents/schemas';

// Helper to build a minimal batch
function makeBatch(overrides: Partial<Parameters<typeof runChecks>[0]> = {}): Parameters<typeof runChecks>[0] {
  return {
    id: 'batch-1',
    batch_code: 'TX-1042',
    production_date: '2025-06-15',
    supplier_name: 'Example Textile Ltd.',
    claims: [],
    activity_data: null,
    ...overrides,
  };
}

// Helper to build a minimal DocumentExtraction
function makeExtraction(overrides: Partial<DocumentExtraction> = {}): DocumentExtraction {
  return {
    document_type: 'other',
    issuer: null,
    supplier_name: null,
    certificate_id: null,
    issue_date: null,
    expiry_date: null,
    batch_ids: [],
    quantities: [],
    claims: [],
    is_demo_marked: false,
    missing_fields: [],
    uncertainties: [],
    ...overrides,
  };
}

const NOW = new Date('2025-09-01T00:00:00Z');

// ---- CERTIFICATE_DATE_VALIDITY ----
describe('CERTIFICATE_DATE_VALIDITY', () => {
  it('PASS: cert valid at production date', () => {
    const cert = makeExtraction({
      document_type: 'certificate',
      issue_date: '2025-01-01',
      expiry_date: '2025-12-31',
    });
    const findings = runChecks(makeBatch(), [cert], NOW);
    const f = findings.find((x) => x.rule_id === 'CERTIFICATE_DATE_VALIDITY')!;
    expect(f.result).toBe('PASS');
  });

  it('FLAG(high): cert expired before production date', () => {
    const cert = makeExtraction({
      document_type: 'certificate',
      issue_date: '2024-01-01',
      expiry_date: '2025-01-01', // before production_date 2025-06-15
    });
    const findings = runChecks(makeBatch(), [cert], NOW);
    const f = findings.find((x) => x.rule_id === 'CERTIFICATE_DATE_VALIDITY')!;
    expect(f.result).toBe('FLAG');
    expect(f.severity).toBe('high');
  });

  it('FLAG(high): cert issued after production date', () => {
    const cert = makeExtraction({
      document_type: 'certificate',
      issue_date: '2025-07-01', // after production_date 2025-06-15
      expiry_date: '2026-12-31',
    });
    const findings = runChecks(makeBatch(), [cert], NOW);
    const f = findings.find((x) => x.rule_id === 'CERTIFICATE_DATE_VALIDITY')!;
    expect(f.result).toBe('FLAG');
    expect(f.severity).toBe('high');
  });

  it('UNKNOWN: no certificate document', () => {
    const findings = runChecks(makeBatch(), [], NOW);
    const f = findings.find((x) => x.rule_id === 'CERTIFICATE_DATE_VALIDITY')!;
    expect(f.result).toBe('UNKNOWN');
  });

  it('UNKNOWN: certificate with null expiry', () => {
    const cert = makeExtraction({
      document_type: 'certificate',
      issue_date: '2025-01-01',
      expiry_date: null,
    });
    const findings = runChecks(makeBatch(), [cert], NOW);
    const f = findings.find((x) => x.rule_id === 'CERTIFICATE_DATE_VALIDITY')!;
    expect(f.result).toBe('UNKNOWN');
  });
});

// ---- CERTIFICATE_NOT_EXPIRED_NOW ----
describe('CERTIFICATE_NOT_EXPIRED_NOW', () => {
  it('PASS: cert valid now', () => {
    const cert = makeExtraction({
      document_type: 'certificate',
      expiry_date: '2026-12-31',
    });
    const findings = runChecks(makeBatch(), [cert], NOW);
    const f = findings.find((x) => x.rule_id === 'CERTIFICATE_NOT_EXPIRED_NOW')!;
    expect(f.result).toBe('PASS');
  });

  it('FLAG(medium): cert expired before now', () => {
    const cert = makeExtraction({
      document_type: 'certificate',
      expiry_date: '2025-01-01', // before NOW 2025-09-01
    });
    const findings = runChecks(makeBatch(), [cert], NOW);
    const f = findings.find((x) => x.rule_id === 'CERTIFICATE_NOT_EXPIRED_NOW')!;
    expect(f.result).toBe('FLAG');
    expect(f.severity).toBe('medium');
  });

  it('UNKNOWN: no certificate', () => {
    const findings = runChecks(makeBatch(), [], NOW);
    const f = findings.find((x) => x.rule_id === 'CERTIFICATE_NOT_EXPIRED_NOW')!;
    expect(f.result).toBe('UNKNOWN');
  });

  it('UNKNOWN: cert with null expiry', () => {
    const cert = makeExtraction({
      document_type: 'certificate',
      expiry_date: null,
    });
    const findings = runChecks(makeBatch(), [cert], NOW);
    const f = findings.find((x) => x.rule_id === 'CERTIFICATE_NOT_EXPIRED_NOW')!;
    expect(f.result).toBe('UNKNOWN');
  });
});

// ---- SUPPLIER_NAME_MATCH ----
describe('SUPPLIER_NAME_MATCH', () => {
  it('PASS: names match after normalisation', () => {
    const doc = makeExtraction({ supplier_name: 'Example Textile Ltd.' });
    const findings = runChecks(makeBatch({ supplier_name: 'Example Textile Ltd.' }), [doc], NOW);
    const f = findings.find((x) => x.rule_id === 'SUPPLIER_NAME_MATCH')!;
    expect(f.result).toBe('PASS');
  });

  it('PASS: names match despite Ltd/Inc variants', () => {
    const doc = makeExtraction({ supplier_name: 'Example Textile Inc' });
    const findings = runChecks(makeBatch({ supplier_name: 'Example Textile Ltd.' }), [doc], NOW);
    const f = findings.find((x) => x.rule_id === 'SUPPLIER_NAME_MATCH')!;
    expect(f.result).toBe('PASS');
  });

  it('FLAG(medium): names do not match', () => {
    const doc = makeExtraction({ supplier_name: 'Totally Different Corp' });
    const findings = runChecks(makeBatch({ supplier_name: 'Example Textile Ltd.' }), [doc], NOW);
    const f = findings.find((x) => x.rule_id === 'SUPPLIER_NAME_MATCH')!;
    expect(f.result).toBe('FLAG');
    expect(f.severity).toBe('medium');
  });

  it('UNKNOWN: no supplier in any document', () => {
    const doc = makeExtraction({ supplier_name: null });
    const findings = runChecks(makeBatch(), [doc], NOW);
    const f = findings.find((x) => x.rule_id === 'SUPPLIER_NAME_MATCH')!;
    expect(f.result).toBe('UNKNOWN');
  });
});

// ---- BATCH_ID_MATCH ----
describe('BATCH_ID_MATCH', () => {
  it('PASS: batch code found in document batch_ids', () => {
    const doc = makeExtraction({ batch_ids: ['TX-1042', 'TX-999'] });
    const findings = runChecks(makeBatch(), [doc], NOW);
    const f = findings.find((x) => x.rule_id === 'BATCH_ID_MATCH')!;
    expect(f.result).toBe('PASS');
  });

  it('FLAG(high): document lists batch ids but none matches', () => {
    const doc = makeExtraction({ batch_ids: ['TX-9999'] });
    const findings = runChecks(makeBatch(), [doc], NOW);
    const f = findings.find((x) => x.rule_id === 'BATCH_ID_MATCH')!;
    expect(f.result).toBe('FLAG');
    expect(f.severity).toBe('high');
  });

  it('UNKNOWN: no document lists any batch ids', () => {
    const doc = makeExtraction({ batch_ids: [] });
    const findings = runChecks(makeBatch(), [doc], NOW);
    const f = findings.find((x) => x.rule_id === 'BATCH_ID_MATCH')!;
    expect(f.result).toBe('UNKNOWN');
  });
});

// ---- RECYCLED_CONTENT_VALUE_MATCH ----
describe('RECYCLED_CONTENT_VALUE_MATCH', () => {
  it('PASS: cert recycled content matches declared value', () => {
    const cert = makeExtraction({
      document_type: 'certificate',
      claims: [{ claim_type: 'recycled_content', claim: 'RC 100%', value: 100, unit: 'percent', quote: '100%', page: 1 }],
    });
    const batch = makeBatch({ claims: [{ claim_type: 'recycled_content', value: 100, unit: 'percent' }] });
    const findings = runChecks(batch, [cert], NOW);
    const f = findings.find((x) => x.rule_id === 'RECYCLED_CONTENT_VALUE_MATCH')!;
    expect(f.result).toBe('PASS');
  });

  it('PASS: within tolerance of ±0.5', () => {
    const cert = makeExtraction({
      document_type: 'certificate',
      claims: [{ claim_type: 'recycled_content', claim: 'RC', value: 99.7, unit: 'percent', quote: '99.7%', page: 1 }],
    });
    const batch = makeBatch({ claims: [{ claim_type: 'recycled_content', value: 100, unit: 'percent' }] });
    const findings = runChecks(batch, [cert], NOW);
    const f = findings.find((x) => x.rule_id === 'RECYCLED_CONTENT_VALUE_MATCH')!;
    expect(f.result).toBe('PASS');
  });

  it('FLAG(high): values differ by more than ±0.5', () => {
    const cert = makeExtraction({
      document_type: 'certificate',
      claims: [{ claim_type: 'recycled_content', claim: 'RC', value: 80, unit: 'percent', quote: '80%', page: 1 }],
    });
    const batch = makeBatch({ claims: [{ claim_type: 'recycled_content', value: 100, unit: 'percent' }] });
    const findings = runChecks(batch, [cert], NOW);
    const f = findings.find((x) => x.rule_id === 'RECYCLED_CONTENT_VALUE_MATCH')!;
    expect(f.result).toBe('FLAG');
    expect(f.severity).toBe('high');
  });

  it('UNKNOWN: no document gives a recycled %', () => {
    const doc = makeExtraction({ document_type: 'invoice' });
    const batch = makeBatch({ claims: [{ claim_type: 'recycled_content', value: 100, unit: 'percent' }] });
    const findings = runChecks(batch, [doc], NOW);
    const f = findings.find((x) => x.rule_id === 'RECYCLED_CONTENT_VALUE_MATCH')!;
    expect(f.result).toBe('UNKNOWN');
  });
});

// ---- QUANTITY_CONSISTENCY ----
describe('QUANTITY_CONSISTENCY', () => {
  it('PASS: same quantity on invoice and declaration', () => {
    const invoice = makeExtraction({
      document_type: 'invoice',
      quantities: [{ label: 'recycled cotton fibre', value: 1000, unit: 'kg', quote: '1000kg' }],
    });
    const declaration = makeExtraction({
      document_type: 'declaration',
      quantities: [{ label: 'recycled cotton fibre', value: 1000, unit: 'kg', quote: '1000kg' }],
    });
    const findings = runChecks(makeBatch(), [invoice, declaration], NOW);
    const f = findings.find((x) => x.rule_id === 'QUANTITY_CONSISTENCY')!;
    expect(f.result).toBe('PASS');
  });

  it('FLAG(medium): quantities differ by more than 2%', () => {
    const invoice = makeExtraction({
      document_type: 'invoice',
      quantities: [{ label: 'recycled cotton fibre', value: 1000, unit: 'kg', quote: '1000kg' }],
    });
    const declaration = makeExtraction({
      document_type: 'declaration',
      quantities: [{ label: 'recycled cotton fibre', value: 900, unit: 'kg', quote: '900kg' }],
    });
    const findings = runChecks(makeBatch(), [invoice, declaration], NOW);
    const f = findings.find((x) => x.rule_id === 'QUANTITY_CONSISTENCY')!;
    expect(f.result).toBe('FLAG');
    expect(f.severity).toBe('medium');
  });

  it('UNKNOWN: fewer than 2 comparable quantities', () => {
    const invoice = makeExtraction({
      document_type: 'invoice',
      quantities: [{ label: 'recycled cotton fibre', value: 1000, unit: 'kg', quote: '1000kg' }],
    });
    // Only 1 document with a quantity
    const findings = runChecks(makeBatch(), [invoice], NOW);
    const f = findings.find((x) => x.rule_id === 'QUANTITY_CONSISTENCY')!;
    expect(f.result).toBe('UNKNOWN');
  });
});

// ---- REQUIRED_EVIDENCE_PRESENT ----
describe('REQUIRED_EVIDENCE_PRESENT', () => {
  it('PASS: all required docs present for recycled_content', () => {
    const cert = makeExtraction({ document_type: 'certificate' });
    const comp = makeExtraction({ document_type: 'composition_report' });
    const inv = makeExtraction({ document_type: 'invoice' });
    const batch = makeBatch({ claims: [{ claim_type: 'recycled_content' }] });
    const findings = runChecks(batch, [cert, comp, inv], NOW);
    const relevant = findings.filter((x) => x.rule_id === 'REQUIRED_EVIDENCE_PRESENT');
    expect(relevant.every((f) => f.result === 'PASS')).toBe(true);
  });

  it('FLAG(high): missing certificate for recycled_content', () => {
    const comp = makeExtraction({ document_type: 'composition_report' });
    const inv = makeExtraction({ document_type: 'invoice' });
    const batch = makeBatch({ claims: [{ claim_type: 'recycled_content' }] });
    const findings = runChecks(batch, [comp, inv], NOW);
    const flagged = findings.filter(
      (x) => x.rule_id === 'REQUIRED_EVIDENCE_PRESENT' && x.result === 'FLAG'
    );
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((f) => f.severity === 'high')).toBe(true);
    expect(flagged.some((f) => f.finding.includes('certificate'))).toBe(true);
  });

  it('PASS for low_carbon_manufacturing when energy_report present', () => {
    const energy = makeExtraction({ document_type: 'energy_report' });
    const batch = makeBatch({ claims: [{ claim_type: 'low_carbon_manufacturing' }] });
    const findings = runChecks(batch, [energy], NOW);
    const relevant = findings.filter((x) => x.rule_id === 'REQUIRED_EVIDENCE_PRESENT');
    expect(relevant.every((f) => f.result === 'PASS')).toBe(true);
  });
});

// ---- ENERGY_DATA_PRESENT ----
describe('ENERGY_DATA_PRESENT', () => {
  it('PASS: electricity kWh > 0 and energy_report present', () => {
    const energy = makeExtraction({ document_type: 'energy_report' });
    const batch = makeBatch({
      claims: [{ claim_type: 'low_carbon_manufacturing' }],
      activity_data: {
        lines: [{ kind: 'electricity', quantity: 1000, unit: 'kWh' }],
      },
    });
    const findings = runChecks(batch, [energy], NOW);
    const f = findings.find((x) => x.rule_id === 'ENERGY_DATA_PRESENT')!;
    expect(f.result).toBe('PASS');
  });

  it('FLAG(high): low_carbon_manufacturing claim but no energy data', () => {
    const batch = makeBatch({
      claims: [{ claim_type: 'low_carbon_manufacturing' }],
      activity_data: null,
    });
    const findings = runChecks(batch, [], NOW);
    const f = findings.find((x) => x.rule_id === 'ENERGY_DATA_PRESENT')!;
    expect(f.result).toBe('FLAG');
    expect(f.severity).toBe('high');
  });

  it('PASS: no low_carbon_manufacturing claim — rule not applicable', () => {
    const findings = runChecks(makeBatch(), [], NOW);
    const f = findings.find((x) => x.rule_id === 'ENERGY_DATA_PRESENT')!;
    expect(f.result).toBe('PASS');
  });
});

// ---- Determinism ----
describe('Determinism', () => {
  it('runChecks returns deep-equal results for identical inputs', () => {
    const cert = makeExtraction({
      document_type: 'certificate',
      issue_date: '2025-01-01',
      expiry_date: '2025-12-31',
      supplier_name: 'Example Textile Ltd.',
      batch_ids: ['TX-1042'],
      claims: [{ claim_type: 'recycled_content', claim: 'RC 100%', value: 100, unit: 'percent', quote: '100%', page: 1 }],
    });
    const batch = makeBatch({
      claims: [{ claim_type: 'recycled_content', value: 100, unit: 'percent' }],
    });
    const fixedNow = new Date('2025-09-01T12:00:00Z');
    const result1 = runChecks(batch, [cert], fixedNow);
    const result2 = runChecks(batch, [cert], fixedNow);
    expect(result1).toStrictEqual(result2);
  });
});
