# Requirements Document — ProofChain AI

## Introduction
ProofChain AI helps buyers evaluate supplier sustainability claims for textile batches. Documents are analysed by four logical agents (LLM extraction, deterministic cross-checks, deterministic carbon maths, LLM narrative audit). A human reviewer decides. The decision is hashed and anchored on Ethereum Sepolia, and a public QR passport shows the outcome with the explicit caveat that a blockchain record proves integrity, not truth.

Traceability IDs (FR-xx / NFR-xx) match `docs/SRS.md`.

## Glossary
- **Batch**: one production lot of a product, identified by a public `batch_code` (e.g. `TX-1042`).
- **Evidence document**: an uploaded PDF or text file linked to a batch.
- **Run**: one execution of the four-agent analysis for a batch (`run_number` increments).
- **Finding**: an evidence-linked result: `PASS`, `FLAG`, or `UNKNOWN`.
- **Record hash**: `keccak256` of the canonical verification record.
- **Anchor**: writing batch id + record hash + status to the Sepolia registry.

---

### Requirement 1 — Batch management (FR-01)
**User Story:** As a procurement manager, I want to create and reopen product batches, so that all evidence and decisions for a lot stay together.

#### Acceptance Criteria
1. WHEN a user submits a valid batch form (product name, supplier name, category, batch code, production date, declared claims) THE SYSTEM SHALL create the batch with status `DRAFT` and return its id.
2. IF the batch code already exists THEN THE SYSTEM SHALL reject the request with code `BATCH_CODE_TAKEN`.
3. WHEN a user opens a batch THE SYSTEM SHALL show its evidence, latest run, latest decision, blockchain record, and status.
4. THE SYSTEM SHALL restrict declared claim types to: `recycled_content`, `low_carbon_manufacturing`, `certificate_provided`.

### Requirement 2 — Evidence upload (FR-02)
**User Story:** As a supplier, I want to upload evidence files, so that my claims can be assessed.

#### Acceptance Criteria
1. WHEN a file is uploaded THE SYSTEM SHALL accept only `application/pdf` and `text/plain` up to `MAX_UPLOAD_MB` (default 10).
2. IF the type or size is invalid THEN THE SYSTEM SHALL reject with `EVIDENCE_INVALID` and store nothing.
3. WHEN a file is accepted THE SYSTEM SHALL compute its SHA-256, store it in the private `evidence` bucket, and create an `evidence_documents` row.
4. WHEN evidence is added after a batch was `VERIFIED` or `REJECTED` THE SYSTEM SHALL set status `RECHECK_REQUIRED` and write an audit entry.
5. THE SYSTEM SHALL never return a public URL for an evidence file.

### Requirement 3 — Document Investigator, Agent 1 (FR-03)
**User Story:** As an analyst, I want structured facts extracted from each document, so that checks can run on data instead of prose.

#### Acceptance Criteria
1. WHEN analysis starts THE SYSTEM SHALL extract text from each document and call the LLM with a JSON schema.
2. THE SYSTEM SHALL validate the LLM output against the `DocumentExtraction` zod schema before saving.
3. IF validation fails THEN THE SYSTEM SHALL retry once, and on a second failure mark that document `EXTRACTION_FAILED` and continue with the others.
4. THE SYSTEM SHALL set fields it cannot find to `null` and list them in `missing_fields`; it SHALL NOT infer or invent values.
5. THE SYSTEM SHALL keep an `evidence_quote` (≤ 300 chars) for every extracted claim.
6. IF a PDF yields no extractable text THEN THE SYSTEM SHALL mark it `NO_TEXT` and add an `UNKNOWN` finding saying a scan/OCR is not supported.

### Requirement 4 — Evidence Cross-Checker, Agent 2 (FR-04)
**User Story:** As a reviewer, I want deterministic consistency checks, so that flags are reproducible.

#### Acceptance Criteria
1. THE SYSTEM SHALL run the rules defined in `design.md` (CERTIFICATE_DATE_VALIDITY, CERTIFICATE_NOT_EXPIRED_NOW, SUPPLIER_NAME_MATCH, BATCH_ID_MATCH, RECYCLED_CONTENT_VALUE_MATCH, QUANTITY_CONSISTENCY, REQUIRED_EVIDENCE_PRESENT, ENERGY_DATA_PRESENT).
2. EACH check SHALL return `PASS`, `FLAG`, or `UNKNOWN`, with `evidence_ids`, a `finding` text, and a `severity` (`low|medium|high`).
3. WHEN inputs required by a rule are missing THE SYSTEM SHALL return `UNKNOWN`, not `PASS`.
4. GIVEN identical inputs THE SYSTEM SHALL return identical results (pure function, no LLM, no clock except an injected `now`).

### Requirement 5 — Climate Analyst, Agent 3 (FR-05)
**User Story:** As a sustainability analyst, I want a transparent emissions estimate from supplied activity data, so that "low-carbon" claims can be examined.

#### Acceptance Criteria
1. WHEN activity data is supplied THE SYSTEM SHALL compute emissions per line as `quantity × factor` using a factor from `config/emission-factors.json`.
2. THE SYSTEM SHALL return per-line quantity, unit, factor id, factor value, factor source, data quality (`measured|estimated`), and kgCO2e.
3. IF a needed quantity or factor is missing THEN THE SYSTEM SHALL mark completeness `PARTIAL` or `INSUFFICIENT` and SHALL NOT estimate the missing value.
4. THE SYSTEM SHALL state the boundary: "facility energy use for the batch period only; excludes raw materials, transport, use and end-of-life".
5. IF a factor has `verified: false` THEN THE SYSTEM SHALL label the result `ILLUSTRATIVE_FACTORS` in the output and UI.
6. THE SYSTEM SHALL NOT use the LLM for any number.

