# FairMedBill Mock Bill Generator (V2.4 - "The Deceptive Era")

A state-of-the-art medical bill simulation engine designed to produce high-fidelity, clinically authentic, and forensically "sabotaged" mock bills. Version 2.4 introduces **Deceptive Math Sabotage**, **Deterministic Guardians**, and the **Arithmetic Meta-Audit**.

## 🚀 Mission Statement
To produce Best Known Method (BKM) real-world mock bills that look 100% authentic to auditors but contain specific, detectable forensic errors. V2.4 focuses on **Hiding the Needle**, ensuring that errors are no longer obvious "typos" but structural mismatches that require deep line-item analysis.

---

## ⚡ Quick Start

### Prerequisites
- Node.js (v18+)
- Google Gemini API Key (`GEMINI_API_KEY` in `.env`)

### Installation & Running
```bash
# 1. Install dependencies
npm install

# 2. Start the Full Stack (React Client + Node Server)
npm run dev

# 3. Open in Browser
# Client: http://localhost:5173
# Server: http://localhost:4000
```

### Generating Test Data
```bash
# Generate Classification Test Fixtures (EOB, MSN, Medical Records)
npm run generate:classification

# Generate Batch Error Detection Bills
npm run generate:error-detection
```

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
- **Phase 5: The Polish Agent (V2.4)**: Finalizes the bill assembly, ensuring visual consistency and generating the "Provider Note" based on the clinical truth.
- **Phase 6: Compliance Sentinel (The "Enforcer")**: Scans the final bill to ensure the requested "Gotcha" (Error Scenario) is present. If the AI was too "clean", the Sentinel forcibly injects the error (e.g., modifying dates for `IMPOSSIBLE_DATE` or adding duplicates).
- **Phase 7: Hard Constraint Enforcer**: A deterministic safety net that fixes logical inconsistencies (e.g., mismatched discharge dates) *UNLESS* the user specifically requested a related error (e.g., it permits date errors if `IMPOSSIBLE_DATE` was requested).

### 2. Forensic Auditing Engine ("The 10 Guardians - V2.4")
The V2.4 Auditor uses a **Zero-Trust Parallel Loop** with deterministic calculation anchors.

1.  **🧮 Math Guardian**: Deterministic JS Summation. Checks for $0.05 line discrepancies and poisoned subtotals.
2.  **⚖️ Judge (Meta-Audit)**: Evaluates "Scenario Fidelity". If a bill claims to have a Math Error but the Math Guardian passes, the Judge flags a "Logic Gap".
3.  **💊 Price Sentry**: Checks Unit Prices against Medicare/Commercial benchmarks.
4.  **📈 Upcoding Guardian**: Validates clinical necessity (e.g., Vitals vs. CPT Level).
5.  **🏷️ Modifier Sentinel**: Enforces `-25`, `-26`, `-TC`, and `-50` rules.
6.  **📦 Unbundling Guardian**: Detects fragmented codes (e.g., Panel + Component).
7.  **🔄 Duplicate Guardian**: Checks for duplicate line items on the same DOS.
8.  **⏱️ Global Period Guardian**: Checks for post-op billing violations.
9.  **🏗️ Quantity Guardian**: Enforces Medically Unlikely Edits (MUE) and quantity limits.
10. **📝 GFE/Review Guardian**: Validates against Good Faith Estimates and performs a final "Common Sense" review.

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
- `/server.js`: The Multi-Agent Orchestrator and Infiltrator logic.
- `/guardians`: The 10 specialized forensic audit modules.
    - `orchestrator.js`: Parallel execution engine.
    - `math.js`, `upcoding.js`, etc.: Individual guardian logic.
- `/tests`: Unit testing suite for guardians (`test_guardians.js`).
- `generate-classification-tests.mjs`: Generator for OCR training fixtures (EOB, MSN, etc.).
- `generate-error-detection-bills.mjs`: Generator for batch error testing.

---

## ⚖️ Pricing Methodology
Prices are generated using the formula: $P_{billed} = P_{MPFS} \times Payer\_Multiplier \times Geo\_Factor$.
- **Payer Multipliers**:
    - **Medicare**: 1.0x
    - **Commercial**: 2.0x
    - **Self-Pay**: 2.5x
- **Modifier Adjustments**:
    - `-26` (Professional): 40% of standard rate.
    - `-TC` (Technical): 60% of standard rate.
    - `-50` (Bilateral): 150% of standard rate.
