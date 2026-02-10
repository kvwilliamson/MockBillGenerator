import { parseAndValidateJSON } from '../utils.js';


/**
 * PHASE 4: THE FINANCIAL CLERK
 * Goal: Apply Pricing and Charges (Hybrid AI/Constraint)
 */
export async function generateFinancialClerk(model, codedServices, scenario, facility, payerType) {
    const prompt = `
        You are "The Financial Clerk". Your goal is to apply PRICING to the generated CPT codes.
        
        **INPUTS**:
        - CPT Codes: ${JSON.stringify(codedServices.cpt_codes)}
        - Facility Type: ${facility.facilityType} (State: ${facility.state})
        - Payer Context: ${payerType}
        
        **STRICT BILLING INSTRUCTIONS (FROM BOSS)**:
        "${scenario.billingInstructions}"
        
        **TASK**:
        1. Assign a "Unit Price" for each CPT code.
        2. **CHARGEMASTER PRICING (PAYER-AWARE)**: 
           - **STEP 1**: Estimate the 'National Average' (Medicare Allowable) for the specific CPT code.
           - **STEP 2**: Determine the **PRICE MULTIPLIER** based on Payer Type:
             * **Self-Pay (Uncontracted)**: Use **3.0x to 5.0x** (Chargemaster Rate). This shows the full "Sticker Price".
             * **Commercial / High-Deductible (Contracted)**: Use **1.5x to 2.0x** (Negotiated Rate). This reflects the discount insurance companies get.
           - **STEP 3**: Apply Multiplier to set the 'Billed Charge'.
           - **PRICING ENTROPY (QUARTER ROUNDING)**: 
             * Do not use flat integers, but don't use random cents like .23 or .12.
             * **Rule**: Apply the Multiplier + Random variation (-5% to +5%).
             * **CRITICAL**: Round the final result to the **NEAREST $0.25**.
             * **Examples**: $384.25, $391.50, $85.75, $100.00. (NEVER $384.23).
           
        3. **ANCILLARY ITEMS**: Use the same Multiplier + Entropy Logic.
           - Labs: Medicare Avg $15 -> Bill $65.43
           - Venipuncture: Medicare Avg $20 -> Bill $85.12
           - Supplies: Mark up 5x cost.
        
        4. Calculate "Total Charge" (Unit Price * Quantity).
        
        5. **REVENUE CODES (SERVICE-SPECIFIC)**:
           - You MUST map the Revenue Code to the **TYPE OF SERVICE**, not just the room.
             * **Laboratory (8xxxx)**: ALWAYS use **0300** (General) or **0301**. NEVER use 0450 for labs.
             * **Radiology (7xxxx)**: ALWAYS use **0320** (X-Ray), **0350** (CT), or **0610** (MRI).
             * **Pharmacy/Meds (Jxxxx)**: ALWAYS use **0250** (Gen Pharm) or **0636** (Drugs requiring detailed coding).
             * **IV Infusion (963xx)**: ALWAYS use **0260** (IV Therapy).
             * **E/M Codes (99xxx)**: THESE are the only codes mapped to the Setting:
               - ER Visit: **0450**
               - Clinic Visit: **0510**
               - Urgent Care: **0456**
           - **CRITICAL**: Do NOT map a Chest X-Ray to "ER Room" (0450). It is "Radiology" (0320).

        6. **PAYER LOGIC (IMPORTANT)**: 
           - **IF Payer is 'Self-Pay'**: 
             * Adjustment = $0.00. (CRITICAL: Show NO discounts).
             * Patient Responsibility = Total Charge. 
             * (Realism: This illustrates the "Hidden Penalty" of being uninsured).
           - **IF Payer is 'Commercial' or 'High-Deductible'**: 
             * Adjustment = 30-50% of Total Charge (Contractual Write-off).
             * Patient Responsibility = Remainder (Co-pay/Deductible).
             
        7. **DESCRIPTION MAPPING**: 
           - Output Field \`description\`: Set this to the Input Field \`billing_description\` (Short/Cryptic).
           - Output Field \`official_description\`: Set this to the Input Field \`official_description\` (Long/Official).

        **RETURN JSON**:
        {
            "line_items": [
                {
                    "cpt": "99285",
                    "description": "HC ED VISIT LVL 5", 
                    "official_description": "Emergency department visit...", 
                    "rev_code": "0450",
                    "quantity": 1,
                    "unit_price": 1200.00,
                    "total_charge": 1200.00,
                    "adjustment": 0.00,
                    "patient_responsibility": 1200.00,
                    "date_of_service": "2024-10-15"
                }
            ],
            "total_billed": 1200.00,
            "total_adjustment": 0.00,
            "total_patient_responsibility": 1200.00
        }
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const aiData = parseAndValidateJSON(text);

        // Deterministic Recalculation (Sanity Check)
        let runningTotal = 0;
        let runningAdj = 0;
        let runningResp = 0;

        aiData.line_items.forEach(item => {
            item.total_charge = item.unit_price * item.quantity;
            // Sanity check patient responsibility
            if (item.patient_responsibility === undefined) {
                item.patient_responsibility = item.total_charge - (item.adjustment || 0);
            }
            runningTotal += item.total_charge;
            runningAdj += (item.adjustment || 0);
            runningResp += item.patient_responsibility;
        });
        aiData.total_billed = runningTotal;
        aiData.total_adjustment = runningAdj;
        aiData.total_patient_responsibility = runningResp;

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
