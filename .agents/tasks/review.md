# Sepolia anchor/read modules, passport & verify APIs, QR card, and review/passport/verify pages

This change adds the chain-anchoring and on-chain-read modules, the three API routes they back, a client QR card wired into the batch detail page, and the reviewer-decision, public-passport, and verify pages. Anchoring is idempotent (returns an existing `blockchain_records` row without re-sending), never mutates batch status on failure, and writes an `anchor_failed` audit entry before throwing; the verify route rebuilds the canonical record from the DB, coerces the stored `decided_at` back to the Z-form the review route hashed with, and returns MATCH / MISMATCH / NOT_ON_CHAIN. The ten reviewed files implement the brief faithfully — the problems are around them, not in them.

**Watch for:** the modules the new code imports (`abi.ts`, `record.ts`, `canonical.ts`, `auth/reviewer.ts`, the review and auth API routes, `canonical.test.ts`) are untracked in git — `git log` is empty for each, so a clean checkout of this commit will not build, and the recorded build/test evidence was collected against the working tree, not the commit. The anchor confirmation timer also leaks an unhandled promise rejection on the success path.

**Verdict**: NEEDS_CHANGES

## High-level view

Anchoring (`anchorDecision` + the anchor route) loads a decision, short-circuits on an existing `blockchain_records` row, otherwise sends `recordVerification` with the status enum mapped via `statusToChain` (NEEDS_EVIDENCE=2, VERIFIED=4, REJECTED=5, RECHECK_REQUIRED=6 — verified against both `status.ts` and the Solidity enum), waits one confirmation with a 60s timeout plus a short recovery poll, and persists the row. It never writes batch status and audits `anchor_failed` before every throw, and no raw ethers message reaches a response. The confirmation-wait helper leaves its timeout timer armed on the success path, so a successful anchor still rejects an unhandled promise ~48s later.

On-chain read is a thin `isRecorded` → `getRecordCount` → `getLatest` lookup returning `found/status/recorder/timestamp`, throwing `CHAIN_UNAVAILABLE` on any provider error so callers can tell a network failure from a legitimately-not-recorded record.

The passport GET returns exactly the twelve sanitized public fields and nothing else (ids, transaction hashes, filenames, notes are selected internally but never returned); the verify GET validates the hash, rebuilds the canonical record from batch+evidence+run using the same defaults as the review route, normalizes `decided_at` with `new Date(...).toISOString()` to reproduce the original hash, compares, then reads on chain for MATCH / MISMATCH / NOT_ON_CHAIN.

The UI covers the brief: the review page handles reviewer login, AI-rec-vs-ceiling, the radio+textarea(min 10)+override-on-high-flags decision form, and a post-decision anchor button with tx status and explorer link; the passport server page renders the sanitized fields, the exact caveat, and the demo banner; the verify page renders MATCH(green) / MISMATCH(red) / NOT_ON_CHAIN(yellow); QrCard builds the QR in a `useEffect` and is wired into the batch detail page.

Commit completeness and tests: the imported dependency modules were never committed (`git log` empty for each), so the committed tree is not buildable and the build/test evidence validates only the working tree; the anchor orchestration and the verify `decided_at` normalization — the most fragile paths — have no tests.

<details>
<summary>Issues (4)</summary>

1. **Commit not self-contained — dependency modules untracked** — `src/lib/chain/abi.ts`, `src/lib/hash/record.ts`, `src/lib/hash/canonical.ts`, `src/lib/auth/reviewer.ts`, the review and auth API routes, and `tests/canonical.test.ts` are untracked (`git log` empty for each; nothing ignores them), so a clean checkout of this commit won't build and the recorded build/test evidence was run against the working tree, not the commit. Stage and commit them alongside this change.
2. **Anchor confirmation timer leaks an unhandled rejection** — the 60s `timeout` promise in `waitForOneConfirmation` is never cleared and has no catch on the success path; ~48s after a successful anchor it rejects with no handler (unhandledRejection, possible crash under default `unhandled-rejections=throw` on a long-running `next start`; lower impact on serverless where the container is gone first). Clear the timer or attach a no-op catch to the timeout promise.
3. **Orphaned on-chain record unrecoverable by retry** — if the tx mines (`receipt.status===1`) but the `blockchain_records` insert then fails, the on-chain record is permanent with no DB row; a retry hits the contract's `DuplicateRecord` revert, and the recovery branch re-checks only the DB (still empty) before throwing `CHAIN_UNAVAILABLE`, stranding the record. Recover from the on-chain receipt in that branch or make the insert idempotent/retry-safe.
4. **Critical verify path and anchor orchestration untested** — the `decided_at` normalization (the single most fragile correctness point) and the anchor idempotency/timeout/recovery logic have no tests; the 71-test suite covers hashing primitives and agents, not this orchestration. Add a record-then-verify round-trip test and tests for the anchor recovery branches.

