
export async function auditModifiers(billData, mrData, model) {
    const prompt = `
        You are the "Modifier Sentinel". Your task is to detect the incorrect use or absence of CPT modifiers.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. MEDICAL RECORD: ${JSON.stringify(mrData)}

        **INSTRUCTIONS**:
        1. **The -25 Rule (Non-Negotiable)**: If the bill contains an E/M visit (992xx) AND any other procedure (Injection 96372, Surgery 1xxxx, Radiology 7xxxx, or Lab 8xxxx), the E/M code MUST have a -25 modifier. If it is missing, you MUST FAIL.
        2. **The Laterality Rule (-RT/-LT)**: If the Medical Record specifies a side (Left, Right) and is an MSK, Radiology, or Procedure code, it MUST have -RT or -LT. 
        3. **The -50 Rule (Bilateral)**: If the note says "bilateral" but only one code without -50 is billed, FAIL.
        4. **Conflict Check**: Do not allow -25 on line items that are NOT Evaluation and Management (E/M) codes.
        
        **RETURN JSON**:
        {
            "guardian": "Modifier",
            "passed": false,
            "status": "FAIL",
            "evidence": "Describe the specific missing or conflicting modifier (e.g. 'Code 99213 is missing the required -25 modifier despite an injection being performed').",
            "failure_details": {
                "type": "Modifier Error / Missing Modifier",
                "explanation": "State the specific billing rule (e.g. 'A separate E/M service requires a -25 modifier when performed with a procedure').",
                "severity": "Medium",
                "overcharge_potential": "$0 (Administrative Error)"
            }
        }
        (NOTE: If everything is correct, set passed: true, status: "PASS", evidence: "Modifiers compliant", and failure_details: null).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
