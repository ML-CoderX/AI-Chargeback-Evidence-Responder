# Chargeback Evidence Responder

A defense-only chargeback evidence management tool built for the **Razorpay AI Risk Manager** hackathon.

## Quick start

```bash
npm install

# Add your Razorpay test-mode API keys (optional but recommended)
# Generate at: Razorpay Dashboard > Account & Settings > API Keys (Test Mode ON)
echo "RAZORPAY_KEY_ID=rzp_test_YOUR_KEY" >> .env.local
echo "RAZORPAY_KEY_SECRET=YOUR_SECRET" >> .env.local

npm run seed       # Creates 80 real Razorpay test orders + synthetic disputes
npm run dev        # Start at http://localhost:3000
```

> Without API keys, `npm run seed` still works — it falls back to synthetic order IDs.

On the Cases page, click **Score all** to compute win probabilities and completeness scores for every dispute. Then visit `/metrics` to see evaluation results on the 20 held-out disputes.

## Why this is defense-only

This system exists to help a human analyst prepare evidence for chargeback disputes. It is constrained by five hard boundaries that are enforced architecturally, not by policy alone:

1. **No auto-submission.** There is no function, API route, or button that submits a dispute response to any payment network or bank. The only state-changing action is "Mark reviewed," which flags the draft for a human to copy into their dispute portal manually.

2. **No evidence fabrication.** If a required evidence field is null, the system labels it explicitly as missing and explains why it matters. It never fills gaps with plausible guesses. The `scoreCompleteness` function counts non-null fields — it cannot invent data.

3. **No customer contact.** There is no email, SMS, webhook, or any outbound communication mechanism in the codebase.

4. **Full audit trail.** Every evidence retrieval, score computation, draft generation, and review action writes an append-only row to `audit_log`. There are no UPDATE or DELETE operations on this table.

5. **Real orders, simulated disputes.** Orders are created live via Razorpay's test-mode API (`order_*` IDs are real Razorpay test-mode objects, visible in the Razorpay Dashboard). Dispute events, evidence fields, and outcomes are simulated, because Razorpay's sandbox cannot self-trigger a chargeback — only the underlying order can be real. Payments are synthetic (`pay_sim_*`) because Razorpay requires client-side checkout for payment creation (PCI-DSS compliance). If no API keys are configured, the seed falls back to fully synthetic order IDs.

## Architecture

| Layer | Technology |
|:------|:-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS + CSS custom properties |
| Database | SQLite via sql.js (pure JS, no native build) |
| Scoring | Rule-weighted heuristic (7 signals, every weight documented) |

## Data model

- **80 synthetic disputes** across 4 reason codes: `fraudulent_transaction`, `product_not_received`, `product_not_as_described`, `duplicate_charge`
- **60 training / 20 held-out** (marked with `is_holdout` flag)
- **Ground-truth labels** (`actual_outcome`) computed from: strong auth + delivery proof → won
- **Deliberate missing evidence** (~30% null rate) for testing completeness scoring

## Scoring

The win-probability scorer uses explicit rule-weighted signals (not ML). Every weight is documented in `src/lib/scoring/engine.ts`:

- `three_ds_result === 'success'`: +25%
- `delivery_confirmed === 1`: +20%
- `avs_match === 1`: +10%
- `signature_captured === 1`: +10%
- `prior_dispute_count >= 3`: −10%

Evaluation on the 20 held-out disputes (threshold: 0.5):

| Metric | Value |
|:-------|:------|
| Precision | 80.0% |
| Recall | 44.4% |
| F1 | 57.1% |

## Pages

1. **Cases** (`/`) — Split view: case list (left) + case detail (right) with evidence bundle, response draft, and per-dispute audit trail
2. **Evaluation** (`/metrics`) — Precision, recall, F1, confusion matrix, false-positive/negative cost analysis, failure case explanation
3. **Audit trail** (`/audit`) — Global timeline of all system actions
