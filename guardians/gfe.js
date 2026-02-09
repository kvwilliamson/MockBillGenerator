
export async function auditGFE(billData, gfeData, payerType, model) {
    const findings = [];
    const billItems = billData.lineItems || [];
    const gfeItems = gfeData?.lineItems || [];
    const billTotal = parseFloat(billData.grandTotal || 0);
    const gfeTotal = parseFloat(gfeData?.totalEstimatedCost || 0);

    // 1. Line Mismatch Check ($0.01 Tolerance)
    billItems.forEach((item, idx) => {
        const baseCode = item.code.split('-')[0];
        const gfeMatch = gfeItems.find(g => g.code.split('-')[0] === baseCode);

        if (gfeMatch) {
            const billedPrice = parseFloat(item.unitPrice || 0);
            const estimatedPrice = parseFloat(gfeMatch.estimatedRate || gfeMatch.unitPrice || 0);
            if (billedPrice > (estimatedPrice + 0.01)) {
                findings.push({ type: 'LINE_PRICE_MISMATCH', line: idx, code: item.code, billed: billedPrice, estimated: estimatedPrice });
            }
        }
    });

    // 2. Federal Threshold ($400 rule)
    if (gfeTotal > 0) {
        const delta = billTotal - gfeTotal;
        if (delta >= 400) {
            findings.push({ type: 'FEDERAL_THRESHOLD_VIOLATION', billTotal, gfeTotal, delta, limit: 400 });
        }
    }

    if (findings.length === 0 || !gfeData) {
        return JSON.stringify({
            guardian: "GFE",
            passed: true,
            status: "PASS",
            evidence: !gfeData ? "No GFE provided, skipping audit." : "Bill is within GFE estimated ranges and federal thresholds.",
            failure_details: null
        });
    }

    const prompt = `
        You are the "GFE Guardian". Deterministic checks have identified Good Faith Estimate violations.
        
        **FINDINGS**: ${JSON.stringify(findings)}
        **BILL DATA**: Total $${billTotal.toFixed(2)}
        **GFE DATA**: Total $${gfeTotal.toFixed(2)}

        **INSTRUCTIONS**:
        1. Explain the No Surprises Act (NSA) violation.
        2. Specifically mention the $400 dispute threshold if applicable.
        3. Identify specific line items that exceeded the estimate.
        
        **RETURN JSON**:
        {
            "guardian": "GFE",
            "passed": false, 
            "status": "FAIL",
            "evidence": "GFE violation detected.",
            "failure_details": {
                "type": "GFE Threshold / Line Mismatch",
                "explanation": "State the specific violation and total overage.",
                "severity": "High",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
