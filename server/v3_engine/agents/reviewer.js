import { parseAndValidateJSON } from '../utils.js';

/**
 * PHASE 7: THE REVIEWER
 * Goal: Truth Validity Analysis (Popup Report)
 */
export async function generateReviewer(model, finalBillData, clinicalTruth, codingTruth, scenario) {
    // ADAPTIVE REVIEW: Handle Split vs Global
    const billData = finalBillData; // Rename for clarity based on new logic

    let reviewContext = "";
    let reviewTotal = 0;

    if (billData.mode === 'SPLIT') {
        // COMBINED REVIEW FOR SPLIT BILL
        const facItems = billData.facilityBill.bill_data.lineItems.map(s => `[FACILITY] ${s.code}: ${s.desc} ($${s.total})`).join('\n');
        const proItems = billData.professionalBill.bill_data.lineItems.map(s => `[PROFESSIONAL] ${s.code}: ${s.desc} ($${s.total})`).join('\n');

        reviewContext = `
        **COMBINED SPLIT BILL**:
        --- FACILITY CHARGES ---
        ${facItems}
        
        --- PROFESSIONAL CHARGES ---
        ${proItems}
        `;
        reviewTotal = (parseFloat(billData.facilityBill.bill_data.grandTotal) + parseFloat(billData.professionalBill.bill_data.grandTotal)).toFixed(2);
    } else {
        // GLOBAL BILL REVIEW
        const dataToReview = billData.bill_data || billData;
        if (!dataToReview || !dataToReview.lineItems) {
            console.warn("[V3 Reviewer] Invalid bill data structure. Skipping review.");
            return { detectableFromBill: false, explanation: "Invalid data.", missingInfo: "N/A" };
        }
        reviewContext = `**GLOBAL BILL**: \n${dataToReview.lineItems.map(s => s.code + ": " + s.desc).join('\n')}`;
        reviewTotal = dataToReview.grandTotal;
    }

    // DEBUG: Prove Context to User
    console.log("[V3 Phase 7] Reviewer Context (Snippet):", reviewContext.substring(0, 300) + "...");

    const prompt = `
        You are "The Internal Auditor". Your job is to double-check the bill before it goes out.
        
        **SCENARIO**: "${scenario.scenarioName}"
        **INTENDED ERROR**: "${scenario.description}"
        **NARRATIVE TRUTH**: "${scenario.narrative}"
        
        **BILL TO REVIEW**:
        - Total Charges: $${reviewTotal}
        ${reviewContext}
        
        **CLINICAL RECORD**:
        ${JSON.stringify(clinicalTruth.encounter)}
        
        **TASK**:
        Generate a "Review Report" that explains WHY this bill is incorrect based on the clinical truth.
        
        ** RETURN JSON **:
    {
        "detectableFromBill": true / false(Can a human spot this error just by looking at the bill ?),
            "explanation": "concise explanation of the discrepancy...",
                "missingInfo": "What else would be needed to prove this error? (e.g. 'Medical Records needed to confirm level of service')"
    }
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const aiData = parseAndValidateJSON(text);

        console.log(`[V3 Phase 7]Reviewer: Analysis complete.`);
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
