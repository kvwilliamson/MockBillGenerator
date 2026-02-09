
export async function auditDuplicates(billData, model) {
    const items = billData.lineItems || [];
    const findings = [];

    // 1. Deterministic JS Scan (BKM)
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
            const a = items[i];
            const b = items[j];

            if (a.code === b.code && a.date === b.date) {
                // Skip pulse ox if only one per department (simplified check)
                if (a.code === '94760' && a.revCode !== b.revCode) continue;

                if (a.total === b.total) {
                    findings.push({
                        type: 'EXACT_MATCH',
                        lines: [i, j],
                        code: a.code,
                        amount: a.total
                    });
                } else {
                    // Check for proportional match (Quantity Error)
                    const ratio = Math.max(a.total, b.total) / Math.min(a.total, b.total);
                    if (Number.isInteger(ratio) || (ratio % 1 < 0.05)) {
                        findings.push({
                            type: 'QUANTITY_POTENTIAL',
                            lines: [i, j],
                            code: a.code,
                            amounts: [a.total, b.total]
                        });
                    } else {
                        // Price Variance
                        findings.push({
                            type: 'DUPLICATE_PRICE_VARIANCE',
                            lines: [i, j],
                            code: a.code,
                            amounts: [a.total, b.total]
                        });
                    }
                }
            }
        }
    }

    if (findings.length === 0) {
        return JSON.stringify({
            guardian: "Duplicate",
            passed: true,
            status: "PASS",
            evidence: "No same-day redundant charges found.",
            failure_details: null
        });
    }

    const prompt = `
        You are the "Duplicate Guardian". Deterministic checks have identified redundant or suspicious charges.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. DETERMINISTIC FINDINGS: ${JSON.stringify(findings)}

        **INSTRUCTIONS**:
        1. Review the findings. 
        2. Identify if the 'EXACT_MATCH' items have distinct modifiers or anatomical sites that might justify them.
        3. For 'QUANTITY_POTENTIAL', explain if it looks like a multiplier error.
        4. For 'DUPLICATE_PRICE_VARIANCE', flag as "Investigate" with high confidence it is a duplication error with pricing drift.
        
        **RETURN JSON**:
        {
            "guardian": "Duplicate",
            "passed": false,
            "status": "FAIL",
            "evidence": "Briefly summarize the findings.",
            "failure_details": {
                "type": "Duplicate Billing / Price Variance",
                "explanation": "Identify the specific lines and explain the BKM violation.",
                "severity": "High",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
