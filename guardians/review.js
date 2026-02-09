
export async function auditReview(billData, mrData, model) {
    const prompt = `
        ### SYSTEM ROLE
        You are an expert Clinical Auditor and Medical Coding Auditor. Your specialty is verifying that medical bill charges are fully supported by clinical documentation in the Medical Record.

        ### OBJECTIVE
        Analyze an Itemized Bill (JSON) and a Medical Record (Text). Identify discrepancies where the bill includes items or levels of service not supported by the documentation.

        ### ANALYSIS CATEGORIES & OVERCHARGE RULES
        1. MISSING_DOC: Items billed that have no mention or support in the medical record. 
            - Overcharge Amount: The FULL billed amount.
        2. UPCODING: The billed code represents a higher complexity than what is documented (e.g. Level 5 ER Visit billed for a minor issue).
            - Requirement: You MUST suggest the more appropriate CPT code and an estimated fair price for that lower-level service.
            - Overcharge Amount: Billed Amount minus the Estimated Fair Price.
        3. UNNECESSARY_CHARGE: Items documented but clinically unnecessary for the diagnosed condition.
            - Overcharge Amount: The FULL billed amount.
        4. LOGIC_ERROR: Billed items that don't follow logically from the reason for visit.
            - Overcharge Amount: The FULL billed amount.

        ### INPUTS
        1. BILL DATA: ${JSON.stringify(billData)}
        2. MEDICAL RECORD: ${JSON.stringify(mrData)}

        ### OUTPUT FORMAT
        Return ONLY a valid JSON object. Do not include markdown separators.
        If NO ISSUES are found (all items are supported), you MUST return passed: true and failure_details: null.

        {
          "guardian": "Review",
          "passed": boolean,
          "status": "PASS | FAIL",
          "evidence": "Forensic summary of findings.",
          "flagged_items": [
            {
              "line_id": number,
              "cpt_code": "string",
              "issue_type": "MISSING_DOC | UPCODING | UNNECESSARY_CHARGE | LOGIC_ERROR",
              "reasoning": "string",
              "suggested_cpt": "string",
              "suggested_amount": number,
              "overcharge_amount": number,
              "confidence_score": number
            }
          ],
          "failure_details": {
             "type": "Clinical Documentation Gap",
             "explanation": "Summarize the primary clinical findings.",
             "severity": "High",
             "overcharge_potential": "$Total overcharge amount"
          }
        }
    `;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
