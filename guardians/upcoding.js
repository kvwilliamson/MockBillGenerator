
export async function auditUpcoding(billData, mrData, model) {
    const prompt = `
        You are the "Upcoding Guardian". Your task is to perform a Zero-Trust audit of medical billing levels.
        Ignore any intended scenario and act as if you are a professional auditor.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. MEDICAL RECORD (The Truth): ${JSON.stringify(mrData)}

        **INSTRUCTIONS**:
        1. **Clinical Anchor Points (CPT Standards)**:
           - **Level 5 (99285/99215)**: Requires HIGH complexity. Justified by life-threatening conditions, hypoxia (SpO2 < 90%), unstable vitals, extreme pain (8-10/10), or management of 3+ chronic issues.
           - **Level 4 (99284/99214)**: Requires MODERATE complexity. Justified by acute illness with systemic symptoms or new major injuries.
           - **Level 3 (99283/99213)**: Requires LOW complexity. Standard minor injury/acute illness (sore throat, simple rash).
        2. **Audit Check**: Evaluate the Medical Record against these anchors.
        3. **ACUITY SKEPTICISM**: Only flag if the billed level is CLEARLY above the clinical story. If a patient has 9/10 chest pain and SpO2 89%, a Level 5 is 100% CORRECT. Do NOT flag it.
        
        **FINAL SANITY CHECK**: If the clinical evidence (narrative complexity + resource use + vitals) supports the complexity, set passed: true.
        
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
