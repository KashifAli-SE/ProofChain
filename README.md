# ProofChain AI

Evidence-based sustainability verification for textile batches. Upload supplier documents, run four agents (LLM extraction, deterministic checks, deterministic carbon maths, capped LLM audit), have a human decide, anchor the decision hash on Ethereum **Sepolia**, and publish a QR passport that states its own limits.

> A blockchain record proves a decision was not altered after it was recorded. It does not prove the underlying claims are true. All sample data is fictional and labelled `DEMO DATA`.

## What is in this pack
| Path | Purpose |
|---|---|
| `.kiro/steering/` | Always-on rules for Kiro: product honesty, tech stack, repo layout |
| `.kiro/specs/proofchain-ai/` | `requirements.md` (EARS), `design.md`, `tasks.md` — run these in Kiro |
| `.kiro/hooks/` | Test-on-change, secret guard, honesty-copy guard |
| `docs/SRS.md` | Full software requirements specification (v1.1, completes the earlier draft) |
| `docs/AGENT_SPECS.md` | Prompts and algorithms for all four agents |
| `docs/DEVELOPMENT_PLAN.md` | 24-hour timeline, gates, risks, cut line |
| `docs/IMPLEMENTATION_PLAN.md` | Setup commands, skeletons, smoke test, Kiro workflow |
| `docs/DEMO_SCRIPT.md` | 2-minute pitch and judge Q&A |
| `contracts/`, `test/`, `scripts/`, `hardhat.config.ts` | Registry contract, tests, Sepolia deploy |
| `supabase/schema.sql` | Database, append-only triggers, private bucket |
| `config/` | Evidence requirements, **placeholder** emission factors |
| `sample-data/` | Two demo batches (TX-1042 flagged, TX-2001 clean) with expected results |
| `.env.example` | All environment variable names |

## Start
1. Read `docs/IMPLEMENTATION_PLAN.md` §1 and do the waiting-time setup first (wallet, faucet, RPC, Supabase, Gemini).
2. Open the folder in Kiro; confirm steering, spec and hooks load.
3. Run `.kiro/specs/proofchain-ai/tasks.md` one task at a time.

## Known limits (by design)
Placeholder emission factors; demo-grade reviewer auth; text-based PDFs only; no issuer-side certificate verification; Sepolia test network only.
