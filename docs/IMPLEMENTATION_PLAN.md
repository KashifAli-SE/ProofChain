# Implementation Plan — setup, commands, skeletons

How to turn the pack into a running app. `tasks.md` is the ordered checklist; this file has the commands and code skeletons Kiro needs.

## 1. Before you start (do in the first 30 minutes — these have waiting time)
1. **Burner wallet**: create a brand-new wallet (any wallet app). Export its private key into `.env.local` as `DEPLOYER_PRIVATE_KEY` (and `RECORDER_PRIVATE_KEY`, can be the same). Never use a wallet with real funds.
2. **Sepolia ETH**: request from a faucet listed on ethereum.org's Sepolia page. Faucets can be slow or rate-limited; request early and try a second one if needed. A few hundredths of test ETH is plenty.
3. **RPC URL**: create a free Sepolia endpoint with any RPC provider; set `SEPOLIA_RPC_URL`.
4. **Supabase**: new project → SQL editor → run `supabase/schema.sql`. Copy project URL and service-role key.
5. **Gemini**: create an API key; set `GEMINI_API_KEY`. Check which model names your key supports and set `GEMINI_MODEL`.
6. **Kiro**: open this folder. Kiro should pick up `.kiro/steering`, `.kiro/specs/proofchain-ai`, and `.kiro/hooks` automatically. Confirm the spec appears in the Specs panel and the three hooks are enabled.

## 2. Install
```bash
# from repo root (use create-next-app in a temp folder and move files if the root is not empty)
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

npm i zod @supabase/supabase-js @google/genai unpdf qrcode ethers dotenv
npm i -D vitest @types/qrcode

# contract tooling: Hardhat 2.x + the "hh2" toolbox tag (the default "latest" toolbox is for Hardhat 3 and fails)
npm i -D hardhat@^2 "@nomicfoundation/hardhat-toolbox@hh2" ts-node @types/mocha @types/node
# ts-node does not work with TypeScript 7 (error: "Cannot read properties of undefined (reading 'fileExists')").
# create-next-app may install a newer TypeScript; pin to 5.x:
npm i -D typescript@~5.5
```
These three pitfalls (toolbox tag, TypeScript 5.x pin, separate `tsconfig.hardhat.json`) were hit while testing this pack; the contract's 9 tests passed once they were applied.
Add to `package.json` scripts:
```json
"test": "vitest run",
"chain:test": "TS_NODE_PROJECT=tsconfig.hardhat.json hardhat test",
"chain:compile": "TS_NODE_PROJECT=tsconfig.hardhat.json hardhat compile",
"chain:deploy": "TS_NODE_PROJECT=tsconfig.hardhat.json hardhat run scripts/deploy.ts --network sepolia"
```
`tsconfig.hardhat.json` (provided) exists because Hardhat needs CommonJS while Next.js uses ESM-style settings. If a version mismatch causes install errors, pin `hardhat` and `@nomicfoundation/hardhat-toolbox` to a compatible pair per the toolbox README.

Create `vitest.config.ts` with alias `@` → `src`.

## 3. Contract workflow
```bash
npm run chain:compile
npm run chain:test        # all 9 tests must pass
npm run chain:deploy      # prints REGISTRY_ADDRESS
```
Put the address in `.env.local`. Open `https://sepolia.etherscan.io/address/<address>` and confirm the contract exists.
If the deploy fails with "insufficient funds", wait for the faucet; if with network errors, try another RPC URL.

Minimal ABI for `src/lib/chain/abi.ts` (ethers human-readable):
```ts
export const REGISTRY_ABI = [
  "function recordVerification(bytes32 batchId, bytes32 recordHash, uint8 status) returns (uint256)",
  "function getRecordCount(bytes32 batchId) view returns (uint256)",
  "function getLatest(bytes32 batchId) view returns (tuple(bytes32 recordHash, uint8 status, address recorder, uint64 timestamp))",
  "function getRecord(bytes32 batchId, uint256 index) view returns (tuple(bytes32 recordHash, uint8 status, address recorder, uint64 timestamp))",
  "function isRecorded(bytes32 batchId, bytes32 recordHash) view returns (bool)",
  "function isRecorder(address) view returns (bool)",
  "event VerificationRecorded(bytes32 indexed batchId, bytes32 indexed recordHash, uint8 status, uint256 index, address recorder, uint256 timestamp)"
] as const;
```
Make sure the recorder wallet (`RECORDER_PRIVATE_KEY`) is the deployer or has been added with `setRecorder`.

## 4. Code skeletons

