import type { ActivityData, CarbonResult } from './schemas';
import type emissionFactorsJson from '../../../config/emission-factors.json';

// The boundary constant — verbatim from AGENT_SPECS.md Agent 3 section
const BOUNDARY =
  'Facility energy use for the stated period only. Excludes raw materials, transport, use and end-of-life.';

type EmissionFactorsJson = typeof emissionFactorsJson;

interface Factor {
  id: string;
  kind: string;
  unit: string;
  value: number;
  source: string;
  verified: boolean;
}

type CarbonLine = CarbonResult['lines'][number];

export function computeCarbon(
  activity: ActivityData,
  factorsJson: EmissionFactorsJson
): CarbonResult {
  // 1. Build factor index by kind
  const factorIndex = new Map<string, Factor>();
  for (const f of factorsJson.factors) {
    factorIndex.set(f.kind, f as Factor);
  }

  // Build unit_conversions index: from -> { to, multiply_by }
  type Conversion = { from: string; to: string; multiply_by: number };
  const conversionIndex = new Map<string, Conversion>();
  for (const c of factorsJson.unit_conversions) {
    conversionIndex.set(c.from, c as Conversion);
  }

  const lines: CarbonLine[] = [];
  const limitations: string[] = [];
  const assumptions: string[] = [];
  const usedFactors: Factor[] = [];

  for (const line of activity.lines) {
    const factor = factorIndex.get(line.kind) ?? null;

    // 2. quantity null or quality=missing -> kgco2e=null, add limitation
    if (line.quantity == null || line.quality === 'missing') {
      lines.push({
        id: line.id,
        kind: line.kind,
        quantity: line.quantity,
        unit: line.unit,
        quality: line.quality,
        factor_id: factor?.id ?? null,
        factor_value: factor?.value ?? null,
        factor_unit: factor?.unit ?? null,
        factor_source: factor?.source ?? null,
        kgco2e: null,
      });
      limitations.push(`${line.kind} quantity missing`);
      continue;
    }

    if (!factor) {
      // No factor for this kind
      lines.push({
        id: line.id,
        kind: line.kind,
        quantity: line.quantity,
        unit: line.unit,
        quality: line.quality,
        factor_id: null,
        factor_value: null,
        factor_unit: null,
        factor_source: null,
        kgco2e: null,
      });
      limitations.push(`unit mismatch for ${line.kind}`);
      continue;
    }

    // 3. Check unit against factor unit, apply unit_conversions if needed
    let quantity = line.quantity;
    let effectiveUnit = line.unit;

    if (effectiveUnit !== factor.unit) {
      const conversion = conversionIndex.get(effectiveUnit);
      if (conversion && conversion.to === factor.unit) {
        quantity = quantity * conversion.multiply_by;
        effectiveUnit = factor.unit;
      } else {
        // No conversion exists
        lines.push({
          id: line.id,
          kind: line.kind,
          quantity: line.quantity,
          unit: line.unit,
          quality: line.quality,
          factor_id: factor.id,
          factor_value: factor.value,
          factor_unit: factor.unit,
          factor_source: factor.source,
          kgco2e: null,
        });
        limitations.push(`unit mismatch for ${line.kind}`);
        continue;
      }
    }

    // 4. kgco2e = quantity × factor.value
    const kgco2eRaw = quantity * factor.value;
    const kgco2e = Math.round(kgco2eRaw * 100) / 100;

    lines.push({
      id: line.id,
      kind: line.kind,
      quantity: line.quantity,
      unit: line.unit,
      quality: line.quality,
      factor_id: factor.id,
      factor_value: factor.value,
      factor_unit: factor.unit,
      factor_source: factor.source,
      kgco2e,
    });

    usedFactors.push(factor);
    assumptions.push(`Factor used: ${factor.id} (${factor.source}); line ${line.id}${line.quality === 'estimated' ? ' [estimated]' : ''}.`);
  }

  // 5. completeness
  const electricityLines = lines.filter((l) => l.kind === 'electricity');
  const electricityComputed = electricityLines.filter((l) => l.kgco2e !== null);
  const allComputed = lines.every((l) => l.kgco2e !== null);

  let completeness: CarbonResult['completeness'];
  if (electricityLines.length === 0 || electricityComputed.length === 0) {
    completeness = 'INSUFFICIENT';
  } else if (allComputed) {
    completeness = 'COMPLETE';
  } else {
    completeness = 'PARTIAL';
  }

  // 6. total and kgco2e_per_unit
  const computedValues = lines.map((l) => l.kgco2e).filter((v): v is number => v !== null);
  const totalRaw = computedValues.length > 0 ? computedValues.reduce((a, b) => a + b, 0) : null;
  const total_kgco2e = totalRaw !== null ? Math.round(totalRaw * 100) / 100 : null;

  const kgco2e_per_unit =
    total_kgco2e !== null &&
    activity.production_units !== null &&
    activity.production_units > 0
      ? Math.round((total_kgco2e / activity.production_units) * 100) / 100
      : null;

  // 7. factor_status
  const factor_status: CarbonResult['factor_status'] =
    usedFactors.some((f) => !f.verified) ? 'ILLUSTRATIVE_FACTORS' : 'VERIFIED_FACTORS';

  // 8. boundary constant

  return {
    completeness,
    factor_status,
    boundary: BOUNDARY,
    lines,
    total_kgco2e,
    kgco2e_per_unit,
    assumptions,
    limitations,
  };
}
