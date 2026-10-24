# Implementation Plan — ProofChain AI

Work top to bottom. Finish and test each numbered task before starting the next. Time budgets assume a solo 24-hour sprint; the **cut line** at the end says what to drop if you fall behind.

Files already provided in the repo (do not regenerate): `contracts/ProofChainRegistry.sol`, `test/ProofChainRegistry.test.ts`, `scripts/deploy.ts`, `hardhat.config.ts`, `supabase/schema.sql`, `config/*.json`, `sample-data/*`, `.env.example`.

- [ ] 1. Project bootstrap (0:00–0:45)
  - [ ] 1.1 Create Next.js (App Router, TypeScript, Tailwind) in the repo root without overwriting `.kiro`, `contracts`, `config`, `sample-data`, `supabase`, `docs`
    - Install: `zod @supabase/supabase-js @google/genai unpdf qrcode ethers dotenv`; dev: `vitest @types/qrcode`
    - _Requirements: NFR-01, NFR-06_
  - [ ] 1.2 Write `src/lib/env.ts` (zod-parsed env, throws listing missing names) and `src/lib/api/respond.ts` (`ok`, `fail`)
    - _Requirements: NFR-02, NFR-04_
  - [ ] 1.3 Write `src/lib/status.ts` with the status union and ordered array (same order as the Solidity enum)
    - _Requirements: SRS §6_

- [ ] 2. Database and storage (0:45–1:30)
  - [ ] 2.1 Create the Supabase project, run `supabase/schema.sql` in the SQL editor, confirm the private `evidence` bucket exists
    - _Requirements: 1, 2, 10.2_
  - [ ] 2.2 Write `src/lib/supabase/server.ts` (service-role client, server-only) and `src/lib/audit/log.ts` (`appendAudit(batchId, event, payload)`)
    - _Requirements: 10.1, NFR-04_
  - [ ] 2.3 Verify append-only triggers: try an UPDATE on `audit_log` in SQL editor and confirm it errors
    - _Requirements: 10.2_

- [ ] 3. Batches and evidence upload (1:30–3:30)
  - [ ] 3.1 `POST/GET /api/batches`, `GET /api/batches/:id` with zod validation and `BATCH_CODE_TAKEN`
    - _Requirements: 1.1–1.4_
  - [ ] 3.2 `src/lib/hash/sha256.ts` and `POST /api/batches/:id/evidence` (type/size check, hash, private upload, row insert, audit entry, `RECHECK_REQUIRED` rule)
    - _Requirements: 2.1–2.5_
  - [ ] 3.3 `POST /api/batches/:id/activity` saving `ActivityData` JSON onto the batch
    - _Requirements: 5.1_
  - [ ] 3.4 UI: dashboard `/`, `/batches/new`, `/batches/[id]` evidence table + activity form, `DemoBanner`, `StatusBadge`, loading/empty/error states
    - _Requirements: 1.3, NFR-09, NFR-11_
  - [ ] 3.5 **Checkpoint:** create TX-1042, upload the three files from `sample-data/tx-1042/`, see their SHA-256 values in the table

- [ ] 4. Agent 1 — Document Investigator (3:30–6:00)
  - [ ] 4.1 `src/lib/pdf/extract.ts` using `unpdf`; return `{ text, pages, hasText }`; plain text passes through
    - _Requirements: 3.1, 3.6_
  - [ ] 4.2 `src/lib/agents/schemas.ts` with `DocumentExtraction`, `Finding`, `ActivityData`, `CarbonResult`, `AuditReport` (exactly as in design.md)
    - _Requirements: NFR-03_
  - [ ] 4.3 `src/lib/llm/gemini.ts`: `generateJson(prompt, zodSchema)` with temperature 0, JSON response mode, one retry on validation failure, mapped errors (`LLM_UNAVAILABLE`)
    - _Requirements: 3.2, 3.3_
  - [ ] 4.4 `src/lib/agents/document-investigator.ts` using the prompt in `docs/AGENT_SPECS.md`; per-document failure isolation
    - _Requirements: 3.1–3.5_
  - [ ] 4.5 **Checkpoint:** extraction of `sample-data/tx-1042/certificate.txt` yields the expected dates and `recycled_content = 100`; missing fields are `null`, not guessed

- [ ] 5. Agents 2 and 3 — deterministic core (6:00–9:00)
  - [ ] 5.1 `src/lib/agents/cross-checker.ts`: implement all 8 rules from design.md as pure functions with injected `now`
    - _Requirements: 4.1–4.4_
  - [ ] 5.2 `tests/cross-checker.test.ts`: PASS/FLAG/UNKNOWN case for every rule, plus a determinism test (same input twice → deep-equal)
    - _Requirements: 4.4, NFR-10_
  - [ ] 5.3 `src/lib/agents/climate-analyst.ts` reading `config/emission-factors.json`; unit handling per design.md; completeness logic
    - _Requirements: 5.1–5.6_
  - [ ] 5.4 `tests/climate-analyst.test.ts`: complete case, missing electricity → `INSUFFICIENT`, unit mismatch → null line, illustrative factor label
    - _Requirements: 5.3, 5.5, NFR-10, NFR-12_
  - [ ] 5.5 `src/lib/agents/status-policy.ts` + `tests/status-policy.test.ts` (ceiling rules and clamping)
    - _Requirements: 6.2_
  - [ ] 5.6 **Checkpoint:** `npx vitest run` is green

