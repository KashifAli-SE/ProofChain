import { describe, it, expect } from 'vitest';
import { computeCarbon } from '../src/lib/agents/climate-analyst';
import type { ActivityData } from '../src/lib/agents/schemas';
import factorsJson from '../config/emission-factors.json';

// Helper to build activity data
function makeActivity(overrides: Partial<ActivityData> = {}): ActivityData {
  return {
    period_start: '2025-01-01',
    period_end: '2025-03-31',
    production_units: 1000,
    lines: [],
    ...overrides,
  };
}

describe('computeCarbon', () => {
  it('complete case: all lines computed, COMPLETE completeness, correct totals', () => {
    const activity = makeActivity({
      lines: [
        { id: 'e1', kind: 'electricity', quantity: 1000, unit: 'kWh', quality: 'measured', source_doc_id: null },
        { id: 'd1', kind: 'diesel', quantity: 100, unit: 'L', quality: 'measured', source_doc_id: null },
        { id: 'g1', kind: 'natural_gas', quantity: 50, unit: 'm3', quality: 'measured', source_doc_id: null },
      ],
    });
    const result = computeCarbon(activity, factorsJson);

    expect(result.completeness).toBe('COMPLETE');

    const elec = result.lines.find((l) => l.id === 'e1')!;
    expect(elec.kgco2e).toBeCloseTo(1000 * 0.45, 1); // 450

    const diesel = result.lines.find((l) => l.id === 'd1')!;
    expect(diesel.kgco2e).toBeCloseTo(100 * 2.68, 1); // 268

    const gas = result.lines.find((l) => l.id === 'g1')!;
    expect(gas.kgco2e).toBeCloseTo(50 * 2.0, 1); // 100

    expect(result.total_kgco2e).toBeCloseTo(450 + 268 + 100, 0);
    expect(result.kgco2e_per_unit).toBeCloseTo((450 + 268 + 100) / 1000, 2);
  });

  it('missing electricity line -> INSUFFICIENT', () => {
    const activity = makeActivity({
      lines: [
        { id: 'd1', kind: 'diesel', quantity: 100, unit: 'L', quality: 'measured', source_doc_id: null },
      ],
    });
    const result = computeCarbon(activity, factorsJson);
    expect(result.completeness).toBe('INSUFFICIENT');
  });

  it('electricity present but null quantity -> INSUFFICIENT', () => {
    const activity = makeActivity({
      lines: [
        { id: 'e1', kind: 'electricity', quantity: null, unit: 'kWh', quality: 'measured', source_doc_id: null },
      ],
    });
    const result = computeCarbon(activity, factorsJson);
    expect(result.completeness).toBe('INSUFFICIENT');
  });

  it('unit mismatch (gallons for electricity) -> kgco2e=null for that line, limitation text present', () => {
    const activity = makeActivity({
      lines: [
        { id: 'e1', kind: 'electricity', quantity: 1000, unit: 'gallons', quality: 'measured', source_doc_id: null },
      ],
    });
    const result = computeCarbon(activity, factorsJson);

    const eLine = result.lines.find((l) => l.id === 'e1')!;
    expect(eLine.kgco2e).toBeNull();
    expect(result.limitations.some((l) => l.includes('electricity'))).toBe(true);
  });

  it('MWh converted to kWh correctly', () => {
    const activity = makeActivity({
      lines: [
        { id: 'e1', kind: 'electricity', quantity: 1, unit: 'MWh', quality: 'measured', source_doc_id: null },
      ],
    });
    const result = computeCarbon(activity, factorsJson);
    const eLine = result.lines.find((l) => l.id === 'e1')!;
    // 1 MWh = 1000 kWh, × 0.45 = 450 kgco2e
    expect(eLine.kgco2e).toBeCloseTo(450, 1);
  });

  it('ILLUSTRATIVE_FACTORS label present when any factor verified:false', () => {
    // Current config has all verified:false
    const activity = makeActivity({
      lines: [
        { id: 'e1', kind: 'electricity', quantity: 100, unit: 'kWh', quality: 'measured', source_doc_id: null },
      ],
    });
    const result = computeCarbon(activity, factorsJson);
    expect(result.factor_status).toBe('ILLUSTRATIVE_FACTORS');
  });

  it('PARTIAL: some lines computed, not all', () => {
    const activity = makeActivity({
      lines: [
        { id: 'e1', kind: 'electricity', quantity: 1000, unit: 'kWh', quality: 'measured', source_doc_id: null },
        { id: 'd1', kind: 'diesel', quantity: null, unit: 'L', quality: 'missing', source_doc_id: null },
      ],
    });
    const result = computeCarbon(activity, factorsJson);
    expect(result.completeness).toBe('PARTIAL');
  });

  it('boundary constant is set correctly', () => {
    const result = computeCarbon(makeActivity(), factorsJson);
    expect(result.boundary).toBe(
      'Facility energy use for the stated period only. Excludes raw materials, transport, use and end-of-life.'
    );
  });

  it('kgco2e_per_unit is null when production_units is null', () => {
    const activity = makeActivity({
      production_units: null,
      lines: [
        { id: 'e1', kind: 'electricity', quantity: 1000, unit: 'kWh', quality: 'measured', source_doc_id: null },
      ],
    });
    const result = computeCarbon(activity, factorsJson);
    expect(result.kgco2e_per_unit).toBeNull();
  });

  it('total_kgco2e is null when no lines have computed kgco2e', () => {
    const activity = makeActivity({
      lines: [
        { id: 'e1', kind: 'electricity', quantity: null, unit: 'kWh', quality: 'missing', source_doc_id: null },
      ],
    });
    const result = computeCarbon(activity, factorsJson);
    expect(result.total_kgco2e).toBeNull();
  });

  it('rounds to 2dp at output', () => {
    // 333 kWh × 0.45 = 149.85
    const activity = makeActivity({
      lines: [
        { id: 'e1', kind: 'electricity', quantity: 333, unit: 'kWh', quality: 'measured', source_doc_id: null },
      ],
    });
    const result = computeCarbon(activity, factorsJson);
    const eLine = result.lines.find((l) => l.id === 'e1')!;
    expect(eLine.kgco2e).toBe(149.85);
    expect(result.total_kgco2e).toBe(149.85);
  });
});
