# Completion Plan — ProofChain AI remaining features

## Verification note (run after implementation)

Both required gates pass, run from `c:\Users\kashi\Downloads\ProofChain\ProofChain`:

- `npx vitest run` — PASS. 5 test files, 71 tests passed, 0 failed, 0 skipped
  (status-policy 15, climate-analyst 11, cross-checker 30, auditor-postprocess 6,
  canonical 9). Duration 18.48s. Existing tests untouched and green.
- `npx next build` — PASS. `Compiled successfully`, `Generating static pages (7/7)`,
  exit code 0. No TypeScript errors, no ESLint errors. New routes/pages compiled:
  `/api/batches/[id]/anchor`, `/api/passport/[batchCode]`,
  `/api/records/[recordHash]/verify`, `/batches/[id]/review` (3.91 kB),
  `/passport/[batchCode]`, `/verify` (static). QrCard wired into `/batches/[id]`.

All 10 builds + the 1 edit are implemented. No new tests were added (the chain
modules are network/DB I/O heavy; the build is the type gate and existing
vitest tests remain the logic gate), per the plan.



Repo root (all paths absolute under here): `c:\Users\kashi\Downloads\ProofChain\ProofChain`

This plan completes the 10 builds + 1 edit from the task brief. It is grounded in the
existing code (read before planning): `src/lib/env.ts`, `src/lib/api/respond.ts`,
`src/lib/supabase/server.ts`, `src/lib/audit/log.ts`, `src/lib/chain/abi.ts`,
`src/lib/hash/record.ts`, `src/lib/auth/reviewer.ts`, `src/lib/status.ts`,
`src/app/api/batches/[id]/review/route.ts`, `.../route.ts`, `.../report/route.ts`,
`.../evidence/route.ts`, `.../analyze/route.ts`, `src/app/api/auth/reviewer/route.ts`,
`src/app/batches/[id]/page.tsx`, `src/app/page.tsx`, `src/app/batches/[id]/AnalysisPanel.tsx`,
`src/components/*`, `supabase/schema.sql`, `contracts/ProofChainRegistry.sol`,
`package.json`, `tsconfig.json`, `vitest.config.ts`, and the steering/design docs.

## Authoritative conventions (match these exactly)
- API success/error via `ok(data, status)` / `fail(code, message, status)` from `@/lib/api/respond`.
  Shapes: `{ success: true, data }` / `{ success: false, error: { code, message } }`.
- Reviewer auth: `try { requireReviewer(request); } catch (err) { return err as Response; }` (it throws a `Response`).
- Supabase: import `{ supabase }` from `@/lib/supabase/server` (lazy proxy, request-time).
- Env: import `{ env }` from `@/lib/env` (lazy proxy). Available fields used here:
  `SEPOLIA_RPC_URL`, `RECORDER_PRIVATE_KEY`, `REGISTRY_ADDRESS`, `CHAIN_ID`,
  `EXPLORER_BASE_URL`, `NEXT_PUBLIC_APP_URL`.
- Every new API route sets `export const runtime = 'nodejs';` (task requirement) AND
  `export const dynamic = 'force-dynamic';` (matches all existing routes).
- Chain writes only in `src/lib/chain/anchor.ts`; private keys never logged/returned.
- No `any`, no silent `catch`, explicit return types, no raw provider errors in responses.
- Module-level code in `src/lib/chain/*` must NOT instantiate providers/wallets (do it inside
  functions) so Next's build-time page-data collection doesn't fail without `.env.local`.

## Assumptions & decisions (callouts)
1. **`readOnChainRecord` signature** follows the task brief: `readOnChainRecord(batchIdHash,
   recordHash)` where the caller passes the already-hashed `batchIdHash` (from
   `batchIdHash(batchCode)`). This diverges from the older FEAT-005 spec which took
   `(batchCode, recordHash)`; the task brief wins. Callers compute the hash.
2. **Status enum mapping** uses the existing helper `statusToChain(decision as Status)` from
   `src/lib/status.ts`. Its `STATUSES.indexOf` order yields NEEDS_EVIDENCE=2, VERIFIED=4,
   REJECTED=5, RECHECK_REQUIRED=6 — exactly the task's mapping and the contract enum order.
