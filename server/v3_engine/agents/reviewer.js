import { parseAndValidateJSON } from '../utils.js';

/**
 * PHASE 7: THE REVIEWER
 * Goal: Truth Validity Analysis (Popup Report)
 */
export async function generateReviewer(model, finalBillData, clinicalTruth, codingTruth, scenario) {
    const prompt = `
        You are "The Reviewer". Your job is to audit a generated mock bill against the "Truth" of the clinical encounter to explain the error loop.
        
        **SCENARIO**: "${scenario.scenarioName}"
        **INTENDED ERROR**: "${scenario.description}"
        **NARRATIVE TRUTH**: "${scenario.narrative}"
        
        **BILL CONTENT**:
        - Facility: ${finalBillData.bill_data.provider.name}
        - Total: $${finalBillData.bill_data.grandTotal}
        - CPT Codes: ${JSON.stringify(finalBillData.bill_data.lineItems.map(s => s.code + ": " + s.desc))}
        
        **CLINICAL RECORD**:
        ${JSON.stringify(clinicalTruth.encounter)}
        
        **TASK**:
        Generate a "Review Report" that explains WHY this bill is incorrect based on the clinical truth.
        
        **RETURN JSON**:
        {
            "detectableFromBill": true/false (Can a human spot this error just by looking at the bill?),
            "explanation": "concise explanation of the discrepancy...",
            "missingInfo": "What else would be needed to prove this error? (e.g. 'Medical Records needed to confirm level of service')"
        }
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const aiData = parseAndValidateJSON(text);

        console.log(`[V3 Phase 7] Reviewer: Analysis complete.`);
        return aiData;
    } catch (error) {
        console.error("Reviewer Failed:", error);
        return {
            detectableFromBill: false,
            explanation: "Analysis failed.",
            missingInfo: "N/A"
        };
    }
}
