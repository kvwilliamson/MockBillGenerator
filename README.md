# FairMedBill Mock Bill Generator (V2.4 - "The Deceptive Era")

A state-of-the-art medical bill simulation engine designed to produce high-fidelity, clinically authentic, and forensically "sabotaged" mock bills. Version 2.4 introduces **Deceptive Math Sabotage**, **Deterministic Guardians**, and the **Arithmetic Meta-Audit**.

## 🚀 Mission Statement
To produce Best Known Method (BKM) real-world mock bills that look 100% authentic to auditors but contain specific, detectable forensic errors. V2.4 focuses on **Hiding the Needle**, ensuring that errors are no longer obvious "typos" but structural mismatches that require deep line-item analysis.

---

## 🛠 Features

### 1. The V2.4 "Forensic" Generation Chain

- **Phase 0: The Facility Scout (V2.4)**: Establishes real-world grounding. Selects U.S. facilities and generates **Deterministic, Luhn-valid identifiers** (NPI/EIN) outside the LLM.
- **Phase 1: The Clinical Architect (V2.4)**: Generates the medical "Truth." 
- **Phase 2: The Medical Coder (V2.4 - "The Infiltrator")**:
    - **Complexity Lock (STRICT)**: Maps complexity levels (Low/Mod/High) to specific CPT ranges (Level 2-3 vs Level 4-5) to prevent code-drift.
    - **Modifier Edition**: Automatically appends required modifiers (`-25`, `-RT`, `-LT`, `-50`) to "Clean" bills.
- **Phase 3: The Financial Clerk (V2.4 - "The Aggregation Trap")**:
    - **Hidden Math Sabotage**: In `MATH_ERROR` scenarios, the generator poisons the **Subtotal** itself. 
    - **Consistent Deception**: Subsequent calculations (Adjustments/Grand Total) are derived from the *bad subtotal*, making the bottom-line math look superficially correct while the sum of line items is secretly invalid.
- **Phase 4: The Publisher (V2.4 - "Administrative Guard")**:
    - **Fiscal Year Alignment**: Calculates Patient DOB based on admission year (2026) with an off-by-one guard to match stated age exactly.
- **Phase 5: Compliance Sentinel**: Appends regulatory disclaimers and identifies administrative typos.

### 2. Forensic Auditing Engine ("The 10 Guardians - V2.4")
The V2.4 Auditor uses a **Zero-Trust Parallel Loop** with deterministic calculation anchors.

1.  **Agent #7: Deterministic Math Guardian**: No longer uses AI for arithmetic. Performs a **Bottom-Up JS Summation** of every line item to detect $0.01 discrepancies or poisoned subtotals.
2.  **Agent #10: The Simulation Judge (V2.4)**: 
    - **Arithmetic Meta-Audit**: Perform its own hard math check on the raw data. If a guardian claims "Totals match" on a poisoned subtotal, the Judge issues a **"Logic Gap Detected"** and drops the fidelity score to 0.
    - **Strict Scenario Mapping**: Error detection *must* match the intended scenario (e.g., catching a modifier error during a Math test is a Logic Gap).
3.  **Deterministic Price Sentry**: Pricing logic is handled by Javascript. Triggered only if math exceeds Benchmark + 20%.
4.  **Upcoding Guardian (Clinical Anchors)**: Uses hard thresholds (e.g., hypoxia < 90% or pain 9/10) to validate high-intensity billing.
5.  **Modifier Sentinel**: Enforces "Non-Negotiable" CPT rules. Checks for the -25 rule (E/M + Procedure) and Laterality mandates.

---

## 🧪 Forensic Accuracy Standards (V2.4)

| Component | V2.3 Standard | V2.4 Standard (Current) |
| :--- | :--- | :--- |
| **Math Sabotage** | Bottom-line Mismatch | **Aggregation Trap (Poisoned Subtotal)** |
| **Math Auditing** | AI Arithmetic (Unreliable) | **Deterministic JS Summation** |
| **Age Logic** | Variable | **Fiscal-Year Dynamic Subtracting** |
| **Judge Verdict** | Scenario Based | **Arithmetic Meta-Audit + Hallucination Check** |
| **Guardians** | AI Prompt-Based | **Hybrid (JS Decision + AI Explanation)** |

---

## 📂 Project Structure
- `/client`: React (Vite) Frontend.
- `/guardians`: The 10 specialized forensic audit modules.
- `/server.js`: The Multi-Agent Orchestrator and Infiltrator logic.
- `.agent/workflows`: Developer automation and testing clusters.

---

## ⚖️ Pricing Methodology
Prices are generated using the formula: $P_{billed} = P_{MPFS} \times Payer\_Multiplier \times Geo\_Factor$.
- **Modifier Adjustments**:
    - `-26` (Professional): 40% of standard rate.
    - `-TC` (Technical): 60% of standard rate.
    - `-50` (Bilateral): 150% of standard rate.
