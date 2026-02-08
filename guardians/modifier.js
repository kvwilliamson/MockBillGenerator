
export async function auditModifiers(billData, mrData, model) {
    const prompt = `
        You are the "Modifier Sentinel". Your task is to detect the incorrect use or absence of CPT modifiers.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. MEDICAL RECORD: ${JSON.stringify(mrData)}

        **INSTRUCTIONS**:
        1. **The -25 Rule (Non-Negotiable)**: Look for E/M codes (992xx or 9928x). Check if the code has a hyphenated suffix (e.g., "99285-25"). If you see "-25", the rule is SATISFIED. 
        2. **Audit Trigger**: If the bill has procedures (Imaging, Ventilation, Injections) but the E/M code TOTALLY LACKS the "-25" suffix, you MUST FAIL.
        3. **Truth Verification**: YOU ARE A HIGH-PRECISION PARSER. If a code is billed as "99285-25", you ARE STRICTLY PROHIBITED from claiming the modifier is missing. That is a hallucination.
        
        **RETURN JSON**:
        {
            "guardian": "Modifier",
            "passed": false,
            "status": "FAIL",
            "evidence": "Describe exactly which code is missing the modifier (e.g. '99213 is missing -25').",
            "failure_details": {
                "type": "Modifier Error",
                "explanation": "A separate E/M service requires a -25 modifier when performed with a procedure.",
                "severity": "Medium",
                "overcharge_potential": "$0"
            }
        }
        (NOTE: If everything is correct, set passed: true, status: "PASS", evidence: "Modifiers compliant", and failure_details: null).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
