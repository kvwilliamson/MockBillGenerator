import { parseAndValidateJSON } from '../utils.js';

/**
 * PHASE 6: THE POLISH AGENT
 * Goal: Final Assembly and Validation
 */
export async function generatePolishAgent(model, finalBillData, scenario, siteOfService, billingModel) {
    const prompt = `
        You are "The Polish Agent". Your goal is to perform a final structural and clinical sanity check on the medical bill.
        
        **ENVIRONMENT**:
        - SOS: ${siteOfService}
        - Billing Model: ${billingModel}
        
        **INPUT DATA**:
        ${JSON.stringify(finalBillData)}
        
        **RULES**:
        1. **Setting Integrity**: Ensure the bill structure matches the SOS (e.g. Independent Office should NOT have Rev Codes).
        2. **Split Hardening**: If SPLIT/COMPONENT, strictly move any stray professional interpretation fees (Modifier -26) to the Professional bill and any technical/institutional fees (Revenue Codes) to the Facility bill.
        3. **Consistency**: Ensure clinical findings in the narrative are reflected in the line items.
        4. **Nomenclature**: Check for any AI-style hallucinations in descriptions and clean them to standard medical shorthand.
        5. **NO EXPLANATORY SUFFIXES**: STRIP any strings like "- TECHNICAL COMPONENT" or "- PROFESSIONAL COMPONENT" from descriptions. They are redundant and unrealistic.
        
        **OUTPUT**:
        Return the exact same JSON structure as the input, but with any necessary "polishing" to descriptions or quantity corrections.
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const polishedData = parseAndValidateJSON(text);
        console.log("[V3 Phase 6] Polish Agent: Sanity check complete.");
        return polishedData;
    } catch (error) {
        console.warn("[V3 Phase 6] Polish Agent Failed (Fallback to original):", error.message);
        return finalBillData;
    }
}
