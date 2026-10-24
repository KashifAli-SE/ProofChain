import type { Finding, DocumentExtraction } from './schemas';
import evidenceRequirements from '../../../config/evidence-requirements.json';

// ---------- Types ----------
interface BatchClaim {
  claim_type: string;
  value?: number | null;
  unit?: string | null;
}

interface ActivityLine {
  kind: string;
  quantity: number | null;
  unit: string;
}

interface BatchWithClaims {
  id: string;
  batch_code: string;
  production_date: string | null;
  supplier_name?: string | null;
  claims: BatchClaim[];
  activity_data?: {
    lines?: ActivityLine[];
  } | null;
}

// ---------- Name normalisation helper (verbatim from AGENT_SPECS.md) ----------
export function normaliseName(name: string): string {
  const stopTokens = new Set(['ltd', 'limited', 'pvt', 'private', 'inc', 'llc', 'co', 'company']);
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // remove punctuation
    .split(/\s+/)
    .filter((t) => t.length > 0 && !stopTokens.has(t))
    .join(' ');
}

// ---------- Quantity label normalisation ----------
function normaliseLabel(label: string): string {
  let l = label.toLowerCase().trim();
  if (l.endsWith('s')) l = l.slice(0, -1);
  return l;
}

// ---------- Helper: parse YYYY-MM-DD safely ----------
function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

// ---------- Rule implementations ----------

function ruleCertificateDateValidity(
  batch: BatchWithClaims,
  extractions: DocumentExtraction[],
  index: number
): Finding {
  const ruleId = 'CERTIFICATE_DATE_VALIDITY';
  const productionDate = parseDate(batch.production_date);
  const certs = extractions.filter((e) => e.document_type === 'certificate');

  if (certs.length === 0 || !productionDate) {
    return {
      finding_id: `${ruleId}:${index}`,
      rule_id: ruleId,
      result: 'UNKNOWN',
      severity: 'high',
      finding: 'Cannot verify certificate date validity.',
      reason: certs.length === 0
        ? 'No certificate document found.'
        : 'Production date is null.',
      evidence_ids: [],
      claim_type: null,
    };
  }

  for (const cert of certs) {
    const expiry = parseDate(cert.expiry_date);
    const issue = parseDate(cert.issue_date);

    if (!expiry || !issue) {
      return {
        finding_id: `${ruleId}:${index}`,
        rule_id: ruleId,
        result: 'UNKNOWN',
        severity: 'high',
        finding: 'Certificate dates are missing or unparseable.',
        reason: 'One or more certificate dates are null.',
        evidence_ids: [],
        claim_type: null,
      };
    }

    // FLAG if expiry < production_date or issue > production_date
    if (expiry < productionDate || issue > productionDate) {
      return {
        finding_id: `${ruleId}:${index}`,
        rule_id: ruleId,
        result: 'FLAG',
        severity: 'high',
        finding: 'Certificate was not valid at the time of production.',
        reason: expiry < productionDate
          ? `Certificate expired (${cert.expiry_date}) before production date (${batch.production_date}).`
          : `Certificate was issued (${cert.issue_date}) after production date (${batch.production_date}).`,
        evidence_ids: [],
        claim_type: null,
      };
    }
  }

  return {
    finding_id: `${ruleId}:${index}`,
    rule_id: ruleId,
    result: 'PASS',
    severity: 'high',
    finding: 'Certificate was valid at the time of production.',
    reason: 'Certificate issue and expiry dates bracket the production date.',
    evidence_ids: [],
    claim_type: null,
  };
}

