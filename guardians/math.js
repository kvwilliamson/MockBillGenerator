
export async function auditMath(billData, model) {
    // 1. Deterministic JS Calculation (BKM: Don't let AI do addition)
    const lineTotalSum = (billData.lineItems || []).reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    const adjustments = parseFloat(billData.adjustments || 0);
    const insPaid = parseFloat(billData.insPaid || 0);
    const calculatedGrandTotal = parseFloat((lineTotalSum + adjustments + insPaid).toFixed(2));
    const reportedGrandTotal = parseFloat((billData.grandTotal || 0).toFixed(2));

    const discrepancy = Math.abs(calculatedGrandTotal - reportedGrandTotal);

    // 2. Immediate Pass if math is perfect
    if (discrepancy < 0.01) {
        return JSON.stringify({
            guardian: "Math",
            passed: true,
            status: "PASS",
            evidence: "Totals match perfectly.",
            failure_details: null
        });
    }

    // 3. AI for Explanation ONLY (Forensic Narrative)
    const prompt = `
        You are the "Math Guardian". A mathematical mismatch has been detected in a medical bill.
        
        **FOUND DISCREPANCY**:
        - Sum of Line Items: $${lineTotalSum.toFixed(2)}
        - Adjustments reported: $${adjustments.toFixed(2)}
        - Insurance Paid reported: $${insPaid.toFixed(2)}
        - Reported Grand Total: $${reportedGrandTotal.toFixed(2)}
        - MATHEMATICAL ERROR: $${discrepancy.toFixed(2)}

        **INSTRUCTIONS**:
        1. Explain where the math fails.
        2. Identify if the 'grandTotal' is higher (Overcharge) or lower (Undercharge) than the calculated sum.
        
        **RETURN JSON**:
        {
            "guardian": "Math",
            "passed": false,
            "status": "FAIL",
            "evidence": "Detailed breakdown of the mismatch.",
            "failure_details": {
                "type": "Calculation Error",
                "explanation": "State exactly why the math doesn't work.",
                "severity": "High",
                "overcharge_potential": "$${discrepancy.toFixed(2)}"
            }
        }`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
