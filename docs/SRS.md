# ProofChain AI — Software Requirements Specification

Document ID: PCAI-SRS-001 · Version 1.1 (completes v1.0) · Status: hackathon implementation baseline
Target: solo developer · Kiro IDE · Ethereum Sepolia (chain ID 11155111) · 24 hours

---

## 1. Introduction

### 1.1 Purpose
ProofChain AI helps buyers evaluate sustainability claims made by textile suppliers. LLMs extract facts from documents, deterministic rules check consistency, a transparent calculator estimates facility emissions from supplied activity data, a human reviewer decides, and a hash of the decision is anchored on Sepolia.

### 1.2 Problem
Buyers receive sustainability claims without enough evidence to confirm them. Documents may be missing, expired, inconsistent, or insufficient. It is hard to tell: what supports a claim, which claims are unverified, whether documents agree, what is missing for a carbon estimate, and whether a recorded decision has been changed.

### 1.3 Objectives
1. Extract claims and fields from supplier documents.
2. Cross-check claims against evidence with reproducible rules.
3. Identify inconsistencies, missing evidence, and limits.
4. Compute a transparent basic emissions estimate.
5. Require human review before anything is anchored.
6. Anchor a tamper-evident record hash on Sepolia.
7. Publish a public passport that states what the record does and does not prove.

### 1.4 Honesty constraints (apply to every requirement)
- A blockchain record proves integrity of a recorded hash, not truth of the underlying claim.
- `VERIFIED` means a reviewer approved declared claims against supplied evidence. It is not a sustainability rating.
- Passing a check means documents are consistent, not authentic.
- Missing information is `UNKNOWN` or `null`, never guessed.
- Demo data is labelled and never presented as a finding about a real company.

### 1.5 Stakeholders
| Stakeholder | Need |
|---|---|
| Procurement manager | Evaluate suppliers before purchasing |
| Supplier | Submit documents, learn what is missing |
| Sustainability analyst | See unsupported claims and emissions gaps |
| Reviewer | Inspect findings and make the final call |
| Public buyer | Scan a QR code and read the verification record |
| Hackathon judge | See a working end-to-end demo |

### 1.6 Scope
In: one industry (textiles), batch workflow, PDF/text evidence, four agents, rules, basic emissions, human review, Sepolia registry, public passport, integrity check.
Out: factory inspections, issuer-side certificate lookup, OCR of scans, supplier registry, tokens/NFTs, production carbon accounting, enterprise access control.

### 1.7 Assumptions and constraints
- Evidence is English text or text-based PDF. Scanned images yield `NO_TEXT` and an `UNKNOWN` finding.
- Emission factors in `config/emission-factors.json` are illustrative until replaced with cited values.
- Reviewer access is demo-grade (shared passcode, server-checked).
- Sepolia is a test network; test ETH has no value. Use a burner wallet.
- Network and LLM availability can fail; the app must show failures honestly.

---

## 2. System overview
Layers: presentation (Next.js pages), application (route handlers + orchestrator), AI/rules (four agents), data (Supabase Postgres + private storage), blockchain (`ProofChainRegistry` on Sepolia). Architecture, diagrams, and data flow are in `.kiro/specs/proofchain-ai/design.md`.

---

## 3. Functional requirements

### FR-01 Batch management
- Create a batch with product name, supplier name, category, batch code (unique), production date, declared claims (`recycled_content`, `low_carbon_manufacturing`, `certificate_provided`), and a demo flag.
- Batch has a stable internal id and starts `DRAFT`.
- All evidence, runs, decisions, and chain records link to the batch.
- *Acceptance:* a batch can be created, reopened, and shows its evidence and status; duplicate batch code is rejected.

### FR-02 Evidence upload
- Accept PDF and plain text, ≤ 10 MB (configurable). Reject other types.
- Store privately; compute SHA-256; show errors without leaking secrets.
- New evidence on a `VERIFIED`/`REJECTED` batch sets `RECHECK_REQUIRED`.
- *Acceptance:* a file is linked to a batch, stored privately, with a reproducible hash.

### FR-03 Document Investigator (Agent 1, LLM)
- Extract: document type, issuer, supplier, certificate id, issue/expiry dates, batch ids, quantities with units, claims with verbatim quotes and pages.
- Output must match the `DocumentExtraction` schema; one retry on invalid output; then explicit failure for that document.
- Distinguish extracted facts from `missing_fields` and `uncertainties`. Never invent.
- *Acceptance:* valid text yields schema-valid JSON; absent fields are `null`.