function ruleCertificateNotExpiredNow(
  extractions: DocumentExtraction[],
  now: Date,
  index: number
): Finding {
  const ruleId = 'CERTIFICATE_NOT_EXPIRED_NOW';
  const certs = extractions.filter((e) => e.document_type === 'certificate');

  if (certs.length === 0) {
    return {
      finding_id: `${ruleId}:${index}`,
      rule_id: ruleId,
      result: 'UNKNOWN',
      severity: 'medium',
      finding: 'No certificate to check for expiry.',
      reason: 'No certificate document found.',
      evidence_ids: [],
      claim_type: null,
    };
  }

  for (const cert of certs) {
    const expiry = parseDate(cert.expiry_date);
    if (!expiry) {
      return {
        finding_id: `${ruleId}:${index}`,
        rule_id: ruleId,
        result: 'UNKNOWN',
        severity: 'medium',
        finding: 'Certificate expiry date is missing.',
        reason: 'Cannot determine if certificate has expired.',
        evidence_ids: [],
        claim_type: null,
      };
    }
    if (expiry < now) {
      return {
        finding_id: `${ruleId}:${index}`,
        rule_id: ruleId,
        result: 'FLAG',
        severity: 'medium',
        finding: 'Certificate has expired.',
        reason: `Certificate expired on ${cert.expiry_date}, which is before now.`,
        evidence_ids: [],
        claim_type: null,
      };
    }
  }

  return {
    finding_id: `${ruleId}:${index}`,
    rule_id: ruleId,
    result: 'PASS',
    severity: 'medium',
    finding: 'Certificate is currently valid.',
    reason: 'Certificate expiry date is in the future.',
    evidence_ids: [],
    claim_type: null,
  };
}

function ruleSupplierNameMatch(
  batch: BatchWithClaims,
  extractions: DocumentExtraction[],
  index: number
): Finding {
  const ruleId = 'SUPPLIER_NAME_MATCH';
  const batchSupplier = batch.supplier_name ?? null;
  const docsWithSupplier = extractions.filter((e) => e.supplier_name !== null);

  if (docsWithSupplier.length === 0) {
    return {
      finding_id: `${ruleId}:${index}`,
      rule_id: ruleId,
      result: 'UNKNOWN',
      severity: 'medium',
      finding: 'No supplier name found in any document.',
      reason: 'Cannot verify supplier name match.',
      evidence_ids: [],
      claim_type: null,
    };
  }

  if (!batchSupplier) {
    return {
      finding_id: `${ruleId}:${index}`,
      rule_id: ruleId,
      result: 'UNKNOWN',
      severity: 'medium',
      finding: 'Batch has no declared supplier name.',
      reason: 'Cannot verify supplier name match.',
      evidence_ids: [],
      claim_type: null,
    };
  }

  const normBatch = normaliseName(batchSupplier);
  const matched = docsWithSupplier.some(
    (e) => normaliseName(e.supplier_name!) === normBatch
  );

  if (!matched) {
    return {
      finding_id: `${ruleId}:${index}`,
      rule_id: ruleId,
      result: 'FLAG',
      severity: 'medium',
      finding: 'Supplier name in documents does not match declared supplier.',
      reason: `Declared: "${batchSupplier}". Documents had: ${docsWithSupplier.map((e) => `"${e.supplier_name}"`).join(', ')}.`,
      evidence_ids: [],
      claim_type: null,
    };
  }

  return {
    finding_id: `${ruleId}:${index}`,
    rule_id: ruleId,
    result: 'PASS',
    severity: 'medium',
    finding: 'Supplier name matches at least one document.',
    reason: `Declared supplier "${batchSupplier}" normalises to match a document supplier.`,
    evidence_ids: [],
    claim_type: null,
  };
}

