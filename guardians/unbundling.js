
export async function auditUnbundling(billData, model) {
    const prompt = `
        You are the "Unbundling Guardian". Your job is to find fragmented charges that should be billed as a single panel.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}

        **INSTRUCTIONS**:
        **INSTRUCTIONS**:
        1. Look for multiple individual lab components (e.g., Glucose, Sodium, Potassium billed separately instead of a CMP).
        2. Look for procedure "parts" (e.g., billing for an incision and a closure separately for one surgery).
        3. **MODIFIER DEFENSE**: If a procedure has a -59 (Distinct Service) or an E/M code has a -25 (Separate E/M), verify if the Medical Record justifies the separation. If the modifier is present and correctly used, this is NOT unbundling.
        4. **NO CROSS-DEPARTMENT FLAGGING**: If the bill lists distinct services from different departments (e.g., 85025 CBC and 71046 CXR), this is NOT unbundling.
        5. **FINAL SANITY CHECK**: If the bill uses comprehensive panel codes (e.g. 80053, 85025) correctly, return passed: true.
        
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