### Requirement 6 — Auditor, Agent 4 (FR-06)
**User Story:** As a reviewer, I want one evidence-linked report with a recommendation, so that I can decide quickly.

#### Acceptance Criteria
1. THE SYSTEM SHALL assemble a report with: claims assessed, supporting evidence, contradicting evidence, missing information, carbon summary + limitations, risk flags, next actions, and `ai_recommendation`.
2. THE SYSTEM SHALL compute a `recommendation_ceiling` from findings via `status-policy`; THE Auditor SHALL NOT output a recommendation above that ceiling.
3. EVERY statement in the report SHALL cite a `finding_id`, `evidence_id`, or be tagged `LIMITATION`; statements without a citation SHALL be dropped before saving.
4. THE SYSTEM SHALL NOT mark a claim verified on LLM judgement alone.

### Requirement 7 — Human review (FR-07)
**User Story:** As a reviewer, I want to approve, reject, or request more evidence with a reason, so that the final call is mine.

#### Acceptance Criteria
1. WHEN a reviewer is not authenticated THE SYSTEM SHALL return `UNAUTHORIZED` for review and anchor endpoints.
2. WHEN a reviewer submits `VERIFIED`, `REJECTED`, or `NEEDS_EVIDENCE` with a non-empty reason (≥ 10 chars) THE SYSTEM SHALL store the decision against the specific run and compute the record hash.
3. IF the reviewer chooses `VERIFIED` while the run has unresolved `high` severity `FLAG` findings THEN THE SYSTEM SHALL require an explicit override confirmation and store it in the decision.
4. THE SYSTEM SHALL store the AI recommendation and human decision in separate fields.
5. IF a decision already exists for the run THEN THE SYSTEM SHALL reject another with `DECISION_EXISTS`.

### Requirement 8 — Blockchain anchoring (FR-08)
**User Story:** As an auditor, I want the decision hash recorded on Sepolia, so that later changes are detectable.

#### Acceptance Criteria
1. WHEN a reviewer confirms anchoring THE SYSTEM SHALL build the canonical record, hash it, and call `recordVerification(batchId, recordHash, status)` on the registry.
2. THE SYSTEM SHALL wait for 1 confirmation before saving `blockchain_records` and marking success.
3. IF the transaction fails or times out THEN THE SYSTEM SHALL write a failure audit entry and leave the batch status unchanged.
4. IF a `blockchain_records` row already exists for the decision THEN THE SYSTEM SHALL return it instead of sending another transaction.
5. THE SYSTEM SHALL store tx hash, block number, chain id, contract address, and record hash.
6. THE SYSTEM SHALL NOT put document contents, reviewer notes, or personal data on-chain.

### Requirement 9 — Public passport (FR-09)
**User Story:** As a buyer, I want to scan a QR code and see the verification record.

#### Acceptance Criteria
1. WHEN `/passport/{batchCode}` is opened THE SYSTEM SHALL show product, supplier, declared claims, public status, decision date, record hash, and a Sepolia explorer link.
2. THE SYSTEM SHALL show a `DEMO DATA` banner for batches flagged `is_demo`.
3. THE SYSTEM SHALL show this statement: "A blockchain record proves this decision was not altered after it was recorded. It does not prove the underlying claims are true."
4. THE SYSTEM SHALL NOT expose documents, filenames, reviewer notes, API keys, or internal ids.
5. THE SYSTEM SHALL render a QR code on the batch page that points to the passport URL.

### Requirement 10 — Audit history and integrity check (FR-10)
**User Story:** As an auditor, I want an append-only history and a way to re-verify a record.

#### Acceptance Criteria
1. THE SYSTEM SHALL append an `audit_log` row for: batch created, evidence uploaded, run started/completed/failed, decision recorded, anchor submitted/succeeded/failed.
2. THE SYSTEM SHALL prevent UPDATE and DELETE on `audit_log`, `review_decisions`, and `blockchain_records` at the database level.
3. WHEN `/api/records/{recordHash}/verify` is called THE SYSTEM SHALL rebuild the canonical record from the database, hash it, read the on-chain record, and return `MATCH`, `MISMATCH`, or `NOT_ON_CHAIN`.
4. WHEN a correction is needed THE SYSTEM SHALL create a new run/decision rather than editing a prior one.

### Requirement 11 — Non-functional (NFR-01…12)
1. NFR-01: THE UI SHALL work at 360 px and 1280 px widths.
2. NFR-02/03: EVERY API input and every LLM output SHALL be zod-validated.
3. NFR-04/05/06: Secrets SHALL live only in server env vars; documents SHALL be private by default.
4. NFR-07/08: Chain writes SHALL be idempotent; failures SHALL never show as success.
5. NFR-09: Demo data SHALL be visibly labelled.
6. NFR-10: Rules, hashing, carbon maths, and status policy SHALL have unit tests.
7. NFR-11: Every async view SHALL have loading, empty, error, and success states.
8. NFR-12: Every emissions figure SHALL display units, factor source, and assumptions.
