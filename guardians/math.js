
export async function auditMath(billData, model) {
    const prompt = `
        You are the "Math Guardian". Your task is to perform a line-by-line financial recalculation.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}

        **INSTRUCTIONS**:
        1. Numerically sum up the 'total' field for every line item.
        2. Subtract any 'adjustments' from that sum.
        3. **FINAL SANITY CHECK**: If your calculated sum matches the 'grandTotal', you MUST return passed: true. Do not search for "hidden" errors if the arithmetic lines up exactly.
        
        **RETURN JSON**:
        {
            "guardian": "Math",
            "passed": false,
            "status": "FAIL",
            "evidence": "Sum of items is $X, grand total billed is $Y.",
            "failure_details": {
                "type": "Calculation Error",
                "explanation": "Break down the mathematical mismatch between line items and totals.",
                "severity": "High",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }
        (NOTE: If passed, set passed: true, status: "PASS", evidence: "Totals match", and failure_details: null).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
