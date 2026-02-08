
export async function auditUpcoding(billData, mrData, model) {
    const prompt = `
        You are the "Upcoding Guardian". Your task is to perform a Zero-Trust audit of medical billing levels.
        Ignore any intended scenario and act as if you are a professional auditor.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. MEDICAL RECORD (The Truth): ${JSON.stringify(mrData)}

        **INSTRUCTIONS**:
        1. Identify the highest Billed E/M Level (e.g., 99285, 99215).
        2. Evaluate the Medical Record (The Truth): 
           - Vitals stability (BP, HR, SpO2).
           - Complexity of the SOAP narrative (Is it a complex multi-system problem or a simple one-issue visit?).
           - Quantity of labs/imaging performed.
        3. **DIAGNOSTIC VERIFICATION**: Look at the ICD-10 codes on the bill. If there are multiple codes (e.g., Primary + Secondary symptoms), check if BOTH are documented/managed in the SOAP Assessment and Plan. If the bill lists symptoms (like fever or pain) that the medical record explicitly denies, this is a FORENSIC FAIL.
        4. **ACUITY SKEPTICISM**: Be extremely skeptical of Level 4 (99284) or Level 5 (99285) codes for common/minor complaints (sore throat, cough, stable chronic rash) if vitals are stable and no acute distress is noted. Level 4/5 requires high medical decision-making complexity; a "virus" diagnosis with "supportive care" plan almost never qualifies.
        
        **FINAL SANITY CHECK**: If the clinical evidence (narrative complexity + resource use + vitals) does not justify the high-intensity level billed, you MUST return passed: false.
        
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
