
export async function auditMath(billData, model) {
    const items = billData.lineItems || [];
    const findings = [];

    // 1. Line Math Check ($0.05 Tolerance)
    items.forEach((item, idx) => {
        const calculatedTotal = parseFloat((item.qty * item.unitPrice).toFixed(2));
        const reportedTotal = parseFloat((item.total || 0).toFixed(2));
        if (Math.abs(calculatedTotal - reportedTotal) > 0.05) {
            findings.push({ type: 'LINE_MATH_ERROR', line: idx, expected: calculatedTotal, actual: reportedTotal });
        }

        // 2. Missing Price Check
        if (reportedTotal > 0 && (item.unitPrice === 0 || !item.unitPrice)) {
            findings.push({ type: 'MISSING_UNIT_PRICE', line: idx, total: reportedTotal });
        }
    });

    // 3. Global Balance Check ($1.00 Tolerance)
    const lineTotalSum = items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    const adjustments = parseFloat(billData.adjustments || 0);
    const insPaid = parseFloat(billData.insPaid || 0);
    const calculatedGrandTotal = parseFloat((lineTotalSum + adjustments + insPaid).toFixed(2));
    const reportedGrandTotal = parseFloat((billData.grandTotal || 0).toFixed(2));

    const globalDiscrepancy = Math.abs(calculatedGrandTotal - reportedGrandTotal);
    if (globalDiscrepancy > 1.00) {
        findings.push({
            type: 'GLOBAL_BALANCE_ERROR',
            expected: calculatedGrandTotal,
            actual: reportedGrandTotal,
            discrepancy: globalDiscrepancy
        });
    }

    if (findings.length === 0) {
        return JSON.stringify({
            guardian: "Math",
            passed: true,
            status: "PASS",
            evidence: "All line items and global balances are within arithmetic tolerances.",
            failure_details: null
        });
    }

    const prompt = `
        You are the "Math Guardian". Deterministic checks have identified arithmetic mismatches.
        
        **FINDINGS**: ${JSON.stringify(findings)}
        **CONTEXT**:
        - Subtotal: $${lineTotalSum.toFixed(2)}
        - Adjustments: $${adjustments.toFixed(2)}
        - Insurance Paid: $${insPaid.toFixed(2)}
        - Reported Total: $${reportedGrandTotal.toFixed(2)}

        **INSTRUCTIONS**:
        1. Explain where the math fails (Line item vs Global Balance).
        2. Identify if the 'grandTotal' is higher (Overcharge) or lower than the calculated sum.
        
        **RETURN JSON**:
        {
            "guardian": "Math",
            "passed": false,
            "status": "FAIL",
            "evidence": "Detailed breakdown of the arithmetic mismatch.",
            "failure_details": {
                "type": "Calculation Error",
                "explanation": "State exactly why the math doesn't work.",
                "severity": "High",
                "overcharge_potential": "$${globalDiscrepancy.toFixed(2)}"
            }
        }`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
