
export async function auditPrice(billData, actuaryData, model) {
    // Determine which items exceed the 120% benchmark threshold using deterministic JS
    const violations = billData.lineItems.map(item => {
        const baseCode = item.code.split('-')[0];
        const benchmarkItem = actuaryData.itemized_benchmarks?.find(b => b.code === baseCode);
        const benchmark = benchmarkItem ? benchmarkItem.estimated_fair_price : 100;
        const billed = item.unitPrice;
        const threshold = benchmark * 1.2;
        if (billed > threshold) {
            return { code: item.code, billed, benchmark, threshold };
        }
        return null;
    }).filter(v => v !== null);

    if (violations.length === 0) {
        return JSON.stringify({
            guardian: "Price Sentry",
            passed: true,
            status: "PASS",
            evidence: "All unit prices are within the 120% FMV benchmark threshold.",
            failure_details: null
        });
    }

    const prompt = `
        You are the "Price Sentry". A deterministic check has identified price gouging on this bill. 
        Your task is to write the forensic failure narrative.
        
        **VIOLATIONS FOUND**:
        ${JSON.stringify(violations)}

        **INSTRUCTIONS**:
        1. For each violation, explain why it is considered excessive compared to the national benchmark.
        2. Keep the explanation professional and forensic.
        
        **RETURN JSON**:
        {
            "guardian": "Price Sentry",
            "passed": false,
            "status": "FAIL",
            "evidence": "Billed prices for [Codes] exceed the 120% FMV threshold.",
            "failure_details": {
                "type": "Excessive Pricing / Gouging",
                "explanation": "Summarize the total overcharge and its clinical/financial impact.",
                "severity": "High",
                "overcharge_potential": "$Total excessive amount"
            }
        }
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