3. **verify route `decided_at` normalization is the critical correctness point.** The existing
   review route hashed with `decided_at = new Date().toISOString()` (e.g.
   `2025-01-15T12:00:00.000Z`). Postgres `timestamptz` returns the stored value with a
   `+00:00` offset (and may drop `.000`), so a raw string read would NOT match. The verify
   route MUST rebuild with `decided_at: new Date(decision.decided_at).toISOString()` to
   reproduce the review route's canonical Z form. Without this, every untampered record
   would falsely report MISMATCH.
4. **verify "no decision found" → NOT_ON_CHAIN** (not a 404), keeping the 3-state
   `MATCH | MISMATCH | NOT_ON_CHAIN` contract the page renders. Explanation included.
5. **verify page dual input.** The page accepts a record hash OR a batch code. If the input
   matches `/^0x[0-9a-f]{64}$/` → call `/api/records/[recordHash]/verify` directly. Otherwise
   treat it as a batch code: first `GET /api/passport/[batchCode]` to obtain its
   `record_hash`, then verify that. If the passport returns no `record_hash` (no decision
   yet) → show NOT_ON_CHAIN. This is how "batch code or record hash" works against a
   verify endpoint keyed by record hash.
6. **anchor route returns `explorer_url`** built server-side from `env.EXPLORER_BASE_URL`
   (it is server-only, not `NEXT_PUBLIC_`, so the client cannot construct it).
