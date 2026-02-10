import { parseAndValidateJSON } from '../utils.js';

/**
 * PHASE 7: THE REVIEWER
 * Goal: Truth Validity Analysis (Popup Report)
 */
export async function generateReviewer(model, finalBillData, clinicalTruth, codingTruth, scenario) {
    // ADAPTIVE REVIEW: Handle Split vs Global
    const billData = finalBillData; // Rename for clarity based on new logic
    const dataToReview = billData.mode === 'SPLIT' ? billData.facilityBill.bill_data : (billData.bill_data || billData);

    // Validate inputs (Quick Check)
    if (!dataToReview || !dataToReview.provider) {
        console.warn("[V3 Reviewer] Invalid bill data structure. Skipping review.");
        return {
            detectableFromBill: false,
            explanation: "Invalid bill data structure provided for review.",
            missingInfo: "N/A"
        };
    }

    const prompt = `
        You are "The Internal Auditor". Your job is to double-check the bill before it goes out.
        
        **SCENARIO**: "${scenario.scenarioName}"
        **INTENDED ERROR**: "${scenario.description}"
        **NARRATIVE TRUTH**: "${scenario.narrative}"
        
        **BILL TO REVIEW**:
        - Facility: ${dataToReview.provider.name}
        - Total: $${dataToReview.grandTotal}
        - CPT Codes: ${JSON.stringify(dataToReview.lineItems.map(s => s.code + ": " + s.desc))}
        
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
