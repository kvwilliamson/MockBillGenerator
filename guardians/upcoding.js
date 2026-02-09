
export async function auditUpcoding(billData, mrData, model) {
    const items = billData.lineItems || [];
    const findings = [];

    // 1. Resource Volume Check (BKM)
    const emLevel5 = items.find(i => i.code === '99285' || i.code === '99215' || i.code === '99205');
    if (emLevel5) {
        const diagnostics = items.filter(i => i.revCode === '0300' || i.revCode === '0320' || i.revCode === '0400');
        if (diagnostics.length <= 1) {
            findings.push({
                type: 'RESOURCE_VOLUME_MISMATCH',
                level: emLevel5.code,
                diagnosticCount: diagnostics.length,
                explanation: "Level 5 charged but diagnostic volume (Labs/Imaging) is <= 1."
            });
        }
    }

    // 2. Systemic Skulking Check
    const emVisits = items.filter(i => i.code.startsWith('992'));
    const level5Visits = emVisits.filter(i => i.code.endsWith('5'));
    if (emVisits.length >= 3 && level5Visits.length === emVisits.length) {
        findings.push({
            type: 'SYSTEMIC_SKULKING',
            explanation: "100% of visits on the bill are Level 5 (Statistically improbable clumping)."
        });
    }

    const prompt = `
        You are the "Upcoding Guardian". Deterministic checks have identified high-level billing with potential mismatches.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. MEDICAL RECORD (The Truth): ${JSON.stringify(mrData)}
        3. DETERMINISTIC FINDINGS: ${JSON.stringify(findings)}

        **INSTRUCTIONS**:
        1. **Severity Mismatch**: Compare the medical record narrative/vitals to the E/M level. 
           - **LEVEL 1-2 (99281, 99282)**: These are low-acuity codes. Stable vitals and minor complaints (cough, simple rash) are APPROPRIATE for these levels. Do NOT flag as upcoding.
           - **LEVEL 5 (99285)**: Requires high complexity (hypoxia SpO2 < 90%, unstable vitals, or life-threatening conditions).
        2. **Modifier -25 Abuse**: If a visit and procedure are on the same day, check if the record supports a distinct EVALUATION.
        3. **FINAL VERDICT**: If the billed level (especially Level 2-3) is clinically reasonable for the documented complaint, you MUST return passed: true.
        
        **RETURN JSON**:
        {
            "guardian": "Upcoding",
            "passed": boolean, 
            "status": "PASS | FAIL",
            "evidence": "Forensic Proof citing record vs billing codes.",
            "failure_details": {
                "type": "Upcoding / Level-of-Service Inflation",
                "explanation": "Provide a clinical explanation of WHY the level exceeds documentation.",
                "severity": "High",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
