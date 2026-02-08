
export async function auditGlobalPeriod(billData, mrData, model) {
    const prompt = `
        You are the "Date Guardian". Your task is to perform a Zero-Trust audit of Global Period billing.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. MEDICAL RECORD (The Truth): ${JSON.stringify(mrData)}

        **INSTRUCTIONS**:
        1. Look for mentions of recent surgeries (within 90 days) in the "history" section of the medical record.
        2. Check the Date of Service (DOS) on the bill.
        3. Determine if the billed encounter is a full-priced E/M visit that should have been part of a post-op global period ($0 charge).
        
        **RETURN JSON**:
        {
            "guardian": "Date",
            "passed": false,
            "status": "FAIL",
            "evidence": "Encounter is [X] days post-op; should be part of global period.",
            "failure_details": {
                "type": "Global Period Violation",
                "explanation": "Summarize the recent surgery found in history and explain why this encounter date violates the 90-day global rule.",
                "severity": "Medium",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }
        (NOTE: If passed, set passed: true, status: "PASS", evidence: "No global violations", and failure_details: null).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
