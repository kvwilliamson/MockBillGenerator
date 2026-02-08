
export async function auditGFE(billData, gfeData, payerType, model) {
    const prompt = `
        You are the "GFE Guardian". Your job is to audit compliance with the No Surprises Act ($400 rule).
        
        **INPUTS**:
        1. BILL DATA (Grand Total: ${billData.grandTotal})
        2. GFE DATA (Estimated: ${gfeData ? gfeData.totalEstimatedCost : 'None'})

        **INSTRUCTIONS**:
        1. IF GFE DATA IS NULL: Return passed: true.
        2. CALCULATE DELTA: Final Bill (${billData.grandTotal}) MINUS GFE Estimate (${gfeData ? gfeData.totalEstimatedCost : '0'}).
        3. **THRESHOLD TEST**: Is the Delta equal to or greater than $400?
           - If Delta >= 400: Return passed: false.
           - If Delta < 400: Return passed: true.
        
        **RETURN JSON**:
        {
            "guardian": "GFE",
            "passed": false,
            "status": "FAIL",
            "evidence": "Bill is $X above estimate.",
            "failure_details": {
                "type": "GFE Threshold Violation",
                "explanation": "State the exact calculation: Bill ($X) - GFE ($Y) = Delta ($Z). Cite the $400 threshold.",
                "severity": "High",
                "overcharge_potential": "$Estimed overcharge"
            }
        }
        (NOTE: If Delta < 400, set passed: true, status: "PASS", evidence: "Delta within $400 limit", and failure_details: null).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
