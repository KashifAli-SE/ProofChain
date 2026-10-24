---
inclusion: always
---

# ProofChain AI — Technology Steering

## Stack (do not add frameworks beyond this without asking)
| Layer | Choice |
|---|---|
| App | Next.js (App Router) + TypeScript (strict) + Tailwind CSS |
| API | Next.js route handlers under `src/app/api` |
| Validation | `zod` for every request body and every LLM output |
| DB + storage | Supabase Postgres + **private** Storage bucket `evidence` |
| LLM | Gemini via `@google/genai`; model name from `GEMINI_MODEL` env |
| PDF text | `unpdf` (fallback: `pdfjs-dist`) |
| Chain | Solidity 0.8.24, Hardhat 2.x, ethers v6, network **Sepolia (chainId 11155111)** |
| QR | `qrcode` |
| Tests | `vitest` (app logic), Hardhat/chai (contract) |

No LangChain, no vector DB, no Python service, no microservices. Agents are plain TypeScript functions in `src/lib/agents`.

## Architecture rules
- Modular monolith. Business logic in `src/lib/**`; route handlers stay thin (parse → call lib → respond).
- **Deterministic code** for: dates, quantity comparison, status ceiling, hashing, emissions maths, canonical record building.
- **LLM only** for: Agent 1 (field extraction) and Agent 4 (narrative report). Both outputs are zod-validated; on failure retry once, then return an explicit error. Never store unvalidated LLM output.
- The Auditor may **downgrade** the rule-derived status ceiling, never upgrade it (`src/lib/agents/status-policy.ts`).
- All blockchain writes happen server-side from `src/lib/chain/anchor.ts`. Private keys never reach the client or logs.

## Secrets and config
- Read only through `src/lib/env.ts` (zod-parsed `process.env`). Fail fast on missing vars.
- `.env.local` is git-ignored; `.env.example` is the source of truth for variable names.
- Use a **fresh burner wallet** for Sepolia. Never reuse a wallet that holds real funds.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. The browser never talks to Supabase directly.

## API conventions
Success: `{ "success": true, "data": … }`
Error: `{ "success": false, "error": { "code": "UPPER_SNAKE", "message": "human text" } }`
Never put stack traces, keys, or raw provider errors in responses. Log details server-side.

## Hashing
- File integrity: SHA-256 hex of raw bytes.
- On-chain record hash: `keccak256(utf8(canonicalJson(record)))`. Canonical JSON = keys sorted recursively, no whitespace, arrays in a defined order. One implementation in `src/lib/hash/canonical.ts`, used by anchor, verify, and tests.

## Idempotency
`review_decisions.verification_run_id` is unique; `blockchain_records.review_decision_id` is unique; the contract rejects a duplicate `(batchId, recordHash)`. A retry must never create a second on-chain record.

## Code style
Small pure functions, explicit return types, no `any`, no silent `catch`. Every rule in the cross-checker has a unit test. Prefer clear names over comments.
