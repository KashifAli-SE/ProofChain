import { describe, it, expect } from 'vitest';
import { canonicalJson } from '../src/lib/hash/canonical';
import { recordHash, buildRecord, sha256Hex } from '../src/lib/hash/record';

// ---------- canonicalJson tests ----------

describe('canonicalJson', () => {
  it('sorts object keys recursively', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('preserves array order', () => {
    expect(canonicalJson({ x: [3, 1, 2] })).toBe('{"x":[3,1,2]}');
  });

  it('is pure — returns same string for same input on multiple calls', () => {
    const input = { z: 'hello', a: [1, 2, { q: 99, m: 0 }] };
    const first = canonicalJson(input);
    const second = canonicalJson(input);
    expect(first).toBe(second);
  });

  it('handles null primitives', () => {
    expect(canonicalJson(null)).toBe('null');
  });

  it('handles numbers and booleans', () => {
    expect(canonicalJson(42)).toBe('42');
    expect(canonicalJson(true)).toBe('true');
  });

  it('handles string primitives', () => {
    expect(canonicalJson('hello')).toBe('"hello"');
  });

  it('omits undefined values', () => {
    // undefined values in objects must be filtered out
    const obj: Record<string, unknown> = { a: 1, b: undefined, c: 3 };
    expect(canonicalJson(obj)).toBe('{"a":1,"c":3}');
  });
});

// ---------- recordHash / stable known vector ----------

describe('recordHash — stable known vector', () => {
  it('returns a deterministic keccak256 hex for a fixed VerificationRecord', () => {
    // Build a VerificationRecord with fixed, deterministic inputs
    const record = buildRecord({
      batch_code: 'TX-1042',
      claims: ['low_carbon_manufacturing', 'recycled_content'],
      run_number: 1,
      ai_recommendation: 'REQUEST_EVIDENCE',
      evidence: [
        { sha256: 'aabbcc', document_type: 'certificate' },
        { sha256: '001122', document_type: 'invoice' },
      ],
      findings: [
        {
          finding_id: 'CERTIFICATE_DATE_VALIDITY:0',
          rule_id: 'CERTIFICATE_DATE_VALIDITY',
          result: 'FLAG',
          severity: 'high',
          finding: 'Certificate expired before production date',
          reason: 'Expiry 2024-01-01 < production 2025-01-01',
          evidence_ids: ['doc-1'],
          claim_type: null,
        },
      ],
      carbon_result: {
        completeness: 'INSUFFICIENT',
        factor_status: 'ILLUSTRATIVE_FACTORS',
        boundary: 'Scope 1 and 2',
        lines: [],
        total_kgco2e: null,
        kgco2e_per_unit: null,
        assumptions: [],
        limitations: ['No electricity data'],
      },
      decision: 'NEEDS_EVIDENCE',
      override_confirmed: false,
      decided_at: '2025-01-15T12:00:00.000Z',
    });

    // Compute canonicalJson of the record and hash it
    const hash = recordHash(record);

    // The hash must be a 0x-prefixed 32-byte (64 hex char) keccak256
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);

    // Stable vector: second call with same input must return the identical hash
    const hash2 = recordHash(record);
    expect(hash).toBe(hash2);

    // Known stable vector — precomputed value locked in so any future change to
    // canonicalJson or buildRecord breaks this test deterministically.
    expect(hash).toBe('0xafdf543a2be7e591a79a2962474951375f34a3dd7b14dd90e226a5ef782816cd');
  });

  it('sha256Hex produces a 64-char lowercase hex string', () => {
    const h = sha256Hex('hello world');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    // Deterministic — calling twice returns the same value
    expect(h).toBe(sha256Hex('hello world'));
  });
});
