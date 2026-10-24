# Sample data (DEMO ONLY)

Every file is fictional and carries a `DEMO DATA` marker. None of it describes a real company, certificate, or test.
Create each batch with **Demo batch = on**.

## TX-1042 — the "should be flagged" batch
Batch form: product `Cotton crew-neck T-shirt`, supplier `Example Textile Ltd.`, production date `2026-03-15`,
claims `recycled_content = 100`, `low_carbon_manufacturing`, `certificate_provided`.
Upload: `certificate.txt`, `invoice.txt`, `declaration.txt`. Activity data: `activity-data.json`.

Expected findings (analysis date after 2026-03-15):
| Rule | Expected |
|---|---|
| CERTIFICATE_DATE_VALIDITY | FLAG (high) — expiry 2025-12-31 is before production 2026-03-15 |
| CERTIFICATE_NOT_EXPIRED_NOW | FLAG (medium) |
| SUPPLIER_NAME_MATCH | PASS |
| BATCH_ID_MATCH | PASS |
| RECYCLED_CONTENT_VALUE_MATCH | PASS (certificate states 100) — note: says nothing about authenticity |
| QUANTITY_CONSISTENCY | FLAG (medium) — 4,200 kg invoiced vs 5,000 kg declared (≈16%) |
| REQUIRED_EVIDENCE_PRESENT | FLAG (high) — no `composition_report`; no `energy_report` |
| ENERGY_DATA_PRESENT | FLAG (high) — electricity quantity missing |
Carbon: `INSUFFICIENT` (electricity missing). Ceiling: `REQUEST_EVIDENCE`.

## TX-2001 — the "clean" batch
Batch form: supplier `Sample Garments Pvt Ltd`, production date `2026-05-10`, claims `recycled_content = 100`, `low_carbon_manufacturing`, `certificate_provided`.
Upload: `certificate.txt`, `composition-report.txt`, `invoice.txt`, `declaration.txt`, `energy-report.txt`. Activity data: `activity-data.json`.

Expected: all rules PASS. Carbon `COMPLETE`, factors `ILLUSTRATIVE_FACTORS`:
electricity 12,000 × 0.45 = 5,400; diesel 150 × 2.68 = 402; total 5,802 kgCO2e; per unit (8,000) ≈ 0.73 kgCO2e.
Ceiling: `APPROVE`. Note that PASS here means "documents are consistent", not "documents are authentic", and the carbon numbers use placeholder factors.
