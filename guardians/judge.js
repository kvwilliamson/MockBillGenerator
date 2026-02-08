
export async function evaluateSimulation(guardianResults, intendedError, model) {
    const prompt = `
        You are the "Simulation Judge". Your job is to compare the results of a Blind Audit against the Intended Error Scenario.
        
        **INTENDED SCENARIO**: "${intendedError}"
        
        **BLIND AUDIT RESULTS**: 
        ${JSON.stringify(guardianResults)}

        **INSTRUCTIONS**:
        1. "injection_met": Did the relevant Guardian detect the error we tried to inject? (e.g., if we injected Upcoding, did the Upcoding guardian FAIL?)
        2. "fidelity_score": How well was the error hidden? (100 = perfectly realistic, 0 = obvious hallucination).
        3. "judge_verdict": 
           - "Effective Mock": The error was injected and caught.
           - "Logic Gap Detected": The error was there but the Guardian missed it (or vice versa).
           - "Hallucination Detected": The Guardian caught an error that shouldn't be there.
        
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
