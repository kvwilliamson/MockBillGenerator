# Guardian Replication Manual: FairMedBill V2 Core Engine (BKM)

This document provides the exact technical specifications for the 10 "Guardians" (detectors) used in the FairMedBill V2 Core Engine. This manual is designed for developers to replicate the detection logic exactly in a mock bill generator or testing environment.

---

## 🏗️ Architecture Overview
- **Engine Type**: Hybrid (Deterministic JS + AI Verification).
- **AI Model**: `gemini-2.5-flash-lite` (Default for fast auditing/classification).
- **Execution**: Client-Side (Frontend) preferred for privacy and speed.

---

## 1. Duplicate Guardian (`duplicateAnalyzer.js`)
Detects redundant charges with high precision.

### Logic Specs
1.  **Exact Match**: Flag if `CPT_CODE`, `SERVICE_DATE`, and `TOTAL_AMOUNT` are identical across two or more lines.
2.  **Proportional Match**: If `CODE` and `DATE` match, but `TOTAL_AMOUNT` is a multiple (e.g., $100 vs $200), flag as a **Quantity Error** first.
3.  **Price Mismatch (New BKM)**: If `CODE` and `DATE` match but `TOTAL_AMOUNT` is significantly different (e.g., $17 and $62), flag as `DUPLICATE_PRICE_VARIANCE`.
    - **Confidence**: `investigate` (Likely duplicated but needs human review).
4.  **Exceptions**: Ignore common "Unit" codes like `94760` (Pulse Ox) if they appear once per department.

---

## 2. Unbundling Guardian (`unbundlingAnalyzer.js`)
Detects "fragmentation" where a single service is broken into parts to overcharge.

### Deterministic Checks
- **NCCI Edits**: Column 1 (Comprehensive) vs Column 2 (Component). 
  - *Example*: ER Visit (`99285`) bundles `36415` (Venipuncture).
- **Revenue Code Bundles**: Specific departments where certain CPTs are "overhead."
  - *Rev 0450 (ER)*: Bundles `94760`, `94761`, `36415`, `93000`.
  - *Rev 0300 (Lab)*: Bundles `36415` (Venipuncture).
- **Panel Consolidation**: If 3+ components of a lab panel (e.g., BMP `80048`) are billed separately, flag as "Fragmentation."

### Deterministic Checks (Hard-Stop Rules)
To match FairMedBill's accuracy, implement the following static mapping tables:

#### A. NCCI Edit Table (Sample)
| Comprehensive Code | Bundled Component(s) |
| :--- | :--- |
| **99281-99285** (ER) | 94760, 94761 (Pulse Ox), 36415 (Blood Draw) |
| **99291** (Critical Care) | 94002, 94003 (Ventilation), 93000 (ECG) |
| **80048** (BMP Panel) | 99000 (Handling Fee), 36415 (Venipuncture) |

#### B. Revenue Code Bundling
Certain codes are considered "Facility Overhead" depending on the department (Rev Code).
- **Rev 0300 (Laboratory)**: Always bundle `36415`.
- **Rev 0450 (ER)**: Always bundle `94760`, `94761`, `36415`, `93000`.
- **Rev 0360 (Operating Room)**: Always bundle `A4550` (Surgical Trays).

#### C. Panel Consolidation Map
Flag as "Fragmentation" if the count of components exceeds the **Threshold**.
- **CMP (80053)**: Components: 82310, 82374, 82435, 82565, 82947, 84075... (Threshold: 4)
- **Lipid (80061)**: Components: 82465, 83718, 84478, 83721... (Threshold: 3)

