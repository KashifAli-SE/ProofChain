# Design Document — ProofChain AI

## Overview
Modular monolith: Next.js (UI + route handlers) → Supabase (Postgres + private storage) → Gemini (two LLM calls) → Sepolia registry contract. Implements `requirements.md`.

```mermaid
flowchart TD
  UI[Next.js UI] --> API[Route handlers]
  API --> DB[(Supabase Postgres)]
  API --> ST[(Private bucket: evidence)]
  API --> ORCH[orchestrator.ts]
  ORCH --> A1[Agent 1 Document Investigator · LLM]
  A1 --> A2[Agent 2 Cross-Checker · deterministic]
  ORCH --> A3[Agent 3 Climate Analyst · deterministic]
  A2 --> POL[status-policy · ceiling]
  A3 --> POL
  POL --> A4[Agent 4 Auditor · LLM, capped by ceiling]
  A4 --> DB
  DB --> REV[Human review]
  REV --> HASH[canonical record + keccak256]
  HASH --> CHAIN[ProofChainRegistry on Sepolia]
  CHAIN --> DB
  DB --> PASS[Public passport + QR]
  CHAIN --> VER[/api/records/:hash/verify]
```

## Workflow and status transitions
| From | Event | To |
|---|---|---|
| (new) | create batch | `DRAFT` |
| `DRAFT`/`NEEDS_EVIDENCE`/`RECHECK_REQUIRED` | analyse | `ANALYZING` |
| `ANALYZING` | run completed | `IN_REVIEW` |
| `ANALYZING` | run failed | previous status (error logged) |
| `IN_REVIEW` | decision VERIFIED / REJECTED / NEEDS_EVIDENCE | same name |
| `VERIFIED`/`REJECTED` | new evidence uploaded | `RECHECK_REQUIRED` |

Status is set on the batch only after the decision row is saved. Anchoring does not change status; it adds a `blockchain_records` row.

## Data model
Authoritative DDL: `supabase/schema.sql`. Tables: `products`, `batches`, `evidence_documents`, `verification_runs`, `review_decisions`, `blockchain_records`, `audit_log`. All access is server-side with the service-role key; RLS is enabled with no public policies.

