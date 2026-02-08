
export async function auditBalanceBilling(billData, payerType, model) {
    const prompt = `
        You are the "Balance Billing Guardian". Your task is to detect illegal OON collection attempts.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. PAYER TYPE: "${payerType}"

        **INSTRUCTIONS**:
        1. Look for bills where the patient is Insured (Commercial, HDHP, etc.) but the Grand Total includes a persistent "Patient Responsibility" balance for an out-of-network charge.
        2. **STANDARD**: Do not flag standard co-pays (e.g., $20, $50) or normal deductibles.
        3. **FINAL SANITY CHECK**: If the patient balance is a small, typical co-pay amount (under $100), you MUST return passed: true.
        
        **RETURN JSON**:
        {
            "guardian": "Balance Billing",
            "passed": false,
            "status": "FAIL",
            "evidence": "OON provider requesting balance payment of $X.",
            "failure_details": {
                "type": "Balance Billing Violation",
                "explanation": "Explain why this out-of-network charge violates the No Surprises Act for an insured patient.",
                "severity": "High",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }
        (NOTE: If passed, set passed: true, status: "PASS", evidence: "No illegal balance billing", and failure_details: null).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