7. **Passport API field set** is exactly the task's list: `batch_code, product_name,
   supplier_name, category, production_date, claims, status, is_demo, decision_date,
   record_hash, explorer_url, caveat`. No `decision`/`tx_hash`/`block_number`/ids/filenames/
   notes. (Diverges from older FEAT-005 field names; task brief wins.)
8. **Passport page queries Supabase directly** (matching every server-component page in this
   repo — `page.tsx` home and `batches/[id]/page.tsx`), NOT via a server-side fetch of its own
   API route. The API route is the public machine interface; the page is the human view.
   Both hardcode the identical caveat string.
9. **Review page auth.** It is a client component and cannot read the `httpOnly` cookie, so it
   tracks `authed` in React state after a successful `POST /api/auth/reviewer`. Shows the
   login form when `!authed`, the decision form when `authed`. A reload requires re-login
   (acceptable demo behavior per design.md "demo-grade" auth).
10. **Anchor 60s timeout** uses `Promise.race([tx.wait(1), timeoutMs(60000)])` because ethers v6
    `TransactionResponse.wait(confirms?)` has no timeout parameter. On timeout, do a short
    recovery poll on `provider.getTransactionReceipt(tx.hash)`; if it mined, save the row
    (preserves idempotency against the contract's `DuplicateRecord` revert); otherwise audit
    `anchor_failed` with the tx hash and throw `ANCHOR_FAILED`.
11. **No new unit tests mandated** for `anchor.ts`/`read.ts` (network + DB I/O heavy; mocking
    ethers v6 contracts is fragile). Verification is `npx next build` (type/build gate) +
    `npx vitest run` (existing tests still green) + manual integration. The cross-checker
    unit-test mandate is already satisfied by existing tests.
12. **DB relationship note:** `blockchain_records` has no `batch_id` column; it links to
    `review_decisions` via `review_decision_id` (unique). The anchor flow keys idempotency on
    that column; the passport/verify routes reach the tx hash through the decision's id.

---

# Implementation Plan

- [ ] 1. Create `src/lib/chain/anchor.ts` — idempotent Sepolia anchoring.
      Exports `anchorDecision(decisionId: string): Promise<AnchorResult>` (and the
      `AnchorResult` interface). Mirrors the review route's data assumptions.
      Files: `src/lib/chain/anchor.ts`
      Imports: `import { JsonRpcProvider, Wallet, Contract } from 'ethers';`,
      `import { REGISTRY_ABI } from '@/lib/chain/abi';`,
      `import { env } from '@/lib/env';`,
      `import { supabase } from '@/lib/supabase/server';`,
      `import { appendAudit } from '@/lib/audit/log';`,
      `import { batchIdHash } from '@/lib/hash/record';`,
      `import { statusToChain, type Status } from '@/lib/status';`.
      Return type:
      ```
      export interface AnchorResult {
        id: string; chain_id: number; contract_address: string;
        transaction_hash: string; record_hash: string; block_number: number;
        created_at: string; explorer_url: string;
      }
      ```
      Flow:
      (a) `supabase.from('review_decisions').select('id, batch_id, decision, record_hash, decided_at, verification_run_id').eq('id', decisionId).maybeSingle()` → if none, throw `Object.assign(new Error('Review decision not found'), { code: 'NO_DECISION' })`.
      (b) Idempotency: `supabase.from('blockchain_records').select('id, chain_id, contract_address, transaction_hash, record_hash, block_number, created_at').eq('review_decision_id', decisionId).maybeSingle()` → if a row exists, return it plus `explorer_url = ${env.EXPLORER_BASE_URL}/tx/${row.transaction_hash}` (do not re-send).
      (c) `supabase.from('batches').select('batch_code').eq('id', decision.batch_id).single()` → if none, throw `NO_DECISION`.
      (d) `batchId = batchIdHash(batch.batch_code)` (bytes32 hex string), `recordHash = decision.record_hash`, `statusEnum = statusToChain(decision.decision as Status)` (VERIFIED→4, REJECTED→5, NEEDS_EVIDENCE→2).
      (e) `const provider = new JsonRpcProvider(env.SEPOLIA_RPC_URL);` `const wallet = new Wallet(env.RECORDER_PRIVATE_KEY, provider);` `const contract = new Contract(env.REGISTRY_ADDRESS, REGISTRY_ABI, wallet);` — all inside the function.
      (f) `const tx = await contract.recordVerification(batchId, recordHash, statusEnum);` (ethers encodes the two `bytes32` + `uint8`).
      (g) Wait with timeout + recovery: a private helper `waitForOneConfirmation(provider, tx, 60000)` that races `tx.wait(1)` against a 60s reject promise; on timeout, polls `provider.getTransactionReceipt(tx.hash)` a few times (~10s) and returns the receipt if it mines, else throws. Treat `receipt.status !== 1` as failure.
      (h) On any failure: `await appendAudit(decision.batch_id, 'anchor_failed', { review_decision_id: decisionId, transaction_hash: tx?.hash ?? null, error: String(err?.message ?? err) });` then throw `Object.assign(new Error('Anchor failed'), { code: 'ANCHOR_FAILED' })` (or `CHAIN_UNAVAILABLE` if it was a provider/network error). Never update `batches.status` on failure.
      (i) On success: `supabase.from('blockchain_records').insert({ review_decision_id: decisionId, chain_id: env.CHAIN_ID, contract_address: env.REGISTRY_ADDRESS, transaction_hash: receipt.hash, record_hash: recordHash, block_number: receipt.blockNumber }).select('id, chain_id, contract_address, transaction_hash, record_hash, block_number, created_at').single()` → if insert fails, audit `anchor_failed` (save) and throw `INTERNAL`.
      (j) `await appendAudit(decision.batch_id, 'anchor_recorded', { review_decision_id: decisionId, transaction_hash: receipt.hash, block_number: receipt.blockNumber });`
      (k) Return the row plus `explorer_url`.
      Verify: `cd c:\Users\kashi\Downloads\ProofChain\ProofChain && npx tsc --noEmit` — new file type-checks with no errors.

- [ ] 2. Create `src/lib/chain/read.ts` — read-only on-chain lookup.
      Exports `readOnChainRecord(batchIdHash: string, recordHash: string): Promise<OnChainRecord>` (and `OnChainRecord`).
      Files: `src/lib/chain/read.ts`
      Imports: `import { JsonRpcProvider, Contract } from 'ethers';`,
      `import { REGISTRY_ABI } from '@/lib/chain/abi';`, `import { env } from '@/lib/env';`.
      Return type:
      ```
      export interface OnChainRecord { found: boolean; status?: number; recorder?: string; timestamp?: number; }
      ```
      Flow: `const provider = new JsonRpcProvider(env.SEPOLIA_RPC_URL); const contract = new Contract(env.REGISTRY_ADDRESS, REGISTRY_ABI, provider);` (inside function). `const recorded: boolean = await contract.isRecorded(batchIdHash, recordHash);` if `!recorded` → `return { found: false };`. Else `const count = await contract.getRecordCount(batchIdHash);` if `count > 0n` → `const record = await contract.getLatest(batchIdHash);` and `return { found: true, status: Number(record[1]), recorder: String(record[2]), timestamp: Number(record[3]) };` (access the tuple by index for robustness). Wrap the body in try/catch: on any provider/contract error, `throw Object.assign(new Error('Could not read on-chain record'), { code: 'CHAIN_UNAVAILABLE' })` (do not return `found:false` for network errors — that must be distinguishable by callers).
      Verify: `cd c:\Users\kashi\Downloads\ProofChain\ProofChain && npx tsc --noEmit` — type-checks.

- [ ] 3. Create `src/app/api/batches/[id]/anchor/route.ts` — anchor the latest decision.
      Files: `src/app/api/batches/[id]/anchor/route.ts`
      Imports: `import { type NextRequest } from 'next/server';`, `import { requireReviewer } from '@/lib/auth/reviewer';`, `import { ok, fail } from '@/lib/api/respond';`, `import { supabase } from '@/lib/supabase/server';`, `import { anchorDecision, type AnchorResult } from '@/lib/chain/anchor';`.
      Exports: `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';` and `export async function POST(request: NextRequest, { params }: { params: { id: string } }): Promise<Response>`.
      Flow: `try { requireReviewer(request); } catch (err) { return err as Response; }`. Then `supabase.from('review_decisions').select('id').eq('batch_id', params.id).order('decided_at', { ascending: false }).limit(1).maybeSingle()` → if none, `return fail('NO_DECISION', 'No review decision found for this batch', 404);`. Then `try { const record = await anchorDecision(decision.id); return ok(record); } catch (err) { const code = (err as { code?: string }).code ?? 'ANCHOR_FAILED'; if (code === 'CHAIN_UNAVAILABLE') return fail('CHAIN_UNAVAILABLE', 'Could not reach the blockchain network', 503); return fail('ANCHOR_FAILED', err instanceof Error ? err.message : 'Anchoring failed', 500); }`. Response body (via `ok`) is the `AnchorResult` (includes `explorer_url`, `transaction_hash`, `block_number`).
      Depends on: item 1.
      Verify: `cd c:\Users\kashi\Downloads\ProofChain\ProofChain && npx tsc --noEmit`.

