
export async function auditPrice(billData, actuaryData, model) {
    const prompt = `
        You are the "Price Sentry". Your task is a Fair Market Value (FMV) assessment.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. ACTUARY DATA (Estimated Benchmarks): ${JSON.stringify(actuaryData)}

        **CRITICAL AUDIT RULE**: 
        - A price is ONLY excessive if it is MORE THAN 20% higher than the benchmark.
        - If Billed Price <= (Benchmark * 1.2), you MUST return passed: true.

        **INSTRUCTIONS**:
        1. Calculate (Benchmark * 1.2) for each item.
        2. Compare the 'unitPrice' to this 120% limit.
        3. Only flag if 'unitPrice' is strictly greater than the limit.
        
        **RETURN JSON**:
        {
            "guardian": "Price Sentry",
            "passed": false,
            "status": "FAIL",
            "evidence": "Billed $X for [Service]; Benchmark is $Y.",
            "failure_details": {
                "type": "Excessive Pricing / Gouging",
                "explanation": "Compare the billed unit price against the actuary fair market value and justify the gouging flag.",
                "severity": "Medium / High",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }
        (NOTE: If Price <= Benchmark * 1.2, set passed: true, status: "PASS", evidence: "Prices within FMV", and failure_details: null).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
