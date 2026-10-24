import { z } from 'zod';

// ---------- DocumentExtraction ----------
export const DocumentExtractionSchema = z.object({
  document_type: z.enum([
    'certificate',
    'invoice',
    'energy_report',
    'composition_report',
    'declaration',
    'other',
  ]),
  issuer: z.string().nullable(),
  supplier_name: z.string().nullable(),
  certificate_id: z.string().nullable(),
  issue_date: z.string().nullable(), // YYYY-MM-DD or null
  expiry_date: z.string().nullable(), // YYYY-MM-DD or null
  batch_ids: z.array(z.string()),
  quantities: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      unit: z.string(),
      quote: z.string(),
    })
  ),
  claims: z.array(
    z.object({
      claim_type: z.enum(['recycled_content', 'low_carbon_manufacturing', 'other']),
      claim: z.string(),
      value: z.number().nullable(),
      unit: z.string().nullable(),
      quote: z.string(),
      page: z.number().nullable(),
    })
  ),
  is_demo_marked: z.boolean(),
  missing_fields: z.array(z.string()),
  uncertainties: z.array(z.string()),
});
export type DocumentExtraction = z.infer<typeof DocumentExtractionSchema>;

// ---------- Finding ----------
export const FindingSchema = z.object({
  finding_id: z.string(),
  rule_id: z.string(),
  result: z.enum(['PASS', 'FLAG', 'UNKNOWN']),
  severity: z.enum(['low', 'medium', 'high']),
  finding: z.string(),
  reason: z.string(),
  evidence_ids: z.array(z.string()),
  claim_type: z.string().nullable(),
});
export type Finding = z.infer<typeof FindingSchema>;

// ---------- ActivityData ----------
export const ActivityDataSchema = z.object({
  period_start: z.string(),
  period_end: z.string(),
  production_units: z.number().nullable(),
  lines: z.array(
    z.object({
      id: z.string(),
      kind: z.enum(['electricity', 'diesel', 'natural_gas', 'other']),
      quantity: z.number().nullable(),
      unit: z.string(),
      quality: z.enum(['measured', 'estimated', 'missing']),
      source_doc_id: z.string().nullable(),
    })
  ),
});
export type ActivityData = z.infer<typeof ActivityDataSchema>;

// ---------- CarbonResult ----------
export const CarbonResultSchema = z.object({
  completeness: z.enum(['COMPLETE', 'PARTIAL', 'INSUFFICIENT']),
  factor_status: z.enum(['VERIFIED_FACTORS', 'ILLUSTRATIVE_FACTORS']),
  boundary: z.string(),
  lines: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      quantity: z.number().nullable(),
      unit: z.string(),
      quality: z.string(),
      factor_id: z.string().nullable(),
      factor_value: z.number().nullable(),
      factor_unit: z.string().nullable(),
      factor_source: z.string().nullable(),
      kgco2e: z.number().nullable(),
    })
  ),
  total_kgco2e: z.number().nullable(),
  kgco2e_per_unit: z.number().nullable(),
  assumptions: z.array(z.string()),
  limitations: z.array(z.string()),
});
export type CarbonResult = z.infer<typeof CarbonResultSchema>;

// ---------- AuditReport ----------
export const AuditReportSchema = z.object({
  summary: z.string(),
  claims: z.array(
    z.object({
      claim_type: z.string(),
      status: z.enum(['SUPPORTED_BY_DOCUMENTS', 'CONTRADICTED', 'UNSUPPORTED', 'UNVERIFIED']),
      basis: z.array(z.string()),
    })
  ),
  statements: z.array(
    z.object({
      text: z.string(),
      cites: z.array(z.string()),
    })
  ),
  next_actions: z.array(
    z.object({
      action: z.string(),
      finding_id: z.string(),
    })
  ),
  recommendation: z.enum(['APPROVE', 'REQUEST_EVIDENCE', 'REJECT']),
});
export type AuditReport = z.infer<typeof AuditReportSchema>;

// Backward-compatible alias used by FEAT-002's activity route stub
export const activityDataSchema = ActivityDataSchema;
