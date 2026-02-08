# FairMedBill Mock Bill Generator (V2.3 - "Forensic Edition")

A state-of-the-art medical bill simulation engine designed to produce high-fidelity, clinically authentic, and forensically "sabotaged" mock bills. Version 2.3 introduces the **Modifier Sentinel**, **Strict Complexity Locking**, and the **Deterministic Simulation Judge**.

## 🚀 Mission Statement
To produce Best Known Method (BKM) real-world mock bills that look 100% authentic to auditors but contain specific, detectable forensic errors. V2.3 focuses on **Isolation of Intent**, ensuring that if you test for "Upcoding," the bill doesn't fail for "Missing Modifiers" by accident.

---

## 🛠 Features

### 1. The V2.3 "Forensic" Generation Chain
The engine uses a 6-phase lifecycle to create a "locked" forensic data chain, where errors are intentionally buried using realistic clinical and financial deception.

- **Phase 0: The Facility Scout (V2.3)**: Establishes the real-world grounding. Selects U.S. facilities and generates **Deterministic, Luhn-valid identifiers** (NPI/EIN) outside the LLM.
- **Phase 1: The Clinical Architect (V2.3)**: Generates the medical "Truth." 
    - **Vitals Calibration**: Produces objective evidence (BP, SpO2, HR, RR) used as anchors for auditing.
    - **Setting-Awareness**: Distinguishes between Clinic (Rev Code 0510) and ER (Rev Code 0450) environments.
- **Phase 2: The Medical Coder (V2.3 - "The Infiltrator")**:
    - **Complexity Lock (STRICT)**: Maps complexity levels (Low/Mod/High) to specific CPT ranges (Level 2-3 vs Level 4-5) to prevent code-drift.
    - **Modifier Edition**: Automatically appends required modifiers (`-25`, `-RT`, `-LT`, `-50`) to "Clean" bills while selectively withholding them in "Sabotage" scenarios.
    - **Selective Sabotage**: Receives a single "Villain Logic" (e.g., Unbundling) and is instructed to maintain perfect administrative accuracy elsewhere.
- **Phase 3: The Financial Clerk (V2.3 - "Pricing Engine")**:
    - **Modifier Pricing Multipliers**: Automatically adjusts pricing for Professional Components (`-26`: 40%), Technical Components (`-TC`: 60%), and Bilateral Procedures (`-50`: 150%).
    - **Deterministic Math**: Calculates totals in Javascript to prevent AI-generated math errors (unless "Math Error" is the intended scenario).
- **Phase 4: The Publisher (V2.3 - "Administrative Guard")**:
    - **Fiscal Year Alignment**: Calculates Patient DOB based on admission year (2026) with an off-by-one guard to match stated age.
    - **Placeholder Purge**: Strictly forbids `MM/DD/YYYY` or dummy phone numbers in the final artifact.
- **Phase 5: Compliance Sentinel**: Appends regulatory disclaimers (No Surprises Act) and identifies administrative typos for secondary auditing.

### 2. Forensic Auditing Engine ("The 10 Guardians - V2.3")
The V2.3 Auditor uses a **Zero-Trust Parallel Loop** to verify the bill without knowing the intended error.

1.  **Agent #9: The Modifier Sentinel (NEW)**: Enforces "Non-Negotiable" CPT rules. Checks for the -25 rule (E/M + Procedure) and Laterality mandates.
2.  **Agent #10: The Simulation Judge (V2.3)**: 
    - **Strict Scenario Mapping**: Only counts a "PASS" for the generator if the *specific* intended error was the one caught. 
    - **Hallucination Detection**: Compares Guardian findings against raw Bill Data. If a guardian red-flags a code that is actually correct, the Judge issues a **"Hallucination Detected"** verdict.
3.  **Deterministic Price Sentry**: math logic is handled by Javascript. A price is only flagged as "Gouging" if it mathematically exceeds Benchmark + 20%.
4.  **Upcoding Guardian (Clinical Anchors)**: Uses hard thresholds (e.g., hypoxia < 90% or pain 9/10) to validate high-intensity billing.
5.  **Unbundling Guardian (Panel Dictionary)**: Contains explicit knowledge of CMP, BMP, and CBC panels to prevent "Lazy Fails" on standalone cardiac enzymes.
6.  **Record Match (Binary Laterality)**: Strictly compares `-RT/-LT` modifiers against the Architect's anatomical truth.

---

## 📖 How to Use

### Running Locally
From the project root:
```bash
npm run dev
```
- **Backend API**: `http://localhost:4000`
- **Frontend UI**: `http://localhost:5173`

### The Forensic Workflow
1.  **Configure**: Select Specialty, Payer, Complexity, and the "Gotcha" (Error Scenario).
2.  **Generate**: Execute **Generate Mock Bill V2**. Review the internal "Truth" in the debug logs.
3.  **Audit**: Run **Verify with Gemini**. 
4.  **Evaluate**: Review the **Simulation Quality Report**. Look for the `Fidelity Score` and the `Judge's Verdict` to see if the auditor was tricked or if it correctly identified the sabotage.

---

## 🧪 Forensic Accuracy Standards (V2.3)

| Component | V2.2 Standard | V2.3 Standard (Current) |
| :--- | :--- | :--- |
| **Administrative** | Hardcoded DOBs | Fiscal-Year Aligned Dynamic DOB |
| **Modifiers** | Optional | Context-Aware Mandatory (-25, -RT, -LT) |
| **Pricing** | Multiplier-Based | Multiplier + Component-Aware (-26/-TC) |
| **Upcoding** | Vague Complexity | Clinical Anchor Point Validation |
| **Auditing** | 6 Guardians | 10 Guardians + Judge Meta-Audit |
| **Hallucinations** | Passively accepted | Hard-blocked by Judge Sanity Check |

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