- [ ] 4. Create `src/app/api/passport/[batchCode]/route.ts` — sanitized public passport.
      Files: `src/app/api/passport/[batchCode]/route.ts`
      Imports: `import { supabase } from '@/lib/supabase/server';`, `import { ok, fail } from '@/lib/api/respond';`, `import { env } from '@/lib/env';`.
      Exports: `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';` and `export async function GET(_req: Request, { params }: { params: { batchCode: string } }): Promise<Response>`.
      Define `const CAVEAT = 'A blockchain record proves this decision was not altered after it was recorded. It does not prove the underlying claims are true.';` (module const).
      Flow:
      (a) `supabase.from('batches').select('id, batch_code, status, is_demo, production_date, claims, products ( product_name, supplier_name, category )').eq('batch_code', params.batchCode).maybeSingle()` → if error/none, `return fail('BATCH_NOT_FOUND', \`No batch found with code '${params.batchCode}'\`, 404);`.
      (b) `supabase.from('review_decisions').select('id, decided_at, record_hash').eq('batch_id', batch.id).order('decided_at', { ascending: false }).limit(1).maybeSingle()` → `latestDecision` (or null).
      (c) If `latestDecision`, `supabase.from('blockchain_records').select('transaction_hash').eq('review_decision_id', latestDecision.id).maybeSingle()`; build `explorer_url = bc?.transaction_hash ? \`${env.EXPLORER_BASE_URL}/tx/${bc.transaction_hash}\` : null`. Else `explorer_url = null`.
      (d) `const product = Array.isArray(batch.products) ? batch.products[0] ?? null : batch.products;`
      (e) `return ok({ batch_code: batch.batch_code, product_name: product?.product_name ?? null, supplier_name: product?.supplier_name ?? null, category: product?.category ?? null, production_date: batch.production_date ?? null, claims: batch.claims ?? [], status: batch.status, is_demo: batch.is_demo, decision_date: latestDecision?.decided_at ?? null, record_hash: latestDecision?.record_hash ?? null, explorer_url, caveat: CAVEAT });`
      Return EXACTLY these fields. Never expose filenames, storage_path, reviewer_note, extracted_data, ids, findings, audit data.
      Verify: `cd c:\Users\kashi\Downloads\ProofChain\ProofChain && npx tsc --noEmit`.

