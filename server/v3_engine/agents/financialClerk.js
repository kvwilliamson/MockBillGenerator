import { parseAndValidateJSON } from '../utils.js';

export async function generateFinancialClerk(model, codedServices, scenario, facility, payerType, billingModel, siteOfService) {
    // DETECT SPLIT VS GLOBAL
    const isSplit = codedServices.facility_codes && codedServices.professional_codes;

    const prompt = `
        You are "The Financial Clerk". Your goal is to apply prices to the generated codes.
        
        **CONTEXT**:
        - Facility: ${facility.name} (${facility.facilityType})
        - Payer: ${payerType}
        - SOS: ${siteOfService}
        - Billing Model: ${billingModel}
        
        **INPUT CODES**:
        ${JSON.stringify(codedServices)}
        
        **PRICING RULES**:
        1.  **Pricing is Automatic**: Do not worry about the exact dollar amounts; a deterministic engine will override your prices.
        2.  **Revenue Code Mapping (STRICT)**:
           - **RESPECT INPUT**: If the input code already has a "rev_code", USE IT.
           - **FALLBACK**:
             - Laboratory (8xxxx): **0300** (or 0301/0305/0310 if already assigned)
             - Radiology (7xxxx): **0320** / **0350** / **0610**
             - Cardiology/ECG (93xxx): **0730**
             - Pharmacy/J-codes: **0250**
             - ER Facility: **0450**
             - Professional Fees (Pro Bill): **0960** / **0981**
             - Clinic Facility: **0510**
             - Observation Hourly (G0378): **0762**
             - **SUPPLIES**: NEVER use an E/M code (992xx) for Supplies. Use 99070.
              
        3. **CHARGEMASTER STYLE**: Provide "uneven" unit prices for realism.
        
        **CRITICAL - ELITE SPLITTING RULES**: 
        If Billing Model is SPLIT (or COMPONENT), you MUST return BOTH "facility_line_items" AND "professional_line_items".
        
        1. **Facility Bill (Institutional)**:
           - MUST use Revenue Codes for EVERY line item.
           - Includes: Room/Board, Observation Hours, Trauma Fees, Supplies/Implants, Pharmacy, Tech Components (-TC).
           - **Facility E/M**: Use the appropriate Revenue Code for the **CLAIMED** setting (e.g., 0110 for Inpatient, 0450 for ER).
           - **NEVER** use Modifier -26 on the facility bill.
           - **MANDATORY**: At least ONE facility-tracked service must be here if model is SPLIT.
                   2. **Professional Bill (Physician)**:
           - MUST NOT use Revenue Codes (Exception: 0960/0981 for internal tracking ONLY if needed, but stripped in final).
           - Includes: Physician E/M (99285, 99214, etc.), Surgeon fees, Anesthesia, Interpretations (-26).
           - **NEVER** use institutional Revenue Codes (01xx, 04xx, 02xx) on the professional bill.
           - **MANDATORY**: At least ONE professional-tracked service must be here if model is SPLIT.

        3. **Imaging (COMPONENT Logic)**:
           - If model is COMPONENT, you MUST split Imaging (7xxxx) or Cardiology (93xxx) into Technical (-TC on Facility) and Professional (-26 on Pro).

        4. **Setting-Specific Requirements**:
           - **Inpatient**: If SPLIT, require Rev 010x (Room & Board) on facility.
           - **ER**: If SPLIT, require Rev 045x (ED Facility) on facility.
           - **ASC**: If SPLIT, require OR Rev Codes (036x) and Surgical CPTs.
           - **Observation**: If Observation, require Rev 0762.
           - **ICU**: If ICU, require Rev 020x.

        5. **Global Model Validation**:
           - If billingModel is GLOBAL, return a SINGLE list of "line_items".
           - NO revenue codes, NO -26, and NO -TC allowed in GLOBAL mode.
           
        **RETURN JSON**:
        {
            "facility_line_items": [
                {
                    "code": "99285-TC",
                    "description": "HC ED VISIT LVL 5",
                    "rev_code": "0450",
                    "quantity": 1,
                    "unit_price": 3542.87,
                    "total_charge": 3542.87
                }
            ],
            "professional_line_items": [
                {
                    "code": "99285-26",
                    "description": "ED PHYSICIAN VISIT 5",
                    "rev_code": "0981", 
                    "quantity": 1,
                    "unit_price": 457.12,
                    "total_charge": 457.12
                }
            ]
        }
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const data = parseAndValidateJSON(text);

        console.log(`[V3 Phase 4] Financial Clerk: Priced items. Model: ${isSplit ? "SPLIT" : "GLOBAL"}`);

        // Normalize Output - STRICLY ENFORCE billingModel parameter
        if (billingModel === 'GLOBAL') {
            const allItems = [
                ...(data.line_items || []),
                ...(data.facility_line_items || []),
                ...(data.professional_line_items || [])
            ];
            return {
                type: "GLOBAL",
                line_items: allItems,
                total_billed: allItems.reduce((s, i) => s + (i.total_charge || 0), 0)
            };
        } else {
            return {
                type: "SPLIT",
                facility: {
                    line_items: data.facility_line_items || data.line_items || [],
                    total: (data.facility_line_items || data.line_items || []).reduce((s, i) => s + (i.total_charge || 0), 0)
                },
                professional: {
                    line_items: data.professional_line_items || [],
                    total: (data.professional_line_items || []).reduce((s, i) => s + (i.total_charge || 0), 0)
                }
            };
        }
    } catch (e) {
        console.error("Financial Clerk Failed", e);
        return { type: "ERROR", line_items: [] };
    }
}