function ruleBatchIdMatch(
  batch: BatchWithClaims,
  extractions: DocumentExtraction[],
  index: number
): Finding {
  const ruleId = 'BATCH_ID_MATCH';
  const docsWithBatchIds = extractions.filter((e) => e.batch_ids && e.batch_ids.length > 0);

  if (docsWithBatchIds.length === 0) {
    return {
      finding_id: `${ruleId}:${index}`,
      rule_id: ruleId,
      result: 'UNKNOWN',
      severity: 'high',
      finding: 'No document lists batch IDs.',
      reason: 'Cannot verify batch ID consistency.',
      evidence_ids: [],
      claim_type: null,
    };
  }

  for (const doc of docsWithBatchIds) {
    const hasMatch = doc.batch_ids.some((id) => id === batch.batch_code);
    if (!hasMatch) {
      return {
        finding_id: `${ruleId}:${index}`,
        rule_id: ruleId,
        result: 'FLAG',
        severity: 'high',
        finding: 'A document lists batch IDs that do not include this batch code.',
        reason: `Batch code "${batch.batch_code}" not found in document batch_ids: [${doc.batch_ids.join(', ')}].`,
        evidence_ids: [],
        claim_type: null,
      };
    }
  }

  return {
    finding_id: `${ruleId}:${index}`,
    rule_id: ruleId,
    result: 'PASS',
    severity: 'high',
    finding: 'Batch ID found in all documents that list batch IDs.',
    reason: `Batch code "${batch.batch_code}" is present in every document that lists batch IDs.`,
    evidence_ids: [],
    claim_type: null,
  };
}

function ruleRecycledContentValueMatch(
  batch: BatchWithClaims,
  extractions: DocumentExtraction[],
  index: number
): Finding {
  const ruleId = 'RECYCLED_CONTENT_VALUE_MATCH';
  const declaredClaim = batch.claims.find((c) => c.claim_type === 'recycled_content');

  if (!declaredClaim || declaredClaim.value == null) {
    // Not declared — still run check but no doc to compare
    const docRecycledClaims = extractions.flatMap((e) =>
      e.claims.filter((c) => c.claim_type === 'recycled_content' && c.value != null)
    );
    if (docRecycledClaims.length === 0) {
      return {
        finding_id: `${ruleId}:${index}`,
        rule_id: ruleId,
        result: 'UNKNOWN',
        severity: 'high',
        finding: 'No recycled content percentage found in any document.',
        reason: 'Cannot verify recycled content value.',
        evidence_ids: [],
        claim_type: 'recycled_content',
      };
    }
    // No declared claim to compare against
    return {
      finding_id: `${ruleId}:${index}`,
      rule_id: ruleId,
      result: 'UNKNOWN',
      severity: 'high',
      finding: 'Recycled content value found in documents but no declared value on batch.',
      reason: 'Cannot verify match without a declared recycled content value.',
      evidence_ids: [],
      claim_type: 'recycled_content',
    };
  }

  const declaredValue = declaredClaim.value;

  // Find recycled % from certificate or composition_report
  const docValues = extractions
    .filter((e) => e.document_type === 'certificate' || e.document_type === 'composition_report')
    .flatMap((e) => e.claims)
    .filter((c) => c.claim_type === 'recycled_content' && c.value != null)
    .map((c) => c.value as number);

  if (docValues.length === 0) {
    // Also check any document type
    const anyDocValues = extractions
      .flatMap((e) => e.claims)
      .filter((c) => c.claim_type === 'recycled_content' && c.value != null)
      .map((c) => c.value as number);

    if (anyDocValues.length === 0) {
      return {
        finding_id: `${ruleId}:${index}`,
        rule_id: ruleId,
        result: 'UNKNOWN',
        severity: 'high',
        finding: 'No document gives a recycled content percentage.',
        reason: 'Cannot verify declared recycled content value.',
        evidence_ids: [],
        claim_type: 'recycled_content',
      };
    }
    // Use any doc value
    docValues.push(...anyDocValues);
  }

  // Check if any document value matches within ±0.5
  const tolerance = 0.5;
  const matchFound = docValues.some((v) => Math.abs(v - declaredValue) <= tolerance);

  if (!matchFound) {
    return {
      finding_id: `${ruleId}:${index}`,
      rule_id: ruleId,
      result: 'FLAG',
      severity: 'high',
      finding: `Recycled content value in documents (${docValues.join(', ')}) differs from declared value (${declaredValue}) by more than ${tolerance} percentage points.`,
      reason: `Declared: ${declaredValue}. Document values: [${docValues.join(', ')}]. Tolerance: ±${tolerance}.`,
      evidence_ids: [],
      claim_type: 'recycled_content',
    };
  }

  return {
    finding_id: `${ruleId}:${index}`,
    rule_id: ruleId,
    result: 'PASS',
    severity: 'high',
    finding: 'Recycled content value in documents matches declared value.',
    reason: `Declared: ${declaredValue}. Document value(s): [${docValues.join(', ')}]. Within ±${tolerance} tolerance.`,
    evidence_ids: [],
    claim_type: 'recycled_content',
  };
}