### `src/lib/env.ts`
```ts
import { z } from "zod";
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url(),
  MAX_UPLOAD_MB: z.coerce.number().default(10),
  REVIEWER_PASSCODE: z.string().min(8),
  SESSION_SECRET: z.string().min(32),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  EVIDENCE_BUCKET: z.string().default("evidence"),
  GEMINI_API_KEY: z.string().min(10),
  GEMINI_MODEL: z.string().min(3),
  SEPOLIA_RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number().default(11155111),
  EXPLORER_BASE_URL: z.string().url().default("https://sepolia.etherscan.io"),
  RECORDER_PRIVATE_KEY: z.string().regex(/^(0x)?[0-9a-fA-F]{64}$/),
  REGISTRY_ADDRESS: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
});
export const env = schema.parse(process.env);   // import only from server code
```

### `src/lib/status.ts`
```ts
export const STATUSES = ["DRAFT","ANALYZING","NEEDS_EVIDENCE","IN_REVIEW","VERIFIED","REJECTED","RECHECK_REQUIRED"] as const;
export type Status = (typeof STATUSES)[number];
export const statusToChain = (s: Status) => STATUSES.indexOf(s);   // matches Solidity enum order
export const RECORDABLE: Status[] = ["NEEDS_EVIDENCE","VERIFIED","REJECTED","RECHECK_REQUIRED"];
```

### `src/lib/hash/canonical.ts`
```ts
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}
```
Test: `canonicalJson({b:1,a:{d:2,c:3}}) === '{"a":{"c":3,"d":2},"b":1}'`.

### `src/lib/hash/record.ts`
```ts
import { keccak256, toUtf8Bytes } from "ethers";
import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical";
export const sha256Hex = (s: string) => createHash("sha256").update(s).digest("hex");
export const recordHash = (record: unknown) => keccak256(toUtf8Bytes(canonicalJson(record)));
export const batchIdHash = (batchCode: string) => keccak256(toUtf8Bytes(batchCode));
// buildRecord(...) follows the VerificationRecord shape in design.md; sort claims, evidence by sha256, findings by finding_id.
```

### `src/lib/chain/anchor.ts` (behaviour)
```
anchorDecision(decisionId):
  existing = select blockchain_records where review_decision_id = decisionId
  if existing → return existing                           // idempotent
  decision = load decision (+ record_json, record_hash)
  assert recordHash(decision.record_json) === decision.record_hash   // tamper check before sending
  if await registry.isRecorded(batchId, hash) → recover from event logs or return ANCHOR_FAILED with explanation
  audit('anchor_submitted')
  tx = await registry.recordVerification(batchId, hash, statusToChain(decision.decision → status))
  receipt = await tx.wait(1, 120_000)
  if receipt.status !== 1 → audit('anchor_failed'); throw ANCHOR_FAILED
  insert blockchain_records {chain_id, contract_address, tx_hash, block_number, record_hash}
  audit('anchor_succeeded')
```
Map decision → status for the chain: `VERIFIED→VERIFIED`, `REJECTED→REJECTED`, `NEEDS_EVIDENCE→NEEDS_EVIDENCE`.

### Reviewer cookie
Use HMAC-SHA256 of `reviewer:{expiryUnix}` with `SESSION_SECRET`; cookie `pc_reviewer=<expiry>.<sig>`; `httpOnly`, `sameSite=lax`, `secure` in production, 8 h expiry. Compare with `crypto.timingSafeEqual`.

## 5. Working with Kiro efficiently
1. Open `.kiro/specs/proofchain-ai/tasks.md` and run tasks one at a time with "Start task". Do not run the whole list at once.
2. After each task: run the app or tests yourself. Commit (`git init` first). If Kiro drifts from design.md, say "re-read design.md section X and fix".
3. Use vibe chat for small fixes, spec tasks for features.
4. Hooks will nag about secrets, tests, and copy; read their output instead of dismissing it.
5. When Kiro proposes a new library, ask whether the stack in `tech.md` already covers it.

Prompt starters:
- *"Implement task 5.1 exactly as in design.md. Pure functions only, injected `now`. Then write tests for every rule including the UNKNOWN case."*
- *"Implement task 8.4. Review the idempotency rules in tech.md first and show me how a double-click on Anchor is handled."*

## 6. Smoke test script (manual, ~10 min)
1. Create TX-1042 with the sample values; upload 3 files; paste activity-data JSON.
2. Run analysis. Expect flags per `sample-data/README.md`; ceiling `REQUEST_EVIDENCE`.
3. Log in as reviewer, choose `NEEDS_EVIDENCE` with a reason, anchor. Open the explorer link; confirm the `VerificationRecorded` event.
4. Click Anchor again → same tx, no new transaction.
5. Open `/passport/TX-1042` on a phone via the QR code. Check the caveat sentence and DEMO banner.
6. Call `/api/records/<hash>/verify` → `MATCH`. Edit a finding in the DB with the service role, call again → `MISMATCH`.
7. Repeat with TX-2001 → clean report, choose `VERIFIED`, anchor.