- [ ] 5. Create `src/app/api/records/[recordHash]/verify/route.ts` — tamper + on-chain verify.
      Files: `src/app/api/records/[recordHash]/verify/route.ts`
      Imports: `import { supabase } from '@/lib/supabase/server';`, `import { ok, fail } from '@/lib/api/respond';`, `import { env } from '@/lib/env';`, `import { buildRecord, recordHash, batchIdHash } from '@/lib/hash/record';`, `import { readOnChainRecord } from '@/lib/chain/read';`, `import type { Finding, CarbonResult } from '@/lib/agents/schemas';`.
      Exports: `export const runtime = 'nodejs'; export const dynamic = 'force-dynamic';` and `export async function GET(_req: Request, { params }: { params: { recordHash: string } }): Promise<Response>`.
      `const HASH_RE = /^0x[0-9a-f]{64}$/;`
      Flow:
      (a) `if (!HASH_RE.test(params.recordHash)) return fail('VALIDATION_ERROR', 'recordHash must be a 0x-prefixed 32-byte hash', 400);`
      (b) `supabase.from('review_decisions').select('id, batch_id, verification_run_id, decision, override_confirmed, decided_at, record_hash').eq('record_hash', params.recordHash).maybeSingle()` → if none, `return ok({ result: 'NOT_ON_CHAIN', explanation: 'No review decision with this record hash was found in the database, and it is not recorded on chain.' });`
      (c) Load supporting data:
          - `supabase.from('batches').select('batch_code, claims').eq('id', decision.batch_id).single()` → `batch`.
          - `supabase.from('evidence_documents').select('sha256_hash, document_type').eq('batch_id', decision.batch_id)` → `docs` (array, maybe empty).
          - `supabase.from('verification_runs').select('run_number, findings, carbon_result, ai_recommendation').eq('id', decision.verification_run_id).single()` → `run`.
          - `supabase.from('blockchain_records').select('transaction_hash, block_number').eq('review_decision_id', decision.id).maybeSingle()` → `bc`.
          If `!batch || !run` → `return fail('INTERNAL', 'Could not load linked batch or verification run', 500);`
      (d) Rebuild the record EXACTLY as the review route did:
          `const claims = (batch.claims as { claim_type: string }[]).map(c => c.claim_type);`
          `const evidence = ((docs ?? []) as { sha256_hash: string; document_type: string | null }[]).map(d => ({ sha256: d.sha256_hash, document_type: d.document_type ?? 'other' }));`
          `const findings = (run.findings as Finding[]) ?? [];`
          `const carbon = (run.carbon_result as CarbonResult | null) ?? null;`
          `const decided_at = new Date(decision.decided_at).toISOString();`  // ← NORMALIZATION, see assumption #3
          `const rebuilt = buildRecord({ batch_code: batch.batch_code, claims, run_number: run.run_number, ai_recommendation: run.ai_recommendation ?? '', evidence, findings, carbon_result: carbon, decision: decision.decision as 'VERIFIED' | 'REJECTED' | 'NEEDS_EVIDENCE', override_confirmed: decision.override_confirmed, decided_at });`
      (e) `const recomputed = recordHash(rebuilt);`
      (f) `if (recomputed !== params.recordHash) return ok({ result: 'MISMATCH', explanation: 'The record rebuilt from the current database state no longer matches the stored hash. The underlying data may have been altered since the decision was recorded.', stored_hash: params.recordHash, recomputed_hash: recomputed });`
      (g) On-chain: `try { const onChain = await readOnChainRecord(batchIdHash(batch.batch_code), params.recordHash); ... } catch { return fail('CHAIN_UNAVAILABLE', 'Could not read the on-chain registry', 503); }`. If `!onChain.found` → `return ok({ result: 'NOT_ON_CHAIN', explanation: 'The record hash matches the database but has not been recorded on chain yet.', record_hash: params.recordHash });`. Else `const explorer_url = bc?.transaction_hash ? \`${env.EXPLORER_BASE_URL}/tx/${bc.transaction_hash}\` : null;` and `return ok({ result: 'MATCH', record_hash: params.recordHash, explorer_url, block_number: bc?.block_number ?? null, on_chain_status: onChain.status, recorder: onChain.recorder, timestamp: onChain.timestamp });`
      Depends on: item 2.
      Verify: `cd c:\Users\kashi\Downloads\ProofChain\ProofChain && npx tsc --noEmit`.

