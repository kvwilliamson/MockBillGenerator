
export async function evaluateSimulation(guardianResults, intendedError, billData, mrData, model) {
    // 1. Deterministic JS Meta-Audit (BKM: The Judge must catch Math logic gaps)
    const items = billData.lineItems || [];
    const lineTotalSum = items.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
    const adjustments = parseFloat(billData.adjustments || 0);
    const insPaid = parseFloat(billData.insPaid || 0);
    const calculatedGrandTotal = parseFloat((lineTotalSum + adjustments + insPaid).toFixed(2));
    const reportedGrandTotal = parseFloat((billData.grandTotal || 0).toFixed(2));
    const mathMismatch = Math.abs(calculatedGrandTotal - reportedGrandTotal) > 1.00;

    const mathGuardianResult = guardianResults.find(r => r.guardian === "Math");
    const logicGapDetected = mathMismatch && (mathGuardianResult && mathGuardianResult.passed);

    const prompt = `
        You are the "Simulation Judge". Your job is to perform a Meta-Audit of the guardian results.
        
        **INTENDED SCENARIO**: "${intendedError}"
        **DETERMINISTIC META-AUDIT**:
        - Math Discrepancy Found: ${mathMismatch}
        - Logic Gap (Math failed but Guardian passed): ${logicGapDetected}
        
        **RAW DATA**:
        - Bill: ${JSON.stringify(billData)}
        - Medical Record Snippet: ${JSON.stringify(mrData).substring(0, 1000)}
        
        **GUARDIAN RESULTS**: 
        ${JSON.stringify(guardianResults)}
        
        **INSTRUCTIONS**:
        1. **Hallucination Check**: Cross-reference any "FAIL" results. Did the guardian flag something that is NOT in the raw data? (e.g., flagging missing -25 when it's present).
        2. **Logic Gap Check**: If "Logic Gap Detected" is true, the fidelity score MUST be 0.
        3. **Mapping Check**: Did the SPECIFIC guardian for the intended error fail?
        
        **RETURN JSON**:
        {
            "simulation_quality_report": {
                "intended_scenario": "${intendedError}",
                "injection_met": boolean,
                "fidelity_score": number, 
                "logic_gap_found": ${logicGapDetected},
                "hallucination_detected": boolean,
                "judge_verdict": "Effective Mock | Logic Gap Detected | Hallucination Detected",
                "justification": "Detailed reasoning..."
            }
        }
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