- [ ] 6. Agent 4 and orchestrator (9:00–11:30)
  - [ ] 6.1 `src/lib/agents/auditor.ts`: LLM call, then code post-processing (drop uncited statements, clamp to ceiling, force UNSUPPORTED where required evidence flagged)
    - _Requirements: 6.1–6.4_
  - [ ] 6.2 `tests/auditor-postprocess.test.ts` with a fake LLM output containing an uncited statement and an over-optimistic recommendation
    - _Requirements: 6.2, 6.3, NFR-10_
  - [ ] 6.3 `src/lib/agents/orchestrator.ts`: create run (`RUNNING`), extract → check → carbon → ceiling → audit, persist, set batch `IN_REVIEW`; on failure set run `FAILED` and restore status; audit entries
    - _Requirements: 3, 4, 5, 6, 10.1_
  - [ ] 6.4 `POST /api/batches/:id/analyze` (`RUN_IN_PROGRESS` guard, `NO_EVIDENCE`) and `GET /api/batches/:id/report`
    - _Requirements: 3–6_
  - [ ] 6.5 UI: "Run analysis" with polling; report view grouping findings into Verified-by-check / Inconsistent / Missing / Unverified; `FindingCard` shows rule id, evidence ids, severity; `CarbonPanel` shows factor source, units, assumptions, `ILLUSTRATIVE_FACTORS` tag
    - _Requirements: 6.1, NFR-11, NFR-12_
  - [ ] 6.6 **Checkpoint:** TX-1042 produces the expected flags in `sample-data/README.md`; TX-2001 produces a clean report with ceiling `APPROVE`

- [ ] 7. Smart contract and Sepolia deployment (11:30–14:00)
  - [ ] 7.1 Install Hardhat toolchain from `package.json` additions (see `docs/IMPLEMENTATION_PLAN.md` §2), run `npx hardhat test` — all contract tests must pass
    - _Requirements: 8_
  - [ ] 7.2 Fund the burner wallet from a Sepolia faucet, set `SEPOLIA_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, run `npx hardhat run scripts/deploy.ts --network sepolia`; put the printed address in `REGISTRY_ADDRESS`
    - _Requirements: 8.1_
  - [ ] 7.3 Optional: verify source on Etherscan with `ETHERSCAN_API_KEY`
  - [ ] 7.4 Copy ABI into `src/lib/chain/abi.ts` (human-readable ethers ABI is fine)

- [ ] 8. Review, hashing and anchoring (14:00–17:00)
  - [ ] 8.1 `src/lib/hash/canonical.ts` + `record.ts` (`buildRecord`, `recordHash`, `batchIdHash`) and `tests/canonical.test.ts` (key order independence, array order, stable known vector)
    - _Requirements: 8.1, NFR-10_
  - [ ] 8.2 `POST /api/auth/reviewer` (constant-time compare, signed httpOnly cookie) and a `requireReviewer()` helper
    - _Requirements: 7.1_
  - [ ] 8.3 `POST /api/batches/:id/review`: validate reason ≥ 10 chars, override rule for high flags, `DECISION_EXISTS`, store `record_hash`, set batch status, audit entry
    - _Requirements: 7.2–7.5_
  - [ ] 8.4 `src/lib/chain/anchor.ts`: idempotent send (existing row → return it), wait 1 confirmation with timeout, save `blockchain_records`, failure audit entry, no status change on failure
    - _Requirements: 8.1–8.6, NFR-07, NFR-08_
  - [ ] 8.5 `POST /api/batches/:id/anchor` and the `/batches/[id]/review` page with tx status and explorer link
    - _Requirements: 7, 8_
  - [ ] 8.6 **Checkpoint:** anchor TX-1042 once on Sepolia; click anchor again → same tx returned, no second transaction on Etherscan

- [ ] 9. Passport, QR and verification (17:00–19:30)
  - [ ] 9.1 `GET /api/passport/:batchCode` returning only sanitised fields
    - _Requirements: 9.1, 9.4_
  - [ ] 9.2 `/passport/[batchCode]` page with caveat text, demo banner, explorer link; `QrCard` on the batch page using `NEXT_PUBLIC_APP_URL`
    - _Requirements: 9.1–9.3, 9.5_
  - [ ] 9.3 `src/lib/chain/read.ts` and `GET /api/records/:recordHash/verify` returning `MATCH | MISMATCH | NOT_ON_CHAIN`; `/verify` page
    - _Requirements: 10.3_
  - [ ] 9.4 **Checkpoint:** manually change one finding in the DB (service role), call verify → `MISMATCH`; restore → `MATCH`

- [ ] 10. Hardening and polish (19:30–22:00)
  - [ ] 10.1 Walk every page at 360 px width; fix overflow
    - _Requirements: NFR-01_
  - [ ] 10.2 Grep the repo for `process.env` outside `env.ts`, for the private key string in any client file, and for `console.log` of secrets
    - _Requirements: NFR-04_
  - [ ] 10.3 Run both sample batches end to end from a clean DB; record a screen capture as fallback
  - [ ] 10.4 Deploy to Vercel (set all env vars); set `NEXT_PUBLIC_APP_URL`; re-test the QR code from a phone
    - _Requirements: 9.5_

- [ ] 11. Demo preparation (22:00–24:00)
  - [ ] 11.1 Rehearse `docs/DEMO_SCRIPT.md` twice with a timer; pre-load TX-1042 (flagged, anchored) and TX-2001 (clean, not yet anchored)
  - [ ] 11.2 Prepare answers for the judge questions listed in the script
  - [ ] 11.3 Freeze: no new features after 22:00

## Cut line (drop in this order if behind)
1. Etherscan source verification (7.3)
2. `/verify` page UI — keep the API (9.3)
3. Activity-data form — use the seeded JSON from `sample-data` (3.3)
4. QUANTITY_CONSISTENCY and SUPPLIER_NAME_MATCH rules — keep the other six
5. Vercel deploy — demo from localhost with a tunnel or screen capture

**Never cut:** human review gate, record hash + Sepolia anchor, passport caveat text, `UNKNOWN` handling, demo labelling.
