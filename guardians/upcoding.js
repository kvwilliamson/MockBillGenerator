
export async function auditUpcoding(billData, mrData, model) {
    const prompt = `
        You are the "Upcoding Guardian". Your task is to perform a Zero-Trust audit of medical billing levels.
        Ignore any intended scenario and act as if you are a professional auditor.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. MEDICAL RECORD (The Truth): ${JSON.stringify(mrData)}

        **INSTRUCTIONS**:
        1. Identify the highest Billed E/M Level (e.g., 99285, 99215).
        2. Evaluate the Medical Record: 
           - Vitals stability (BP, HR, SpO2).
           - Complexity of the SOAP narrative.
           - Quantity of labs/imaging performed.
        3. **CLINICAL STANDARD**: Do NOT flag low-to-moderate levels (e.g. 99282, 99283) for common complaints like cough or small lacerations unless the record is empty or vitals are missing. Level 1-3 are generally baseline for any professional assessment.
        
        **FINAL SANITY CHECK**: If the clinical evidence (narrative complexity + resource use) matches the billed E/M level, you MUST return passed: true.
        
        **RETURN JSON**:
        {
            "guardian": "Upcoding",
            "passed": false, 
            "status": "FAIL",
            "evidence": "Forensic Proof (MANDATORY: Cite exact vitals/indicators used, e.g. 'Level 4 for BP 120/80 and normal exam')",
            "failure_details": {
                "type": "Upcoding / Over-leveling",
                "explanation": "Provide a 2-3 sentence clinical explanation of WHY the billed level exceeds the documented complexity.",
                "severity": "High",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }
        (NOTE: If the bill is correct, set passed: true, status: "PASS", evidence: "Record matches level", and failure_details: null).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
