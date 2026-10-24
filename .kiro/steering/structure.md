---
inclusion: always
---

# ProofChain AI — Repository Structure Steering

Create files in these locations. Do not invent parallel folders.

```
proofchain-ai/
├─ .kiro/                      # specs, steering, hooks (already present)
├─ config/
│  ├─ emission-factors.json    # illustrative factors, each with source + verified flag
│  └─ evidence-requirements.json
├─ contracts/ProofChainRegistry.sol
├─ scripts/deploy.ts
├─ test/ProofChainRegistry.test.ts
├─ supabase/schema.sql
├─ sample-data/                # DEMO evidence files + activity data
├─ docs/                       # SRS, plans, demo script
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                           # dashboard (batch list)
│  │  ├─ batches/new/page.tsx
│  │  ├─ batches/[id]/page.tsx              # detail: evidence, run, report
│  │  ├─ batches/[id]/review/page.tsx       # reviewer decision + anchor
│  │  ├─ passport/[batchCode]/page.tsx      # public passport
│  │  ├─ verify/page.tsx                    # recompute & compare hash
│  │  └─ api/…                              # see design.md API table
│  ├─ components/                           # StatusBadge, FindingCard, EvidenceTable, CarbonPanel, QrCard, DemoBanner
│  └─ lib/
│     ├─ env.ts
│     ├─ supabase/server.ts
│     ├─ api/respond.ts                     # ok() / fail() helpers
│     ├─ pdf/extract.ts
│     ├─ agents/
│     │  ├─ document-investigator.ts        # Agent 1 (LLM)
│     │  ├─ cross-checker.ts                # Agent 2 (deterministic)
│     │  ├─ climate-analyst.ts              # Agent 3 (deterministic)
│     │  ├─ auditor.ts                      # Agent 4 (LLM + policy)
│     │  ├─ status-policy.ts
│     │  ├─ schemas.ts                      # all zod schemas
│     │  └─ orchestrator.ts
│     ├─ llm/gemini.ts                      # JSON-mode call + retry-once
│     ├─ hash/{sha256.ts,canonical.ts,record.ts}
│     ├─ chain/{abi.ts,anchor.ts,read.ts}
│     └─ audit/log.ts                       # append-only audit_log writer
└─ tests/                                   # vitest: cross-checker, climate, canonical hash, status-policy
```

## Naming
- Files: kebab-case. React components: PascalCase. Types: PascalCase. Constants: UPPER_SNAKE.
- Status strings are exactly: `DRAFT, ANALYZING, NEEDS_EVIDENCE, IN_REVIEW, VERIFIED, REJECTED, RECHECK_REQUIRED`. Define once in `src/lib/status.ts` and mirror in the Solidity enum order.
- Rule IDs are exactly those in `design.md` §Cross-checker rules (e.g. `CERTIFICATE_DATE_VALIDITY`).
