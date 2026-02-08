
export async function auditLaterality(billData, mrData, model) {
    const prompt = `
        You are the "Record Match Guardian". Your task is to perform a Zero-Trust audit of body part laterality.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. MEDICAL RECORD (The Truth): ${JSON.stringify(mrData)}

        **INSTRUCTIONS**:
        1. Extract the anatomical side (Left, Right, Bilateral) mentioned in the Medical Record.
        2. Extract the anatomical side mentioned in the CPT descriptions on the Bill.
        3. **FINAL SANITY CHECK**: If the documented side in the record matches the billed side (e.g. Right Note vs Right Bill), you are STRICTLY PROHIBITED from flagging a failure. You MUST return passed: true.
        
        **RETURN JSON**:
        {
            "guardian": "Record Match",
            "passed": false,
            "status": "FAIL",
            "evidence": "Note documents [Side], but Bill charges for [Side].",
            "failure_details": {
                "type": "Laterality Mismatch",
                "explanation": "Provide a 2-3 sentence explanation of the body part or side discrepancy between the medical record and the bill.",
                "severity": "High",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }
        (NOTE: If passed, set passed: true, status: "PASS", evidence: "Sides match", and failure_details: null).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