### FR-04 Evidence Cross-Checker (Agent 2, deterministic)
- Rules: `CERTIFICATE_DATE_VALIDITY`, `CERTIFICATE_NOT_EXPIRED_NOW`, `SUPPLIER_NAME_MATCH`, `BATCH_ID_MATCH`, `RECYCLED_CONTENT_VALUE_MATCH`, `QUANTITY_CONSISTENCY`, `REQUIRED_EVIDENCE_PRESENT`, `ENERGY_DATA_PRESENT` (definitions in design.md).
- Results: `PASS`, `FLAG`, `UNKNOWN`, each with severity, evidence ids, and reason.
- *Acceptance:* identical inputs (including injected `now`) give identical results; missing inputs give `UNKNOWN`.

### FR-05 Climate Analyst (Agent 3, deterministic)
- Inputs: electricity, fuel quantities, production units, period, each marked `measured`, `estimated`, or `missing`.
- `kgCO2e = quantity × factor`; per-line factor id, value, source, unit.
- Never invent quantities or factors. Report completeness `COMPLETE | PARTIAL | INSUFFICIENT`.
- Declare the boundary: facility energy use for the period only.
- Label `ILLUSTRATIVE_FACTORS` while any factor is unverified.
- *Acceptance:* results match the formula within rounding; no LLM involved.

### FR-06 Auditor (Agent 4, LLM + guardrails)
- Report: claims assessed, supporting and contradicting evidence, missing information, carbon summary and limitations, risk flags, next actions, recommendation.
- Recommendation is clamped to the rule-derived ceiling. Uncited statements are dropped.
- The Auditor cannot declare anything verified.
- *Acceptance:* every statement cites a finding id, evidence id, or `LIMITATION`.

### FR-07 Human review
- Authenticated reviewer selects `VERIFIED`, `REJECTED`, or `NEEDS_EVIDENCE` with a reason ≥ 10 characters.
- Approving a run with unresolved high-severity flags needs an explicit override confirmation, stored.
- AI recommendation and human decision are stored separately; one decision per run.
- *Acceptance:* no anchor can be created without a stored decision.

### FR-08 Blockchain recording
- Canonical record → `keccak256` → `recordVerification(batchId, recordHash, status)` on Sepolia.
- Wait for confirmation before success; save tx hash, block, chain id, contract address.
- Idempotent: an existing record for the decision is returned, not re-sent.
- Only hashes and status go on-chain.
- *Acceptance:* the on-chain hash can be read back and compared with the locally rebuilt hash.

### FR-09 Public passport
- QR code → `/passport/{batchCode}` with product, supplier, declared claims, status, decision date, record hash, explorer link, demo banner.
- Must state: *"A blockchain record proves this decision was not altered after it was recorded. It does not prove the underlying claims are true."*
- Must not expose documents, filenames, reviewer notes, or secrets.
- *Acceptance:* scanning the QR opens the correct passport.

### FR-10 Audit history and integrity check
- Append-only audit entries for uploads, runs, decisions, anchor attempts and failures; DB triggers block UPDATE/DELETE on `audit_log`, `review_decisions`, `blockchain_records`.
- `/api/records/:recordHash/verify` rebuilds the record from the DB and compares it with chain: `MATCH | MISMATCH | NOT_ON_CHAIN`.
- Corrections create new runs and decisions.
- *Acceptance:* latest status is distinguishable from history.

---

## 4. Non-functional requirements
| ID | Requirement |
|---|---|
| NFR-01 | Usable at 360 px and 1280 px widths |
| NFR-02 | All API inputs validated; structured errors |
| NFR-03 | All LLM outputs schema-validated before use |
| NFR-04 | API keys and private keys never reach the client or logs |
| NFR-05 | Supplier documents private by default |
| NFR-06 | Secrets and network config in environment variables |
| NFR-07 | Chain writes idempotent (DB unique keys + contract duplicate check) |
| NFR-08 | Failed LLM/chain calls never show as success |
| NFR-09 | Demo data visibly labelled |
| NFR-10 | Rules, hashing, carbon maths, status policy covered by unit tests |
| NFR-11 | Loading, empty, error, success states on every async view |
| NFR-12 | Emissions show units, factor source, assumptions |
| NFR-13 | A full analysis of a 3-document batch completes in under 60 s on a normal connection |

