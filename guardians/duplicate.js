
export async function auditDuplicates(billData, model) {
    const prompt = `
        You are the "Duplicate Guardian". Your job is to identify same-day redundant charges.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}

        **INSTRUCTIONS**:
        1. Scan the bill for identical CPT codes applied multiple times to the same Date of Service.
        2. **STANDARD**: Multiple line items of the same code are only valid if they have distinct modifiers (e.g. -59, -91) or are for distinct anatomical sites (e.g. 2 views of same part).
        3. **FINAL SANITY CHECK**: If all billed codes are unique per date, or have appropriate distinct descriptions, you MUST return passed: true.
        
        **RETURN JSON**:
        {
            "guardian": "Duplicate",
            "passed": false,
            "status": "FAIL",
            "evidence": "Multiple charges for [CPT] on [Date].",
            "failure_details": {
                "type": "Duplicate Billing",
                "explanation": "Identify the identical charges appearing on the same service date and explain why they appear redundant.",
                "severity": "High",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }
        (NOTE: If passed, set passed: true, status: "PASS", evidence: "No duplicates found", and failure_details: null).
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
