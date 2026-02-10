import { parseAndValidateJSON } from '../utils.js';

/**
 * PHASE 4: THE FINANCIAL CLERK
 * Goal: Apply Pricing and Charges (Hybrid AI/Constraint)
 */
export async function generateFinancialClerk(model, codedServices, scenario, facility) {
    const prompt = `
        You are "The Financial Clerk". Your goal is to apply PRICING to the generated CPT codes.
        
        **INPUTS**:
        - CPT Codes: ${JSON.stringify(codedServices.cpt_codes)}
        - Facility Type: ${facility.facilityType} (State: ${facility.state})
        
        **STRICT BILLING INSTRUCTIONS (FROM BOSS)**:
        "${scenario.billingInstructions}"
        
        **TASK**:
        1. Assign a "Unit Price" for each CPT code.
        2. **CORE ITEMS**: IF the instructions say "Inflate", use a very high price (e.g., 500% of Medicare). IF "Standard", use 300% of Medicare.
        3. **ANCILLARY ITEMS**: Price these normally (fair market value + markup). Do not apply the "Inflate" instruction to these unless specifically told to.
           - Labs: $50 - $200
           - Venipuncture: $25 - $45
           - Supplies: $15 - $100
        4. Calculate "Total Charge" (Unit Price * Quantity).
        5. Assign a "Revenue Code" (3-digit or 4-digit) appropriate for the facility type AND the line item type (e.g., 450 for ER, 300 for Labs, 250 for Pharmacy).
        
        **RETURN JSON**:
        {
            "line_items": [
                {
                    "cpt": "99285",
                    "description": "Emergency dept visit...",
                    "rev_code": "0450",
                    "quantity": 1,
                    "unit_price": 1200.00,
                    "total_charge": 1200.00,
                    "date_of_service": "2024-10-15"
                }
            ],
            "total_billed": 1200.00
        }
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const aiData = parseAndValidateJSON(text);

        // Deterministic Recalculation (Sanity Check)
        let runningTotal = 0;
        aiData.line_items.forEach(item => {
            item.total_charge = item.unit_price * item.quantity;
            runningTotal += item.total_charge;
        });
        aiData.total_billed = runningTotal;

        console.log(`[V3 Phase 4] Financial Clerk: Total Bill $${aiData.total_billed}`);
        return aiData;
    } catch (error) {
        console.error("Financial Clerk Failed:", error);
        return {
            line_items: [],
            total_billed: 0.00
        };
    }
}
