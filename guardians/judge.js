
export async function evaluateSimulation(guardianResults, intendedError, model) {
    const prompt = `
        You are the "Simulation Judge". Your job is to compare the results of a Blind Audit against the Intended Error Scenario.
        
        **INTENDED SCENARIO**: "${intendedError}"
        
        **BLIND AUDIT RESULTS**: 
        ${JSON.stringify(guardianResults)}

        **INSTRUCTIONS**:
        1. **Sanity Check**: Verify if the Guardian's findings are actually true. If a guardian says "Missing -25" but the Bill Data has "-25" in the code, flag this as a "Hallucination Detected".
        2. "injection_met": Did the relevant Guardian detect the error we tried to inject?
        3. "fidelity_score": How well was the error hidden? (100 = realistic, 0 = obvious hallucination or logic flip).
        4. "judge_verdict": 
           - "Effective Mock": The error was injected and correctly caught.
           - "Logic Gap Detected": The error was there but the Guardian missed it (or vice versa).
           - "Hallucination Detected": The Guardian flagged an error that DOES NOT EXIST in the raw data.
        
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