### AI Verification (Gemini)
If a modifier (e.g., `-59`, `-25`) is present on a bundled code:
1.  Check if `Diagnosis` and `NPI` are the same for both items.
2.  If yes, the modifier is "suspicious."
3.  **API Call Configuration**:
    - **Model**: `gemini-2.5-flash-lite`
    - **Endpoint**: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=KEY`
    - **System Prompt**: 
      ```text
      You are a certified medical coder and auditor. Review the following code pairs. 
      The system has flagged them as potential "Unbundling" because they share a diagnosis and provider, 
      but a Modifier was applied. Tell me if the Modifier is CLINICALLY JUSTIFIED based on 
      the descriptions (e.g., distinct anatomical site, separate encounter).
      ```
    - **Input Format**: JSON List of `{ parent: { code, desc }, child: { code, desc, modifier }, diagnosis }`
    - **Expected Output**:
      ```json
      {
        "results": [
          { "id": number, "is_justified": boolean, "reasoning": "short explanation" }
        ]
      }
      ```

---

## 3. Upcoding Guardian (`upcodingAnalyzer.js`)
Detects level-of-service inflation.

### Signature Patterns
- **Severity Mismatch**: Level 5 Visit (`99285`) mapped to Low-Complexity Dx (e.g., `R05.9` Cough).
- **Resource Volume Mismatch**: Level 5 charged, but `Diagnostic Volume` (Labs + Imaging count) is $\le 1$.
- **Modifier -25 Abuse**: Visit + Procedure on the same day with no distinct symptoms or separate evaluation notes.
- **Systemic Skulking**: 100% of visits on the bill are Level 5 (Statistically impossible clumping).

---

## 4. Price Sentry (`benchmarkComparator.js`)
Audits bill prices against Medicare fair-market baselines.

### The Multiplier Formula
**Threshold = (Base_Multiplier * Medicare_Rate) * 3.0 (Sensitivity)**

| Payer Mode | Base Multiplier | Major Outlier | Extreme Outlier |
| :--- | :--- | :--- | :--- |
| **Medicare** | 1.0x | 1.2x | 2.0x |
| **Commercial** | 2.0x | 2.5x | 4.0x |
| **Self-Pay** | 2.5x | 3.0x | 5.0x |

### AI Benchmark Lookup
Use Gemini to fetch real-time Medicare rates if the database is unavailable.
- **API Specification**:
  - **Prompt**: 
    ```text
    You are a medical billing data expert. For the following CPT/HCPCS codes in [providerState], 
    provide the standard Medicare reimbursement rate (Professional Fee).
    Return JSON only in this format:
    {
      "CPT_CODE": {
        "medicare_rate": number,
        "source_note": "Short explanation of the rate (e.g. CMS Physician Fee Schedule)"
      }
    }
    ```
  - **Temperature**: `0` (Deterministic results)
  - **TopP**: `0.1`

---

## 5. Math Guardian (`mathValidator.js`)
Automated arithmetic integrity check.

### Three-Point Check
1.  **Line Math**: `Quantity * UnitPrice` must equal `TotalAmount` (Tolerance: $0.05).
2.  **Missing Price**: Positive `TotalAmount` but `UnitPrice` is $0.00.
3.  **Global Balance**: `Sum(LineItems) - Adjustments - Payments` must equal `Grand Total` (Tolerance: $1.00).

---

## 6. Date Guardian (`dateValidator.js`)
Validates temporal logic of the medical encounter.

### Logic Specs
- **Admission Window**: Charges cannot occur before the `Admission Date` (Allow 3-day pre-op for labs/ECG only).
- **Discharge Gate**: Charges cannot occur after `Discharge Date` (Allow discharge management codes `99238`).
- **Billing Velocity**: Complex bills (8+ items) produced in $< 7$ days from service are flagged for "Impossible Turnaround."
- **Future Dates**: Flag any date $> \text{Today}$.

---

## 7. Quantity Guardian (`quantityValidator.js`)
Detects physically or clinically impossible volumes.

### Logic Specs
- **Initial Service Limit**: Quantity $> 1$ for one-time events (ER visits, Initial Hospital Care).
- **Time Limits**: Anesthesia or Critical Care $> 1,440$ minutes (24 hours) in a single day.
- **Implant Heuristic**: Quantity $> 20$ for hardware/screws/implants.
- **Generic Outlier**: Quantity $> 20$ AND Unit Price $> \$5.00$ (e.g., billing for 50 boxes of gauze).

---

## 8. GFE Guardian (`gfeComparator.js`)
Protects Self-Pay patients under the No Surprises Act.

### Logic Specs
- **Line Mismatch**: Flag if billed price $>$ GFE price ($+0.01$ tolerance).
- **Federal Threshold**: If `Total Bill` $>$ `Total GFE` $+ \$400$, flag as **Dispute Eligible** (NSA violation).

---

## 9. Review Guardian (Medical Record) (`medicalRecordComparator.js`)
Full clinical audit of the bill vs. the medical record documentation.

### AI Auditor (Gemini)
- **Model**: `gemini-2.5-flash-lite`
- **Full System Prompt**:
```text
### SYSTEM ROLE
You are an expert Clinical Auditor and Medical Coding Auditor. Your specialty is verifying that medical bill charges are fully supported by clinical documentation in the Medical Record.

### OBJECTIVE
Analyze an Itemized Bill (JSON) and a Medical Record (Text). Identify discrepancies where the bill includes items or levels of service not supported by the documentation.

### ANALYSIS CATEGORIES & OVERCHARGE RULES
1. MISSING_DOC: Items billed that have no mention or support in the medical record. 
    - Overcharge Amount: The FULL billed amount.
2. UPCODING: The billed code represents a higher complexity than what is documented (e.g. Level 5 ER Visit billed for a minor issue).
    - Requirement: You MUST suggest the more appropriate CPT code and an estimated fair price for that lower-level service.
    - Overcharge Amount: Billed Amount minus the Estimated Fair Price.
3. UNNECESSARY_CHARGE: Items documented but clinically unnecessary for the diagnosed condition.
    - Overcharge Amount: The FULL billed amount.
4. LOGIC_ERROR: Billed items that don't follow logically from the reason for visit.
    - Overcharge Amount: The FULL billed amount.

### OUTPUT FORMAT
Return ONLY a valid JSON object. Do not include markdown separators.
{
  "flagged_items": [
    {
      "line_id": number,
      "cpt_code": "string",
      "issue_type": "MISSING_DOC | UPCODING | UNNECESSARY_CHARGE | LOGIC_ERROR",
      "reasoning": "string",
      "suggested_cpt": "string",
      "suggested_amount": number,
      "overcharge_amount": number,
      "confidence_score": number
    }
  ]
}
```

---

## 10. Missing Data Guardian (Extraction Layer)
Prevents bill processing with incomplete information.
- **Rules**: 
  - TOB 131 (Inpatient) requires `Admission` and `Discharge` dates.
  - Positive totals require a `HCPCS` or `CPT` code (otherwise it's a "Ghost Charge").
