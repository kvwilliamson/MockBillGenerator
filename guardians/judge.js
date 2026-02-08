
export async function evaluateSimulation(guardianResults, intendedError, billData, mrData, model) {
    const prompt = `
        You are the "Simulation Judge". Your job is to compare the results of a Blind Audit against the Intended Error Scenario and the RAW DATA.
        
        **INTENDED SCENARIO**: "${intendedError}"
        
        **ACTUAL BILL DATA**: ${JSON.stringify(billData)}
        **MEDICAL RECORD**: ${JSON.stringify(mrData)}
        
        **BLIND AUDIT RESULTS**: 
        ${JSON.stringify(guardianResults)}

        **INSTRUCTIONS**:
        1. **STRICT SCENARIO MAPPING (CRITICAL)**: "injection_met" is ONLY true if the SPECIFIC guardian corresponding to the "INTENDED SCENARIO" failed. 
           - If intended: "UPCODING", success requires an "Upcoding" guardian failure.
           - If intended: "MATH_ERROR", success requires a "Math" guardian failure.
           - DO NOT count a "Modifier" failure as a success for a "MATH_ERROR" scenario.
        2. **Sanity Check (Arithmetic)**: You MUST perform the math yourself. Sum the line items, subtract adjustments, and compare to grandTotal. If you find a discrepancy but the Math Guardian says "Totals match", flag this as a "Logic Gap Detected" and lower the fidelity score to 0.
        3. **Sanity Check (Hallucinations)**: If a guardian says "Missing -25" but the Bill Data HAS "-25" in the code, flag as "Hallucination Detected".
        3. "fidelity_score": How well was the error hidden? (100 = realistic, 0 = obvious hallucination or logic flip).
        4. "judge_verdict": 
           - "Effective Mock": The SPECIFIC intended error was injected and correctly caught.
           - "Logic Gap Detected": The intended error was missing, or the auditor caught the wrong type of error.
           - "Hallucination Detected": The Guardian flagged an error that DOES NOT EXIST in the raw data or source truth.
        
        **RETURN JSON**:
        {
            "simulation_quality_report": {
                "intended_scenario": "${intendedError}",
                "injection_met": true_or_false,
                "fidelity_score": Number,
                "judge_verdict": "Effective Mock | Logic Gap Detected | Hallucination Detected",
                "justification": "Detailed reasoning..."
            }
        }
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