- [ ] 6. Create `src/components/QrCard.tsx` — client QR component.
      Files: `src/components/QrCard.tsx`
      Imports: `import { useEffect, useState } from 'react';`, `import QRCode from 'qrcode';`, `import Link from 'next/link';`.
      Signature: `interface QrCardProps { batchCode: string; } export function QrCard({ batchCode }: QrCardProps) { ... }` with `'use client';` at top.
      Body: `const url = \`${process.env.NEXT_PUBLIC_APP_URL}/passport/${batchCode}\`;` (inlined at build time for client). `useEffect` (dep `[url]`): `QRCode.toDataURL(url, { width: 240, margin: 1 }).then(d => !cancelled && setDataUrl(d)).catch(e => !cancelled && setError(...))` with a `cancelled` flag + cleanup. State: `dataUrl: string | null`, `error: string | null`. Render: a bordered card with an `<img>` (`alt="QR code linking to the public passport for batch ${batchCode}"`) when `dataUrl`, a spinner while null and no error, an error message if `error`, and a clickable `Link` to `url` with label "Scan to view public passport" plus the URL text. Tailwind classes consistent with other components (rounded-lg border border-gray-200 bg-white p-5, max-w).
      Verify: `cd c:\Users\kashi\Downloads\ProofChain\ProofChain && npx tsc --noEmit`.

- [ ] 7. Create `src/app/batches/[id]/review/page.tsx` — reviewer decision + anchor UI.
      Files: `src/app/batches/[id]/review/page.tsx`
      Imports: `import { useEffect, useState } from 'react';`, `import Link from 'next/link';`, `import { StatusBadge } from '@/components/StatusBadge';` (reuse for status display). Optionally `import { FindingCard } from '@/components/FindingCard';` for flag listing.
      Signature: `'use client'; export default function ReviewPage({ params }: { params: { id: string } }) { ... }`.
      State: `authed` (boolean, false), `loginError`, `passcode`, `batch` (the `GET /api/batches/:id` shape — reuse the field names from that route: `batchCode, status, isDemo, product, latestRun { ai_recommendation, recommendation_ceiling, findings }, latestDecision { decision, record_hash, decided_at }, latestBlockchainRecord { transaction_hash, ... } }`), `loading`, `pageError`, `decision` ('VERIFIED'|'REJECTED'|'NEEDS_EVIDENCE'|''), `reviewer_note`, `override_confirmed`, `submitting`, `submitError`, `anchorState` ('idle'|'anchoring'|'anchored'|'error'), `anchorError`, `anchorRecord`.
      On mount `useEffect([params.id])`: `fetch(\`/api/batches/${params.id}\`)` → parse `{success, data}` → `setBatch(data)` or `setPageError`. (This route is public, returns latestRun/latestDecision/latestBlockchainRecord.)
      Derived: `const highFlag = batch?.latestRun?.findings?.some(f => f.severity === 'high' && f.result === 'FLAG') ?? false;` (controls the override checkbox visibility). `const hasDecision = !!batch?.latestDecision;`.
      Login form (shown when `!authed`): passcode input + "Log in" button → `fetch('/api/auth/reviewer', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({passcode}) })` → 200 → `setAuthed(true)`; 401 → `setLoginError('Invalid passcode')`.
      Decision form (shown when `authed`): render AI recommendation vs ceiling from `latestRun.ai_recommendation` / `latestRun.recommendation_ceiling` (badge colors per AnalysisPanel pattern). Radio group VERIFIED/REJECTED/NEEDS_EVIDENCE. `<textarea>` for `reviewer_note` (min 10 chars, client-check on submit). Override checkbox shown only when `highFlag`; if shown and decision=VERIFIED, require it checked before submit (or surface the 422 server message). Submit → `fetch(\`/api/batches/${params.id}/review\`, { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ decision, reviewer_note, override_confirmed }) })` → on success `ok` parse `{ decisionId, record_hash }`, then re-fetch batch detail to refresh `latestDecision`. Handle 409 DECISION_EXISTS / 422 OVERRIDE_REQUIRED / 401 by surfacing messages.
      After decision (`hasDecision`): show existing decision summary (decision + decided_at + truncated record_hash) and an "Anchor on Sepolia" button → `fetch(\`/api/batches/${params.id}/anchor\`, { method:'POST', credentials:'same-origin' })` → `setAnchorState('anchoring')`; on success parse `data` (the `AnchorResult` with `transaction_hash`, `explorer_url`, `block_number`) → `setAnchorState('anchored')`, `setAnchorRecord(data)`; show "Anchored ✓" with an external explorer link `<a href={anchorRecord.explorer_url} target="_blank" rel="noopener noreferrer">`. If `latestBlockchainRecord` already present on load, pre-populate `anchorState='anchored'` and `anchorRecord=latestBlockchainRecord`-derived (build `explorer_url` from `transaction_hash`? — the batch detail route does NOT return explorer_url, so on initial load show "Already anchored" with the tx hash and a link built from `${process.env.NEXT_PUBLIC_APP_URL}`? No — explorer base is server-only. Instead, when anchored, fetch the passport route to get `explorer_url`, OR just display the tx hash and let the "Anchor" re-call return `explorer_url`. Simplest: on load, if `latestBlockchainRecord` exists, show "Anchored (tx ${tx_hash.slice(0,10)}…)" and enable the button which re-calls anchor (idempotent) to obtain `explorer_url`. Note this.)
      Loading/empty/error: `loading` spinner while batch fetch pending; `pageError` red box; if `latestRun` missing → "Run analysis first" message + link to batch detail.
      Depends on: item 3 (anchor route); uses existing review route + auth route + batch detail route.
      Verify: `cd c:\Users\kashi\Downloads\ProofChain\ProofChain && npx next build` (builds the page + its imports; this is the first item that pulls in a page, so run the full build here).

