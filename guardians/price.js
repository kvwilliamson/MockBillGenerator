import { PAYER_MULTIPLIERS } from '../server/pricing_core.js';

export async function auditPrice(billData, actuaryData, model) {
    const payerType = billData.payerType || 'Commercial';
    const baseMultiplier = PAYER_MULTIPLIERS[payerType] || 2.0;
    const sensitivity = 3.0; // BKM Sensitivity

    // 1. Deterministic Calculation (BKM Formula)
    const violations = billData.lineItems.map(item => {
        const baseCode = item.code.split('-')[0];
        const benchmarkItem = actuaryData.itemized_benchmarks?.find(b => b.code === baseCode);

        // BKM Rule: If benchmark is missing, fallback to $100 for safety or AI lookup (handled in orchestrator)
        const medicareRate = benchmarkItem ? benchmarkItem.estimated_fair_price : 100;
        const threshold = (baseMultiplier * medicareRate) * sensitivity;

        const billed = item.unitPrice;
        if (billed > threshold) {
            return {
                code: item.code,
                billed,
                medicareRate,
                baseMultiplier,
                threshold,
                isMajorOutlier: billed > (threshold * 1.2),
                isExtremeOutlier: billed > (threshold * 2.0)
            };
        }
        return null;
    }).filter(v => v !== null);

    if (violations.length === 0) {
        return JSON.stringify({
            guardian: "Price Sentry",
            passed: true,
            status: "PASS",
            evidence: `All unit prices are within the BKM threshold for ${payerType} (${baseMultiplier}x base).`,
            failure_details: null
        });
    }

    const prompt = `
        You are the "Price Sentry". Deterministic checks have identified major or extreme pricing outliers.
        
        **VIOLATIONS FOUND**:
        ${JSON.stringify(violations)}
        **PAYER CONTEXT**: ${payerType} (Base Multiplier: ${baseMultiplier}x)

        **INSTRUCTIONS**:
        1. Explain the "BKM Multiplier Rule" to the user.
        2. Specifically flag "Major Outliers" (>1.2x threshold) and "Extreme Outliers" (>2.0x threshold).
        3. Cite the Medicare baseline vs the billed amount.
        
        **RETURN JSON**:
        {
            "guardian": "Price Sentry",
            "passed": false,
            "status": "FAIL",
            "evidence": "Forensic audit of [Codes] against Medicare fair-market baselines.",
            "failure_details": {
                "type": "Excessive Pricing / Gouging",
                "explanation": "State the multiplier violation and identify extreme outliers.",
                "severity": "High",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