function ruleQuantityConsistency(
  extractions: DocumentExtraction[],
  index: number
): Finding {
  const ruleId = 'QUANTITY_CONSISTENCY';
  // Only compare invoice and declaration document types
  const relevantDocs = extractions.filter(
    (e) => e.document_type === 'invoice' || e.document_type === 'declaration'
  );

  // Group quantities by normalised label + unit across documents
  type QEntry = { label: string; unit: string; value: number };
  const allQuantities: QEntry[] = relevantDocs.flatMap((e) =>
    e.quantities.map((q) => ({
      label: normaliseLabel(q.label),
      unit: q.unit.toLowerCase().trim(),
      value: q.value,
    }))
  );

  // Group by label+unit
  const groups = new Map<string, number[]>();
  for (const q of allQuantities) {
    const key = `${q.label}|${q.unit}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(q.value);
  }

  // Find groups with at least 2 values
  const comparableGroups = [...groups.entries()].filter(([, vals]) => vals.length >= 2);

  if (comparableGroups.length === 0) {
    return {
      finding_id: `${ruleId}:${index}`,
      rule_id: ruleId,
      result: 'UNKNOWN',
      severity: 'medium',
      finding: 'Fewer than 2 comparable quantities found across invoice and declaration documents.',
      reason: 'Cannot verify quantity consistency.',
      evidence_ids: [],
      claim_type: null,
    };
  }

  for (const [key, values] of comparableGroups) {
    const max = Math.max(...values);
    const min = Math.min(...values);
    // Differ > 2% of the larger value
    if (max > 0 && (max - min) / max > 0.02) {
      return {
        finding_id: `${ruleId}:${index}`,
        rule_id: ruleId,
        result: 'FLAG',
        severity: 'medium',
        finding: `Quantity inconsistency detected for "${key}": values differ by more than 2%.`,
        reason: `Values found: [${values.join(', ')}]. Max: ${max}, Min: ${min}, Difference: ${(((max - min) / max) * 100).toFixed(2)}%.`,
        evidence_ids: [],
        claim_type: null,
      };
    }
  }

  return {
    finding_id: `${ruleId}:${index}`,
    rule_id: ruleId,
    result: 'PASS',
    severity: 'medium',
    finding: 'Quantities across invoice and declaration documents are consistent.',
    reason: 'All matching quantity labels are within the 2% tolerance.',
    evidence_ids: [],
    claim_type: null,
  };
}

function ruleRequiredEvidencePresent(
  batch: BatchWithClaims,
  extractions: DocumentExtraction[],
  startIndex: number
): Finding[] {
  const findings: Finding[] = [];
  const presentTypes = new Set(extractions.map((e) => e.document_type));

  const reqClaims = evidenceRequirements.claims as Record<
    string,
    { label: string; required_document_types: string[]; hint: string }
  >;

  let idx = startIndex;
  for (const claim of batch.claims) {
    const req = reqClaims[claim.claim_type];
    if (!req) continue;

    for (const docType of req.required_document_types) {
      const ruleId = 'REQUIRED_EVIDENCE_PRESENT';
      if (!presentTypes.has(docType as DocumentExtraction['document_type'])) {
        findings.push({
          finding_id: `${ruleId}:${idx}`,
          rule_id: ruleId,
          result: 'FLAG',
          severity: 'high',
          finding: `Required document type "${docType}" is missing for claim "${claim.claim_type}".`,
          reason: req.hint,
          evidence_ids: [],
          claim_type: claim.claim_type,
        });
      } else {
        findings.push({
          finding_id: `${ruleId}:${idx}`,
          rule_id: ruleId,
          result: 'PASS',
          severity: 'high',
          finding: `Required document type "${docType}" is present for claim "${claim.claim_type}".`,
          reason: `Document of type "${docType}" found among evidence.`,
          evidence_ids: [],
          claim_type: claim.claim_type,
        });
      }
      idx++;
    }
  }

  return findings;
}

function ruleEnergyDataPresent(
  batch: BatchWithClaims,
  extractions: DocumentExtraction[],
  index: number
): Finding {
  const ruleId = 'ENERGY_DATA_PRESENT';
  const hasLowCarbon = batch.claims.some((c) => c.claim_type === 'low_carbon_manufacturing');

  if (!hasLowCarbon) {
    return {
      finding_id: `${ruleId}:${index}`,
      rule_id: ruleId,
      result: 'PASS',
      severity: 'high',
      finding: 'No low-carbon manufacturing claim declared; energy data check not applicable.',
      reason: 'Rule only applies when low_carbon_manufacturing is declared.',
      evidence_ids: [],
      claim_type: null,
    };
  }

  const hasEnergyReport = extractions.some((e) => e.document_type === 'energy_report');
  const activityLines = batch.activity_data?.lines ?? [];
  const hasElectricityKwh = activityLines.some(
    (l) => l.kind === 'electricity' && l.quantity !== null && l.quantity > 0
  );

  if (hasElectricityKwh && hasEnergyReport) {
    return {
      finding_id: `${ruleId}:${index}`,
      rule_id: ruleId,
      result: 'PASS',
      severity: 'high',
      finding: 'Energy data is present: electricity kWh recorded and energy report uploaded.',
      reason: 'Activity data includes electricity > 0 and an energy_report document exists.',
      evidence_ids: [],
      claim_type: 'low_carbon_manufacturing',
    };
  }

  return {
    finding_id: `${ruleId}:${index}`,
    rule_id: ruleId,
    result: 'FLAG',
    severity: 'high',
    finding: 'Energy data is insufficient for the low-carbon manufacturing claim.',
    reason: hasEnergyReport
      ? 'Energy report is present but activity data has no electricity kWh > 0.'
      : hasElectricityKwh
      ? 'Activity data has electricity kWh but no energy_report document was uploaded.'
      : 'Neither electricity kWh in activity data nor an energy_report document is present.',
    evidence_ids: [],
    claim_type: 'low_carbon_manufacturing',
  };
}

// ---------- Main export ----------
export function runChecks(
  batch: BatchWithClaims,
  extractions: DocumentExtraction[],
  now: Date
): Finding[] {
  const findings: Finding[] = [];
  let i = 0;

  findings.push(ruleCertificateDateValidity(batch, extractions, i++));
  findings.push(ruleCertificateNotExpiredNow(extractions, now, i++));
  findings.push(ruleSupplierNameMatch(batch, extractions, i++));
  findings.push(ruleBatchIdMatch(batch, extractions, i++));
  findings.push(ruleRecycledContentValueMatch(batch, extractions, i++));
  findings.push(ruleQuantityConsistency(extractions, i++));

  const reqFindings = ruleRequiredEvidencePresent(batch, extractions, i);
  findings.push(...reqFindings);
  i += reqFindings.length;

  findings.push(ruleEnergyDataPresent(batch, extractions, i++));

  return findings;
}

export type { BatchWithClaims };