## API
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/reviewer` | – | Exchange `REVIEWER_PASSCODE` for httpOnly cookie |
| POST | `/api/batches` | – (demo) | Create batch |
| GET | `/api/batches` | – | List batches |
| GET | `/api/batches/:id` | – | Batch detail |
| POST | `/api/batches/:id/evidence` | – | Upload file (multipart) |
| POST | `/api/batches/:id/activity` | – | Save activity data JSON |
| POST | `/api/batches/:id/analyze` | – | Start run; returns `{ runId, status }` |
| GET | `/api/batches/:id/report` | – | Latest run report (poll `status`) |
| POST | `/api/batches/:id/review` | reviewer | Save decision |
| POST | `/api/batches/:id/anchor` | reviewer | Anchor decision on chain |
| GET | `/api/passport/:batchCode` | public | Sanitised passport data |
| GET | `/api/records/:recordHash/verify` | public | Compare DB-rebuilt record with chain |

`/analyze` runs the pipeline inside the request (hackathon scale, set `export const maxDuration = 60`) and writes `verification_runs.status` = `RUNNING → COMPLETED|FAILED`. UI polls `/report`.

## Agents

### Agent 1 — Document Investigator (LLM)
Input: extracted text, batch metadata. Output `DocumentExtraction` (zod, in `schemas.ts`):
```ts
{
  document_type: 'certificate'|'invoice'|'energy_report'|'composition_report'|'declaration'|'other',
  issuer: string|null, supplier_name: string|null,
  certificate_id: string|null, issue_date: string|null /*YYYY-MM-DD*/, expiry_date: string|null,
  batch_ids: string[], 
  quantities: { label: string, value: number, unit: string, quote: string }[],
  claims: { claim_type: 'recycled_content'|'low_carbon_manufacturing'|'other', claim: string, value: number|null, unit: string|null, quote: string, page: number|null }[],
  is_demo_marked: boolean,
  missing_fields: string[], uncertainties: string[]
}
```
Prompt rules: output JSON only; use `null` when absent; copy quotes verbatim; dates ISO or `null`; never guess. Temperature 0. Full prompt in `docs/AGENT_SPECS.md`.

### Agent 2 — Cross-Checker (deterministic)
`runChecks(batch, extractions, now): Finding[]`. `Finding = { finding_id, rule_id, result: 'PASS'|'FLAG'|'UNKNOWN', severity, finding, reason, evidence_ids[], claim_type|null }`.

| rule_id | Logic | UNKNOWN when |
|---|---|---|
| `CERTIFICATE_DATE_VALIDITY` | FLAG(high) if cert `expiry_date` < batch `production_date` or cert `issue_date` > production date | no certificate, or dates null |
| `CERTIFICATE_NOT_EXPIRED_NOW` | FLAG(medium) if `expiry_date` < `now` | expiry null |
| `SUPPLIER_NAME_MATCH` | normalise (lowercase, strip punctuation + `ltd/limited/pvt/inc/llc`); FLAG(medium) if no document supplier matches declared | no supplier on any document |
| `BATCH_ID_MATCH` | FLAG(high) if a document lists batch ids and none equals `batch_code` | no doc lists batch ids |
| `RECYCLED_CONTENT_VALUE_MATCH` | for declared `recycled_content`: FLAG(high) if a document value ≠ declared value (±0.5 pt); PASS if a composition/certificate value equals declared | no document gives a recycled % |
| `QUANTITY_CONSISTENCY` | compare same-unit quantities with matching labels across invoice/declaration; FLAG(medium) if differ > 2% | fewer than 2 comparable quantities |
| `REQUIRED_EVIDENCE_PRESENT` | per declared claim, check `config/evidence-requirements.json`; one finding per missing doc type: FLAG(high) | – (always decidable) |
| `ENERGY_DATA_PRESENT` | for `low_carbon_manufacturing`: PASS if activity data has electricity kWh > 0 and an energy document exists; else FLAG(high) | – |

A `PASS` only means the defined check passed on supplied documents. It never means the document is authentic.

### Agent 3 — Climate Analyst (deterministic)
`computeCarbon(activity, factors): CarbonResult`.
```ts
ActivityData = {
  period_start: string, period_end: string,
  production_units: number|null,            // e.g. garments produced in the period for this batch
  lines: { id: string, kind: 'electricity'|'diesel'|'natural_gas'|'other', quantity: number|null, unit: string, quality: 'measured'|'estimated'|'missing', source_doc_id: string|null }[]
}
CarbonResult = {
  completeness: 'COMPLETE'|'PARTIAL'|'INSUFFICIENT',
  factor_status: 'VERIFIED_FACTORS'|'ILLUSTRATIVE_FACTORS',
  boundary: string,
  lines: { id, kind, quantity, unit, quality, factor_id, factor_value, factor_unit, factor_source, kgco2e: number|null }[],
  total_kgco2e: number|null,                // sum of computed lines only
  kgco2e_per_unit: number|null,             // total / production_units, null if either missing
  assumptions: string[], limitations: string[]
}
```
Formula: `kgco2e = quantity × factor_value`. Unit must equal the factor's unit, otherwise the line is `kgco2e: null` with a limitation note (no auto-conversion except an explicit table: `MWh→kWh ×1000`, `L` only). Electricity line missing → `INSUFFICIENT`. Any line `missing` or `null` → `PARTIAL` at best. Round to 2 dp at output only.

### Status policy
`deriveCeiling(findings, carbon): 'APPROVE'|'REQUEST_EVIDENCE'|'REJECT'`
1. Any `FLAG` with severity `high` on `CERTIFICATE_DATE_VALIDITY`, `BATCH_ID_MATCH` or a direct value mismatch → ceiling `REQUEST_EVIDENCE` (reviewer may still reject).
2. Any `UNKNOWN`/`FLAG` on `REQUIRED_EVIDENCE_PRESENT` or `ENERGY_DATA_PRESENT` for a declared claim → `REQUEST_EVIDENCE`.
3. Carbon `INSUFFICIENT` with a declared `low_carbon_manufacturing` claim → `REQUEST_EVIDENCE`.
4. Otherwise ceiling `APPROVE`.
Ordering: `APPROVE > REQUEST_EVIDENCE > REJECT`. Auditor output is clamped: `min(llm_recommendation, ceiling)`. The LLM may suggest `REJECT`, but only a human decides.

### Agent 4 — Auditor (LLM + guardrails)
Input: findings, carbon result, claims, ceiling. Output `AuditReport`:
```ts
{
  summary: string,
  claims: { claim_type, status: 'SUPPORTED_BY_DOCUMENTS'|'CONTRADICTED'|'UNSUPPORTED'|'UNVERIFIED', basis: string[] /*finding_ids*/ }[],
  statements: { text: string, cites: string[] /*finding_id | evidence_id | 'LIMITATION'*/ }[],
  next_actions: { action: string, finding_id: string }[],
  recommendation: 'APPROVE'|'REQUEST_EVIDENCE'|'REJECT'
}
```
Post-processing in code: (a) drop any statement with empty/unknown `cites`; (b) clamp recommendation to ceiling; (c) force claim `status` to `UNSUPPORTED` when its required evidence finding is `FLAG`; (d) never output `VERIFIED`.

## Canonical record and hashing
```ts
VerificationRecord = {
  schema: 'proofchain/1',
  batch_code, claims: string[] /*sorted*/,
  run_number, ai_recommendation,
  evidence: { sha256: string, document_type: string }[]  /*sorted by sha256*/,
  findings_digest: string /* sha256 hex of canonicalJson(findings sorted by finding_id) */,
  carbon_digest: string   /* sha256 hex of canonicalJson(carbon_result) or '' */,
  decision: 'VERIFIED'|'REJECTED'|'NEEDS_EVIDENCE',
  override_confirmed: boolean,
  decided_at: string /* ISO UTC, stored in review_decisions */
}
record_hash = keccak256(utf8(canonicalJson(VerificationRecord)))   // 0x… 32 bytes
batch_id    = keccak256(utf8(batch_code))                          // bytes32 on-chain key
```
`canonicalJson`: recursively sort object keys, no whitespace, arrays kept in the order specified above, numbers as JSON numbers, no `undefined`. Reviewer note is not hashed (kept off-chain, private).

## Smart contract: `ProofChainRegistry`
- Owner = deployer; `setRecorder(address,bool)` manages allowed recorders. Only recorders call `recordVerification`.
- `enum Status { DRAFT, ANALYZING, NEEDS_EVIDENCE, IN_REVIEW, VERIFIED, REJECTED, RECHECK_REQUIRED }` (same order as `src/lib/status.ts`). Only `NEEDS_EVIDENCE`, `VERIFIED`, `REJECTED`, `RECHECK_REQUIRED` may be recorded.
- `recordVerification(bytes32 batchId, bytes32 recordHash, Status status) returns (uint256 index)`; reverts on zero hash, disallowed status, or duplicate `(batchId, recordHash)`.
- Append-only per batch: `getRecordCount`, `getRecord(batchId, index)`, `getLatest(batchId)`, `isRecorded(batchId, recordHash)`.
- Event: `VerificationRecorded(bytes32 indexed batchId, bytes32 indexed recordHash, Status status, uint256 index, address recorder, uint256 timestamp)`.
Source: `contracts/ProofChainRegistry.sol`.

## Reviewer access
Demo-grade: `POST /api/auth/reviewer` compares the body passcode to `REVIEWER_PASSCODE` (constant-time) and sets a signed httpOnly cookie. Review and anchor routes verify the cookie server-side. The UI hides reviewer controls when unauthenticated, but the server is the control. This is not production auth.

## UI pages
| Route | Content |
|---|---|
| `/` | Batch table with status badges, `DemoBanner`, "New batch" |
| `/batches/new` | Form: product, supplier, category, batch code, production date, claims, demo flag |
| `/batches/[id]` | Evidence table (hash, type, extraction state), activity data form, "Run analysis", report view (findings grouped: Verified-by-check / Inconsistent / Missing / Unverified), `CarbonPanel`, QR card |
| `/batches/[id]/review` | AI recommendation vs ceiling, reviewer form, override checkbox, "Anchor on Sepolia" with tx status |
| `/passport/[batchCode]` | Public passport (see Requirement 9) |
| `/verify` | Enter batch code → MATCH / MISMATCH / NOT_ON_CHAIN with explanation |

## Error handling
Codes: `VALIDATION_ERROR, BATCH_CODE_TAKEN, BATCH_NOT_FOUND, EVIDENCE_INVALID, NO_EVIDENCE, EXTRACTION_FAILED, LLM_UNAVAILABLE, RUN_IN_PROGRESS, UNAUTHORIZED, DECISION_EXISTS, NO_DECISION, ANCHOR_FAILED, CHAIN_UNAVAILABLE, INTERNAL`. Provider errors are mapped, logged server-side, never returned raw.

## Testing strategy
- Unit (vitest): each cross-checker rule with PASS/FLAG/UNKNOWN cases; carbon maths incl. missing lines and unit mismatch; canonical JSON key-order stability; status-policy clamping; Auditor post-processing drops uncited statements.
- Contract (Hardhat): authorisation, duplicate rejection, disallowed status, history ordering, event emission.
- Integration (manual script in `docs/DEVELOPMENT_PLAN.md`): sample batch TX-1042 (expected flags) and TX-2001 (expected approve-able) end to end on Sepolia.
