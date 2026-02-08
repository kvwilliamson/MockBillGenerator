
export async function auditUnbundling(billData, model) {
    const prompt = `
        You are the "Unbundling Guardian". Your job is to find fragmented charges that should be billed as a single panel.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}

        **INSTRUCTIONS**:
        1. Look for multiple individual lab components (e.g., Glucose, Sodium, Potassium) or procedure parts billed separately.
        2. Determine if these should have been "bundled" into a single CPT code (like a CMP - 80053 or CBC - 85025).
        3. **FINAL SANITY CHECK**: If the bill already uses comprehensive panel codes (e.g. 80053, 80048, 85025) and does NOT list their individual components separately, you MUST return passed: true.
        
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