</details>

<details>
<summary>Details</summary>

### Idempotent Sepolia anchoring (anchor.ts + anchor route)

The route is thin: `requireReviewer`, load the latest `review_decisions` id for the batch, call `anchorDecision`, map the thrown code to a response (`CHAIN_UNAVAILABLE`→503, `NO_DECISION`→404, else `ANCHOR_FAILED`→500). The auth pattern matches the existing review route — `requireReviewer` throws a `Response` the route returns.

`anchorDecision` loads the decision, checks `blockchain_records` keyed on `review_decision_id`, and returns the existing row plus a server-built `explorer_url` (since `EXPLORER_BASE_URL` is server-only, not `NEXT_PUBLIC_`) without sending a tx — the idempotency the brief requires. With no row it loads the `batch_code`, computes `batchIdHash`, maps the decision through `statusToChain`, and calls `recordVerification`. The wait races `tx.wait(1)` against a 60s timeout with a 10s recovery poll on timeout, which preserves idempotency against the contract's `DuplicateRecord` revert. Every failure path (send error, wait error, revert, insert error) writes an `anchor_failed` audit entry with the tx hash when known, then throws; batch status is never written here — the review route is the only place it changes. Each throw is a sanitized `anchorError`, and the route maps codes to fixed strings, so no raw provider message reaches a response.

Two concerns live here. The confirmation-wait helper's `timeout` promise is created with a bare `setTimeout` and is never cleared (confirmed): on the normal path `tx.wait(1)` resolves and the function returns, but the 60s timer is still armed and rejects ~48s later with no handler attached, raising `unhandledRejection` — under the default `unhandled-rejections=throw` on a long-running `next start` that can crash the process (serverless escapes it because the container is gone before 60s). Second (likely): if the transaction mines but the `blockchain_records` insert then fails, the on-chain record is permanent with no DB row; a retry hits `DuplicateRecord`, and the recovery branch re-checks only the DB (still empty) before throwing `CHAIN_UNAVAILABLE`, so the stranded record can't be recovered through the normal path — it needs a chain-receipt fallback there or an idempotent insert.

### On-chain record read (read.ts)

`readOnChainRecord` calls `isRecorded`, and when true calls `getRecordCount` then `getLatest`, returning `{ found, status, recorder, timestamp }`; it accesses the struct by named field (`record.status` etc.), which works because the ABI declares the tuple with named components. Any provider/contract error is caught and rethrown as `CHAIN_UNAVAILABLE` rather than returned as `found:false`, keeping a network failure distinguishable from a not-yet-recorded record. The `getLatest` `NoRecords` revert is guarded by the `count > 0n` check, so it can't fire on this path.

### Public passport and tamper-check verify APIs

The passport GET returns exactly the twelve brief fields — `batch_code, product_name, supplier_name, category, production_date, claims, status, is_demo, decision_date, record_hash, explorer_url, caveat` — and nothing else: it selects ids and `transaction_hash` internally but never returns them, so no ids/filenames/notes/docs leak. `explorer_url` is built server-side from `EXPLORER_BASE_URL`.

The verify GET is the integrity check. It validates the `0x`-prefixed 64-hex format, finds the `review_decisions` row by `record_hash` (returning NOT_ON_CHAIN with an explanation if none), then loads batch+evidence+run and rebuilds the canonical record with `buildRecord` using the same defaults the review route used — claims as `claim_type` strings, evidence `document_type ?? 'other'`, `ai_recommendation ?? ''`, `findings ?? []`, `carbon_result` passthrough. The load-bearing detail is `decided_at`: the review route hashed with `new Date().toISOString()` (a Z-form string), but Postgres returns `timestamptz` with a `+00:00` offset and may drop trailing zeros, so a raw read would never match; the verify route coerces it back with `new Date(decision.decided_at).toISOString()` to reproduce the original form (confirmed by reading both routes). It compares the recomputed hash to the stored one (MISMATCH if they differ — the desired tamper signal), then reads on chain: not-found → NOT_ON_CHAIN, found → MATCH with the on-chain status/recorder/timestamp and explorer link. The three-state contract holds, including the "no decision found" case folded into NOT_ON_CHAIN rather than a 404. This normalization is the most fragile part of the change and the one most worth a test.

