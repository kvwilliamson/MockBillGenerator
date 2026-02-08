# FairMedBill Mock Bill Generator

A high-fidelity medical bill simulation engine designed to produce realistic, "messy," and clinically accurate mock bills for testing, auditing, and AI training.

## 🚀 Mission Statement
To produce Best Known Method (BKM) real-world mock bills based on user selections including **Medical Specialty**, **Payer Type**, **Error Scenario** (The "Gotcha"), and **Complexity**. 

The goal is to create bills that look 100% authentic to the human eye but contain specific, detectable forensic errors for evaluation.

---

## 🛠 Features

### 1. The V2.2 "Adversarial" Generation Chain
The engine uses an orchestration of 6 specialized agents to create a "locked" forensic data chain, where errors are intentionally buried using realistic clinical and financial "deception."

- **Agent #0: The Facility Scout (V2.2)**: Establishes the real-world grounding. It selects an existing U.S. facility and generates **Deterministic, Luhn-valid NPIs** and Federal EINs outside the LLM. This ensures 100% mathematical validity for identifier-based auditing.
- **Agent #1: The Clinical Architect (V2.2 - "The Source of Truth")**: Generates the medical case. Key V2.2 features:
    - **Primary Anatomical Side**: Mandates an explicit `primary_anatomical_side` metadata field (Left/Right/NA) to enable strict binary laterality checks by the Auditor.
    - **Forensic Vitals**: Generates structured JSON vitals (BP, SpO2, HR, RR, Temp) that act as the objective clinical evidence.
- **Agent #2: The Medical Coder (V2.2 - "The Infiltrator")**: Operates via **Conditional Prompting** to isolate instructions. It only receives the specific "villain logic" for the chosen error, preventing instruction leakage and ensuring CLEAN bills remain 100% clinically accurate.
    - **Clinical Gaslighting**: Misinterprets vitals (e.g., HR 90 -> "Tachycardia") to justify upcoding.
    - **Laterality Flip**: Overrides the Architect's metadata to code for the wrong side.
    - **Procedural Unbundling**: Fragments comprehensive panels into 8+ individual higher-cost line items.
- **Agent #3: The Financial Clerk (V2.2 - "The Math engine")**: Calculates prices using $P_{est} = P_{med} \times Y \times Z$. In V2.2, it introduces **"Process-Based Sabotage"** where it intentionally "forgets" to subtract insurance or adjustments in `BALANCE_MISMATCH` scenarios.
- **Agent #4: The Publisher (V2.2 - "The Forensic Documentarian")**: Assembles the final document. It is strictly forbidden from "fixing" errors, rendering broken math and anatomical mismatches exactly as provided.
- **Agent #8: The Pricing Actuary (V2.2)**: Provides the "External Standard." Dynamically looks up 2024 CMS Medicare (MPFS) rates to provide the FMV benchmarks used by the Auditor.

### 2. Forensic Auditing Engine ("The 9 Guardians - V2.2")
The V2.2 Auditor has been refactored for **Dashboard Compatibility** and "Red-Teamer" triangulation:

1.  **Standardized guardian_results**: The Auditor now returns a structured array of boolean flags (`passed: true/false`) and `evidence` strings, allowing for programmatic consumption by monitoring dashboards.
2.  **Vitals Cross-Check**: Directly cross-references billed E/M levels against `mrData.vitals` to debunk gaslifted severity claims.
3.  **Binary Anatomical Audit**: Performs a direct comparison between the bill and the Architect's `primary_anatomical_side` metadata.
4.  **Temporal & Math Guardians**: Calculates global period gaps and performs "Bottom-Up" mathematical recalculations to catch process failures.

---

## 📖 How to Use

### Running Locally
From the project root:
```bash
npm run dev
```
- **Backend**: [http://localhost:4000](http://localhost:4000)
- **Frontend**: [http://localhost:5173](http://localhost:5173)

### The Workflow
1.  **Selection**: Choose your Specialty (e.g., Cardiology), Payer (e.g., Self-Pay), and "Gotcha" (e.g., Upcoding).
2.  **Generate**: Click **Generate Mock Bill V2** for the highest realism.
3.  **Evidence**: Use the **Create Good Faith Estimate** and **Create Medical Record** buttons to generate supporting documentation.
4.  **Audit**: Click **Verify with Gemini** to run the forensic engine.
5.  **Harden**: Use the **Harden Generator** button to copy a forensic report of any logic gaps discovered.

---

### 🛡️ The Price Sentry Guardian (Technical Deep Dive)
The Price Sentry is the most advanced guardian in the engine, designed to detect predatory pricing and "Price Gouging" using a deterministic actuarial model rather than AI guesswork.

#### The $P_{est}$ Formula
The guardian calculates an **Estimated Fair Price ($P_{est}$)** for every line item using the following formula:
$$P_{est} = P_{med} \times Y \times Z$$

Where:
- **$P_{med}$**: The 2024 CMS Medicare Physician Fee Schedule (MPFS) National Average.
- **$Y$ (Payer Multiplier)**:
    - `Medicare`: 1.0x
    - `Insured (Commercial)`: 2.5x
    - `Self-Pay (Uninsured)`: 4.0x (Standard Hospital "Chargemaster" baseline)
- **$Z$ (Geographic Factor)**:
    - Base state factor (e.g., CA=1.15, NY=1.12, MS=0.90).
    - **+0.10** additive bonus for Major Metropolitan areas.

#### Flagging Logic
The Guardian triggers a **FAIL** status only if:
$$\text{Actual Price} > (P_{est} \times 1.5)$$
This 50% "Safety Buffer" prevents false positives for minor regional variations while aggressively flagging true outliers.

#### Parity Protection (The Global Cache)
To prevent "Ghost Errors" caused by AI randomness, the system uses a **Shared Medicare Cache**.
1. **Agent 3 (Financial)** looks up a code and caches the result.
2. **The Auditor** pulls the *exact same value* from the lookup table.
This creates a "Bulletproof Sync" where the auditor and biller always agree on the baseline math.

---

## ⚖️ Pricing Methodology (BKM Standards)
To prevent AI hallucinations, the generator follows these strict "Force-Multiplier" rules:
- **No Static Tables**: Benchmarks are fetched dynamically via Agent-orchestrated lookups to ensure coverage for all 23+ specialties.
- **AI-Only Lookup**: The AI is used *only* to identify the Medicare rate; it is strictly forbidden from calculating the final price.
- **Deterministic Code Calculation**: The final price on the bill is calculated in Javascript:
    - **Self-Pay Clinical Baseline**: `Medicare Rate × (1.30 + random(0.15))`
    - **Insured Baseline**: `Medicare Rate × (2.0 + random(0.8))`

---

## 📂 Project Structure
- `/client`: React frontend (Vite).
- `/server.js`: Express backend with Multi-Agent AI orchestration.
- `generate-classification-tests.mjs`: Script for batch generating document classification datasets.
- `generate-error-detection-bills.mjs`: Script for batch generating bills with specific errors.
