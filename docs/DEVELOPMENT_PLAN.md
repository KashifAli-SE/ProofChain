# Development Plan — 24-hour solo sprint

Start the clock when you begin hour 0. Targets are cumulative; checkpoints are hard gates.

## Timeline
| Hours | Focus | Tasks (tasks.md) | Gate at end |
|---|---|---|---|
| 0:00–0:45 | Accounts, wallet, faucet request, Kiro setup, bootstrap | 1 | `npm run dev` shows a page; faucet request sent |
| 0:45–1:30 | Supabase schema, server client, audit writer | 2 | Append-only trigger rejects UPDATE |
| 1:30–3:30 | Batches, upload, hashing, basic UI | 3 | TX-1042 with 3 hashed files visible |
| 3:30–6:00 | PDF/text extraction, Gemini, Agent 1 | 4 | Certificate extracted with correct dates, nulls for gaps |
| 6:00–9:00 | Cross-checker, climate analyst, status policy + tests | 5 | `vitest` green |
| 9:00–11:30 | Auditor, orchestrator, analyze/report endpoints, report UI | 6 | TX-1042 flags match README; TX-2001 clean |
| 11:30–14:00 | Contract tests, Sepolia deploy | 7 | Contract visible on Etherscan |
| 14:00–17:00 | Canonical hash, reviewer auth, review, anchor | 8 | One anchor tx; double-click makes none |
| 17:00–19:30 | Passport, QR, verify | 9 | Phone scan works; MATCH/MISMATCH demonstrated |
| 19:30–22:00 | Hardening, deploy, fallback recording | 10 | Clean-DB end-to-end pass |
| 22:00–24:00 | Rehearsal, freeze | 11 | Two timed rehearsals |

Sleep plan: take a 90-minute break after the 9:00 gate or the 14:00 gate; debugging tired costs more than the break.

## Why this order
Deterministic rules and the contract are the parts that must be correct and testable; the LLM part is the riskiest in time and cost, so it is isolated behind schemas and a fallback. The chain work starts mid-sprint so faucet/RPC delays (requested at hour 0) do not block you.

## Risk register
| Risk | Likelihood | Impact | Response |
|---|---|---|---|
| Faucet slow/empty | Medium | Blocks deploy | Request at hour 0 from two faucets; develop against local Hardhat node meanwhile |
| Gemini JSON drift or quota | Medium | Blocks Agent 1/4 | zod + one retry; Auditor fallback report; cache extraction by file hash |
| PDF extraction returns nothing | Medium | Missing findings | `NO_TEXT` path; demo with text files plus one text PDF |
| Kiro generates sprawling code | High | Rework | One task at a time; steering rules; review diffs |
| Next/Hardhat TS config clash | Medium | Lost 30+ min | Use `tsconfig.hardhat.json` and `TS_NODE_PROJECT` scripts |
| Vercel timeout on analysis | Low–Med | Demo fails live | `maxDuration = 60`; keep demo batches small; fallback recording; local run |
| Over-claiming in demo | Medium | Credibility | Follow demo script wording; show the caveat on screen |
| Scope creep | High | Missed deadline | Cut line below |

## Cut line
Drop in this order: Etherscan verify → `/verify` page UI (keep API) → activity form (seed JSON) → QUANTITY_CONSISTENCY and SUPPLIER_NAME_MATCH → Vercel deploy.
Never drop: human gate, Sepolia anchor, caveat copy, `UNKNOWN` handling, demo labels.

## Definition of done
- [ ] `npm test` and `npm run chain:test` pass
- [ ] TX-1042: expected flags, anchored once on Sepolia, verify = `MATCH`
- [ ] TX-2001: clean report, `VERIFIED` decision, anchored
- [ ] Passport opens from a phone QR scan with caveat + demo banner
- [ ] No secret in client bundle, repo, or logs (`git grep` the key prefix)
- [ ] 2-minute demo rehearsed twice; fallback recording saved

## Quality gates per feature
For each task: (1) code, (2) test or manual check from the checkpoint, (3) commit. Do not stack unverified work.

## After the hackathon (not for the 24 h)
Replace placeholder emission factors with cited values; real authentication; OCR for scans; issuer-side certificate checks; multi-tier supplier links; rate limiting; move anchoring to a reviewer-held wallet; consider an audited contract before any non-test network.