### Reviewer, passport, and verify UI, plus QR

The review page is a client component that fetches `/api/batches/:id`, shows AI recommendation against the ceiling, gates a reviewer login form (POST `/api/auth/reviewer`) behind an `authed` flag, and renders the decision form only when there's a `latestRun` and no decision yet: a VERIFIED/REJECTED/NEEDS_EVIDENCE radio group, a textarea with a client-side min-10-char check, and an override checkbox shown only when a high-severity FLAG finding exists (and required when verifying — matching the server's 422). It submits via POST `/api/batches/:id/review` with `credentials:'same-origin'` and re-fetches the batch on success. Once a decision exists it shows the recorded decision plus an "Anchor on Sepolia" button (POST `/api/batches/:id/anchor`) that surfaces tx status, block number, and an external explorer link; loading, page-error, and no-run states are all handled. One minor behavior: when a blockchain record already exists on load it sets the anchored state but leaves the explorer link absent until the idempotent button is re-clicked, because the batch-detail route doesn't return `explorer_url` — a documented tradeoff, not a defect.

The passport page is a server component querying Supabase directly (matching the repo's other server pages) and renders the same sanitized fields, the exact caveat string, and the `DemoBanner` when `is_demo`, with a responsive single→two-column grid. The verify page is a client component accepting a batch code or record hash: a record hash goes straight to `/api/records/[hash]/verify`, while a batch code is first resolved to its `record_hash` via the passport route (NOT_ON_CHAIN if it has no decision yet), then verified — a sensible reading of "batch code or record hash" against a hash-keyed endpoint. It renders MATCH in a green box, MISMATCH in red (with stored vs recomputed hashes), and NOT_ON_CHAIN in yellow, with loading/empty/error states. `QrCard` is a client component that builds the QR in a `useEffect` via `qrcode.toDataURL` pointing at `${NEXT_PUBLIC_APP_URL}/passport/${batchCode}`, with cancellation cleanup, and is wired into the batch detail page as `<QrCard batchCode={batch.batch_code} />`.

### Commit completeness and test coverage

The ten reviewed files are correct, but they are not the whole story. The modules they import — `src/lib/chain/abi.ts`, `src/lib/hash/record.ts`, `src/lib/hash/canonical.ts`, `src/lib/auth/reviewer.ts`, the review and auth API routes, and `tests/canonical.test.ts` — are untracked (confirmed): `git log` shows no commit for any of them, and `git check-ignore` confirms nothing is suppressing them. So a clean checkout of this commit is missing its own imports and will not build, and the recorded "build passed / 71 tests passed" evidence was collected against the working tree, not the committed tree. These need to be committed for the change to be shippable.

On coverage (likely): the 71 passing tests exercise the hashing primitives, the agents, and status policy, but nothing in the new orchestration — not the anchor idempotency short-circuit, the timeout/recovery poll, the `DuplicateRecord` branch, nor the verify route's `decided_at` normalization round trip. That normalization is the point most likely to silently regress (any change to how Postgres returns `timestamptz`, or to the review route's `decided_at` form, turns every honest record into a false MISMATCH), so a record-then-verify round-trip test would be the highest-value addition.

</details>

<details>
<summary>File map</summary>

- `src/lib/chain/anchor.ts` — idempotent Sepolia anchoring with timeout + recovery poll and DuplicateRecord re-check; never mutates batch status.
- `src/lib/chain/read.ts` — read-only `isRecorded`/`getLatest` lookup returning `found/status/recorder/timestamp`.
- `src/app/api/batches/[id]/anchor/route.ts` — reviewer-gated POST that anchors the latest decision.
- `src/app/api/passport/[batchCode]/route.ts` — GET returning the twelve sanitized public fields + caveat.
- `src/app/api/records/[recordHash]/verify/route.ts` — GET that rebuilds the canonical record, compares hashes, reads on chain, returns MATCH/MISMATCH/NOT_ON_CHAIN.
- `src/components/QrCard.tsx` — client QR pointing at `${NEXT_PUBLIC_APP_URL}/passport/${batchCode}`.
- `src/app/batches/[id]/review/page.tsx` — reviewer login, decision form, and anchor UI.
- `src/app/passport/[batchCode]/page.tsx` — public passport server page with caveat + demo banner.
- `src/app/verify/page.tsx` — batch-code-or-hash verifier with colored three-state result.
- `src/app/batches/[id]/page.tsx` — wires `QrCard` into the batch detail page.

Full diff: `git diff 57cb9f2 be7d277` (commit `be7d277`).

</details>
