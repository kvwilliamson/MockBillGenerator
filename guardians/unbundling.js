
export async function auditUnbundling(billData, model) {
    const prompt = `
        You are the "Unbundling Guardian". Your job is to find fragmented charges that should be billed as a single panel.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}

        **INSTRUCTIONS**:
        1. **Lab Panel Knowledge**: 
           - **BMP (80048)**: Glucose, Calcium, Sodium, Potassium, CO2, Chloride, BUN, Creatinine.
           - **CMP (80053)**: All BMP + Albumin, Total Protein, ALP, AST, ALT, Bilirubin.
           - **CBC (85025)**: WBC, RBC, Hgb, Hct, Platelets, Differential. (CBC is NOT part of a CMP/BMP).
           - **Troponin (84450)**: Is a STANDALONE cardiac enzyme. It is NOT part of a standard CMP/BMP.
        2. ** Fragmentation Check**: Look for individual BMP/CMP components billed separately.
        3. **Procedure Parts**: Look for "incision" and "closure" billed separately for one surgery.
        4. **MODIFIER DEFENSE**: If a procedure has a -59 (Distinct Service) or an E/M code has a -25 (Separate E/M), verify if the Medical Record justifies the separation. If the modifier is present and correctly used, this is NOT unbundling.
        5. **NO CROSS-DEPARTMENT FLAGGING**: If the bill lists distinct services from different departments (e.g., Labs vs Radiology), this is NOT unbundling.
        6. **FINAL SANITY CHECK**: If the bill uses comprehensive panel codes (e.g. 80053) correctly, return passed: true.
        
        **RETURN JSON**:
        {
            "guardian": "Unbundling",
            "passed": false,
            "status": "FAIL",
            "evidence": "Multiple individual codes billed instead of panel [CPT].",
            "failure_details": {
                "type": "Unbundling / Fragmentation",
                "explanation": "List the fragmented codes found and explain which single comprehensive code they should have been bundled into per CPT guidelines.",
                "severity": "Medium",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }
        (NOTE: If passed, set passed: true, status: "PASS", evidence: "No fragmented charges", and failure_details: null).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
