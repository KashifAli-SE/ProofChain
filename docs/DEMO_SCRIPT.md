# 2-Minute Demo Script

Pre-load: TX-1042 (analysed, `NEEDS_EVIDENCE`, anchored) and TX-2001 (analysed, not yet decided). Reviewer logged in. Etherscan tab and phone ready. Fallback screen recording on desktop.

**0:00–0:15 — Problem**
"Suppliers say 'recycled, low-carbon'. Buyers get PDFs and no way to tell what is actually supported. ProofChain AI checks the evidence behind each claim and keeps a tamper-evident record of the decision."

**0:15–0:50 — Flagged batch (TX-1042)**
Open the report. "Four agents. One reads documents with an LLM. Two are plain code: consistency rules and a carbon calculator. The last writes the narrative, but it cannot go above what the rules allow."
Point at: certificate expiry before production date; invoice 4,200 kg vs declared 5,000 kg; no composition report; electricity data missing so the carbon estimate is `INSUFFICIENT`. "Each finding names the document and rule that triggered it. Nothing is guessed — missing means missing."

**0:50–1:15 — Human decision and anchor**
"The AI recommends; a reviewer decides." Show the reviewer reason, click Anchor. Switch to Etherscan: the `VerificationRecorded` event. "Only a hash and status go on-chain. The documents stay private."

**1:15–1:40 — Passport and integrity**
Scan the QR on the phone. Read the caveat: "A blockchain record proves this decision was not altered after it was recorded. It does not prove the underlying claims are true." Show `/verify` → `MATCH`. If time: "If someone edits the stored findings, the hash no longer matches" (show the mismatch, prepared in advance).

**1:40–2:00 — Clean batch and close**
Open TX-2001: all checks pass, carbon `COMPLETE` with a label that factors are illustrative. "A pass means documents are consistent, not authentic — which is why a person signs off."
Close: "Evidence-linked findings, a deterministic ceiling the AI can't exceed, a human gate, and a record you can re-verify."

## Likely judge questions
| Question | Honest answer |
|---|---|
| Does blockchain make claims true? | No. It makes the recorded decision tamper-evident. The passport says so. |
| Can the AI be fooled by fake documents? | Yes. Consistency checks catch contradictions, not well-made forgeries. That is why a reviewer decides and why issuer-side verification is the next step. |
| Are the emission numbers real? | They use placeholder factors, labelled `ILLUSTRATIVE_FACTORS`. Replacing them with cited factors is a config change. |
| What stops the LLM making things up? | Nulls instead of guesses, verbatim quotes, schema validation, deterministic rules, citation-required report statements, and a ceiling it cannot exceed. |
| How is this different from existing tools? | Findings are evidence-linked and separated into verified-by-check / inconsistent / missing / unverified; the AI is capped by code; decisions are human-gated and anchored; the passport states its limits. Similar AI+blockchain ideas exist, so we don't claim novelty in the combination. |
| Who can write to the contract? | Allow-listed recorder addresses managed by the owner. Duplicates revert. |
| What would production need? | Real auth, cited emission factors, OCR, issuer checks, rate limits, a reviewed contract, and a reviewer-held signing key. |

## Do / don't
- Do say "flagged", "unsupported", "inconsistent". Don't say "fraud", "fake", or name a real company.
- Do show `DEMO DATA` on screen. Don't present simulated results as findings about real suppliers.
- Do mention Sepolia is a test network.
