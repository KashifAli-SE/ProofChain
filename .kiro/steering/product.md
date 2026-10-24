---
inclusion: always
---

# ProofChain AI — Product Steering

## What we are building
A web app that helps a buyer judge a supplier's sustainability claims. A supplier uploads documents, four logical agents analyse them, a human reviewer decides, and the decision is anchored as a hash on the Ethereum **Sepolia** testnet. A public QR-linked "product passport" shows the result.

## Non-negotiable honesty rules
These override any convenience. Do not weaken them in code, copy, or UI text.

1. **Blockchain proves integrity, not truth.** On-chain data shows a record was not silently changed. It never proves a supplier's claim is true. The passport page must say this in plain words.
2. **AI recommends, a human decides.** No on-chain write may happen without a stored reviewer decision. The AI recommendation is stored separately from the human decision.
3. **No invented data.** Agents and calculators must return `null`/`UNKNOWN` for anything not in the evidence. Never fabricate dates, quantities, certificate IDs, or emission factors.
4. **`VERIFIED` is narrow.** It means "a reviewer approved the declared claims against the supplied evidence." It never means "this product is sustainable."
5. **Demo data is labelled.** Every sample document and every seeded batch carries a visible `DEMO DATA` marker. Never present simulated results as real-world findings about a real company.
6. **Documents stay private.** Supplier files live in a private bucket. Only hashes and limited metadata go on-chain or to the public passport.

## Users
Procurement manager, supplier, reviewer, public buyer scanning a QR code, hackathon judge.

## Scope (24-hour hackathon)
- One industry: textiles. One headline flow: create batch → upload evidence → analyse → review → anchor → passport.
- Out of scope: factory inspections, certificate-issuer lookups, supplier registry, tokens/NFTs, enterprise permissions, production carbon accounting.

## Tone of UI copy
Plain, specific, evidence-first. Prefer "No composition report was provided" over "Claim is false". Separate four states everywhere: **verified fact**, **inconsistency**, **missing evidence**, **unverified claim**.