- [ ] 8. Create `src/app/passport/[batchCode]/page.tsx` — public passport (server component).
      Files: `src/app/passport/[batchCode]/page.tsx`
      Imports: `import { notFound } from 'next/navigation';`, `import Link from 'next/link';`, `import { supabase } from '@/lib/supabase/server';`, `import { env } from '@/lib/env';`, `import { StatusBadge } from '@/components/StatusBadge';`, `import { DemoBanner } from '@/components/DemoBanner';`.
      Exports: `export const dynamic = 'force-dynamic';` and `export default async function PassportPage({ params }: { params: { batchCode: string } })`.
      Define the same caveat const as the API route: `const CAVEAT = 'A blockchain record proves this decision was not altered after it was recorded. It does not prove the underlying claims are true.';`.
      Flow: query supabase directly (per assumption #8):
      (a) `supabase.from('batches').select('id, batch_code, status, is_demo, production_date, claims, products ( product_name, supplier_name, category )').eq('batch_code', params.batchCode).maybeSingle()` → if none, `notFound()`.
      (b) `supabase.from('review_decisions').select('id, decided_at, record_hash').eq('batch_id', batch.id).order('decided_at', { ascending: false }).limit(1).maybeSingle()` → `latestDecision`.
      (c) If `latestDecision`: `supabase.from('blockchain_records').select('transaction_hash').eq('review_decision_id', latestDecision.id).maybeSingle()` → build `explorer_url`.
      (d) `const product = Array.isArray(batch.products) ? batch.products[0] ?? null : batch.products;`
      Render: `<DemoBanner isDemo={batch.is_demo} />` then a `main` (max-w-2xl, px-4, py-8) with: product name (h1), supplier, category, production date; claims list (render each `claims` item as `claim_type` plus value/unit if present, e.g. `recycled_content — 100 percent`); `<StatusBadge status={batch.status} />`; decision date (`latestDecision?.decided_at` formatted) if present; record hash truncated (`${record_hash.slice(0,10)}…${record_hash.slice(-6)}`) if present; explorer link `<a href={explorer_url} ...>` if present; the CAVEAT in a prominent bordered box; "DEMO DATA" banner already handled by `DemoBanner`. Responsive: use `max-w-2xl mx-auto px-4`, `grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3` for the metadata dl so it works at 360px (single column) and up. Back link to `/`.
      Verify: `cd c:\Users\kashi\Downloads\ProofChain\ProofChain && npx next build`.

- [ ] 9. Create `src/app/verify/page.tsx` — verification UI (client component).
      Files: `src/app/verify/page.tsx`
      Imports: `import { useState } from 'react';`, `import Link from 'next/link';`.
      Signature: `'use client'; export default function VerifyPage() { ... }`.
      State: `input` (string), `loading` (boolean), `result` (the verify response object: `{ result: 'MATCH'|'MISMATCH'|'NOT_ON_CHAIN', ... }`), `error` (string|null).
      `const HASH_RE = /^0x[0-9a-f]{64}$/;`
      Submit handler `handleSubmit`:
      - `setLoading(true); setResult(null); setError(null);`
      - `const value = input.trim();`
      - Determine the record hash to verify:
        - if `HASH_RE.test(value)` → `recordHash = value`.
        - else (batch code): `const pRes = await fetch(\`/api/passport/${encodeURIComponent(value)}\`);` if `!pRes.ok` → if 404 `setError(\`No batch found with code '${value}'\`)` and stop; else read error; if `pRes.ok` parse `{data: { record_hash } }` → if `!record_hash` → `setResult({ result: 'NOT_ON_CHAIN', explanation: \`Batch '${value}' has no recorded decision yet.\` })` and stop; else `recordHash = record_hash`.
      - `const res = await fetch(\`/api/records/${encodeURIComponent(recordHash)}/verify\`);` parse `{ success, data, error }`.
        - if `!res.ok` → `setError(error?.message ?? 'Verification request failed')`.
        - else `setResult(data)`.
      - finally `setLoading(false)`.
      Render: heading "Verify a record", an input (placeholder "Batch code (e.g. TX-1042) or record hash (0x…)"), a "Verify" button (disabled while loading), loading spinner. Result panel keyed on `result.result`:
        - `MATCH` → green box: "✓ Match" + record hash (truncated) + explorer link (`data.explorer_url`, external) + block number if present + short explanation "The database record matches the hash recorded on chain."
        - `MISMATCH` → red box: "✗ Mismatch" + `explanation` + show `stored_hash` vs `recomputed_hash` if present.
        - `NOT_ON_CHAIN` → yellow box: "○ Not on chain" + `explanation`.
      Error state: red box with `error`. Empty state: hint text before first submit.
      Verify: `cd c:\Users\kashi\Downloads\ProofChain\ProofChain && npx next build`.

- [ ] 10. Add `QrCard` to the batch detail page.
      Files: `src/app/batches/[id]/page.tsx` (edit only — scoped to the QR stub section + the import).
      Change: add `import { QrCard } from '@/components/QrCard';` to the imports, then replace the existing QR stub block:
      ```
      {/* QR card — stub (FEAT-005) */}
      <section className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-5">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">QR card</h2>
        <p className="text-sm text-gray-400">QR card generation coming in FEAT-005.</p>
      </section>
      ```
      with:
      ```
      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">Public passport QR</h2>
        <QrCard batchCode={batch.batch_code} />
      </section>
      ```
      Do not alter any other section of the file.
      Depends on: item 6.
      Verify: `cd c:\Users\kashi\Downloads\ProofChain\ProofChain && npx next build` — build succeeds (page now imports the real QrCard).

- [ ] 11. Final verification gate.
      Run both commands from `c:\Users\kashi\Downloads\ProofChain\ProofChain`:
      - `npx vitest run` — all existing tests still pass (the new files add no tests; nothing existing is broken).
      - `npx next build` — zero TypeScript/build errors; all new routes and pages compile.
      Also confirm (grep-free, manual reasoning): no `process.env` reads outside `src/lib/env.ts` in the new server files except `process.env.NEXT_PUBLIC_APP_URL` in the client `QrCard` (allowed — public env inlined for client) and `process.env.NODE_ENV` is not used here. No private keys or provider errors appear in any response body.
      Verify: both commands exit 0.

## Notes the implementer should keep in mind
- Mirror the review route's defaults in the verify rebuild exactly: evidence `document_type ?? 'other'`, claims as `claim_type` strings, `ai_recommendation ?? ''`, `findings ?? []`, `carbon_result ?? null`, and the normalized `decided_at`.
- The on-chain tuple from `getLatest` is accessed by index `[0..3]` (recordHash, status, recorder, timestamp) for robustness regardless of named/unnamed struct decoding.
- Keep route handlers thin: parse/auth → call lib (`anchorDecision`/`readOnChainRecord`) → respond.
- If `npx tsc --noEmit` complains about Next-augmented types in isolation, fall back to `npx next build` (the authoritative type/build gate) for that item.
