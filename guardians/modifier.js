
export async function auditModifiers(billData, mrData, model) {
    const prompt = `
        You are the "Modifier Sentinel". Your task is to detect the incorrect use or absence of CPT modifiers.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. MEDICAL RECORD: ${JSON.stringify(mrData)}

        **INSTRUCTIONS**:
        1. **The -25 Rule (Non-Negotiable)**: Look for E/M codes (992xx). Note that modifiers are appended with a hyphen (e.g., 99214-25). Split the code string to verify. If an E/M code has other procedures (Injection, Radiology) but LACKS the "-25" suffix, you MUST FAIL.
        2. **The Laterality Rule (-RT/-LT)**: If the Record specifies a side (Left, Right), codes for limbs/joint procedures MUST have the corresponding "-RT" or "-LT" suffix.
        3. **Truth Verification**: DO NOT hallucinate. If a code HAS the modifier (e.g. 99213-25), you ARE STRICTLY FORBIDDEN from flagging it as missing.
        
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
