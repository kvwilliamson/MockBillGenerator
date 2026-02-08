
export async function auditGFE(billData, gfeData, payerType, model) {
    const prompt = `
        You are the "GFE Guardian". Your job is to audit compliance with the No Surprises Act ($400 rule).
        
        **INPUTS**:
        1. BILL DATA (Grand Total: ${billData.grandTotal})
        2. GFE DATA: ${gfeData && gfeData.totalEstimatedCost ? `$${gfeData.totalEstimatedCost}` : 'MISSING / NO GFE UPLOADED'}

        **CRITICAL INSTRUCTIONS**:
        1. **BYPASS RULE**: If GFE DATA is "MISSING / NO GFE UPLOADED", you MUST return passed: true. It is impossible to have a threshold violation without an estimate.
        2. **CALCULATE DELTA**: If GFE exists, Final Bill (${billData.grandTotal}) MINUS GFE Estimate.
        3. **THRESHOLD TEST**: If Delta >= 400, return passed: false. Otherwise, true.
        4. **NO GUESSING**: Do not assume an estimate of $0 if it is missing. If it is missing, the audit is a PASS by default.
        
        **RETURN JSON**:
        {
            "guardian": "GFE",
            "passed": true | false,
            "status": "PASS" | "FAIL",
            "evidence": "Detailed explanation of result",
            "failure_details": {
                "type": "GFE Threshold Violation",
                "explanation": "State Bill ($X) - GFE ($Y) = Delta ($Z). Cite $400 limit.",
                "severity": "High",
                "overcharge_potential": "$Delta"
            }
        }
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