---

## 5. User stories
1. As a procurement manager, I upload supplier evidence to assess claims.
2. As an analyst, I see which claims lack support so I can request specific documents.
3. As a reviewer, I inspect findings and make the decision myself.
4. As a buyer, I scan a QR code to read the verification record and its caveats.
5. As an auditor, I compare a rebuilt record hash with the chain to detect changes.
6. As a supplier, I learn exactly which evidence is missing.

---

## 6. Status model
| Status | Meaning | On-chain recordable |
|---|---|---|
| `DRAFT` | Batch created, not analysed | no |
| `ANALYZING` | Run in progress | no |
| `NEEDS_EVIDENCE` | Evidence missing or reviewer requested more | yes |
| `IN_REVIEW` | Analysis done, awaiting human decision | no |
| `VERIFIED` | Reviewer approved the declared claims against supplied evidence | yes |
| `REJECTED` | Reviewer rejected the declared claims | yes |
| `RECHECK_REQUIRED` | New evidence after a decision | yes |

---

## 7. Technical architecture
Next.js (App Router, TypeScript, Tailwind), Supabase (Postgres + private storage), Gemini (`@google/genai`), Solidity 0.8.24 + Hardhat + ethers v6 on Sepolia. Modular monolith; agents are TypeScript functions. Full detail: `.kiro/steering/tech.md` and `design.md`.

## 8. Database schema
See `supabase/schema.sql`. Additions over v1.0: `audit_log`, `verification_runs.status/error_code/audit_report/recommendation_ceiling`, `batches.production_date/activity_data/is_demo`, `review_decisions.record_json/override_confirmed`, DB triggers for append-only tables, partial unique index allowing one running run per batch.

## 9. API
See `design.md` §API. All responses use `{success,data}` / `{success:false,error:{code,message}}`.

## 10. Agent contracts
- Agents 1–2: `design.md` §Agents.
- Agents 3–4 (completed in v1.1): `design.md` §Agent 3 and §Agent 4.
- Prompts and examples: `docs/AGENT_SPECS.md`.

## 11. Smart contract
`contracts/ProofChainRegistry.sol`: owner-managed recorders, append-only per-batch history, duplicate rejection, recordable-status whitelist, event per record. Spec in `design.md` §Smart contract; tests in `test/ProofChainRegistry.test.ts`.

## 12. Security and privacy
| Risk | Control |
|---|---|
| Key leakage | Keys only in server env; burner wallet; env zod parse; secret-guard hook |
| Document exposure | Private bucket; no public URLs; passport sanitised |
| Prompt injection inside documents | Document text is passed as data, never as instructions; output is schema-validated; Auditor statements need citations; LLM cannot raise the ceiling |
| LLM hallucination | `null` rule, quotes required, deterministic checks, human gate |
| Duplicate/forged anchor | Unique DB keys + contract duplicate check + recorder allow-list |
| Weak reviewer auth | Documented as demo-grade; server-side check; httpOnly signed cookie |
| Misleading UI | Honesty copy guard hook; caveat text mandatory |
| Rate-limit/abuse | Out of scope for hackathon; noted as future work |

## 13. Testing and acceptance
Unit tests (vitest) for rules, carbon maths, canonical hash, status policy, auditor post-processing. Contract tests (Hardhat). End-to-end acceptance via sample batches TX-1042 and TX-2001 (`sample-data/README.md`). Release gate: all tests green, TX-1042 shows expected flags, TX-1042 anchored once on Sepolia with verify = `MATCH`, passport reachable by QR from a phone.

## 14. Risks
| Risk | Mitigation |
|---|---|
| Sepolia faucet or RPC delay | Fund wallet early (hour 0); keep a second RPC URL; fall back to local Hardhat node for development |
| LLM quota or malformed JSON | Retry once; cache extractions per document hash during demo prep |
| PDF text extraction fails | Demo with `.txt` and one text PDF; `NO_TEXT` path handled |
| Scope creep | Cut line in `tasks.md` |
| Over-claiming in the pitch | Use `.kiro/steering/product.md` honesty rules and `docs/DEMO_SCRIPT.md` |

## 15. Competitive note
Similar ideas exist (AI plausibility checks plus blockchain traceability). The differentiators to emphasise: evidence-linked findings, four-state separation (verified-by-check / inconsistent / missing / unverified), a deterministic ceiling the AI cannot exceed, human-gated anchoring, and a passport that states its own limits.
