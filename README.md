# FairMedBill Mock Bill Generator (v2026.3 - "Auditor-Grade Realism")

A state-of-the-art medical bill simulation engine designed to produce high-fidelity, clinically authentic, and forensically "sabotaged" mock bills. Version 2026.3 introduces **Systemic Middleware Enforcement**, **Verified Institutional Data**, and **Federal Compliance Logic**.

## 🚀 Mission Statement
To produce Best Known Method (BKM) real-world mock bills that look 100% authentic to auditors but contain specific, detectable forensic errors. V2026.3 focuses on **"True BKM Status"**, ensuring that generated bills are indistinguishable from expert-vetted documents through strict temporal, geographic, and regulatory validation.

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

### 1. The V3.0 "Forensic" Generation Chain

- **Phase 0: The Facility Scout (Verified Database)**: Uses `verified_facilities.json` as a single source of truth for 100% real U.S. facilities, ensuring valid addresses, NPIs, and domains.
- **Phase 1: The Clinical Architect**: Generates the medical "Truth" with strict temporal synchronization (Admit/Discharge window enforcement).
- **Phase 2: The Medical Coder (Standardized)**:
    - **Nomenclature Lock**: Enforces official 2026 CPT/HCPCS descriptors via `standard_nomenclature.json`.
    - **Rev Code Integrity**: Strict mapping of Revenue Codes to CPTs (e.g., 99285 → Rev 0450).
- **Phase 3: The Financial Clerk (50/50 Logic)**:
    - **Uneven Pricing**: Generates realistic "Chargemaster" pricing (e.g., $154.23).
    - **Self-Pay Split**: Probabilistic toggle between Gross Charges (2.5x) and FMV (1.5x) for bill-level consistency.
- **Phase 4: The Publisher (Compliance Engine)**:
    - **Federal Mandates**: Automatically appends No Surprises Act (NSA) and Good Faith Estimate (GFE) disclosures for Self-Pay/Uninsured.
    - **Prompt Pay**: Adds conditional "20% Prompt Pay Discount" offers.
- **Phase 5: Presentation Layer (Realism)**:
    - **Real QR Codes**: Generates functional payment QR codes.
    - **Dynamic Layouts**: Supports distinct modes for Facility Statements, Professional Statements, UB-04, and CMS-1500.

### 2. Forensic Auditing Engine ("The 10 Guardians")
The Auditor uses a **Zero-Trust Parallel Loop** with deterministic calculation anchors.

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

## 🧪 Forensic Accuracy Standards (v2026.3)

| Component | Legacy Standard | v2026.3 Capstone Standard |
| :--- | :--- | :--- |
| **Institutional Data** | AI Hallucinations | **Get verified_facilities.json (Real Data)** |
| **Coding** | Approximate Descriptions | **Official AMA CPT Descriptors** |
| **Pricing** | Random Multipliers | **50/50 Split (Chargemaster vs FMV)** |
| **Compliance** | Static Text | **Dynamic NSA/GFE & Prompt Pay Logic** |
| **Barcodes** | ASCII Art | **Real Code128/QR via API** |

---

## 📂 Project Structure
- `/client`: React (Vite) Frontend.
- `/server.js`: The Multi-Agent Orchestrator and Infiltrator logic.
- `/server/data`:
    - `verified_facilities.json`: Single Source of Truth for facility data.
    - `standard_nomenclature.json`: Official CPT/HCPCS lookup.
- `/guardians`: The 10 specialized forensic audit modules.
    - `orchestrator.js`: Parallel execution engine.
- `/tests`: Unit testing suite for guardians (`test_guardians.js`).

---

## ⚖️ Pricing Methodology
Prices are generated using the formula: $P_{billed} = P_{MPFS} \times Payer\_Multiplier \times Geo\_Factor$.
- **Payer Multipliers**:
    - **Medicare**: 1.0x
    - **Commercial**: 2.0x
    - **Self-Pay**: **Bifurcated Logic** (50% chance of 2.5x Gross Charges / 50% chance of 1.5x FMV).
