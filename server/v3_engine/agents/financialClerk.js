import { parseAndValidateJSON } from '../utils.js';

export async function generateFinancialClerk(model, codedServices, scenario, facility, payerType) {
    // DETECT SPLIT VS GLOBAL
    const isSplit = codedServices.facility_codes && codedServices.professional_codes;

    const prompt = `
        You are "The Financial Clerk". Your goal is to apply prices to the generated codes.
        
        **CONTEXT**:
        - Facility: ${facility.name} (${facility.facilityType})
        - Payer: ${payerType}
        - Billing Model: ${isSplit ? "SPLIT BILL (Facility + Pro)" : "GLOBAL BILL"}
        
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
        
        **CRITICAL - SPLIT BILLING**: 
        If Billing Model is SPLIT BILL, you MUST return BOTH "facility_line_items" AND "professional_line_items".
        - **Facility Bill**: Should contain ALL technology, labs, pharmacy, and facility-mode E/M (Modifier -TC).
        - **Professional Bill**: Should contain the Physician's E/M (Modifier -26) and any procedures performed by the doctor.
        - **DESCRIPTION REALISM**: For each item, use the \`billing_description\` provided in the input as the \`description\` for the final bill. DO NOT use the official_description.
        - **NEVER** leave "professional_line_items" empty if "facility_line_items" has an E/M code.
           
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

        // Normalize Output
        if (data.facility_line_items) {
            return {
                type: "SPLIT",
                facility: {
                    line_items: data.facility_line_items,
                    total: data.facility_line_items.reduce((s, i) => s + (i.total_charge || 0), 0)
                },
                professional: {
                    line_items: data.professional_line_items || [],
                    total: (data.professional_line_items || []).reduce((s, i) => s + (i.total_charge || 0), 0)
                }
            };
        } else {
            return {
                type: "GLOBAL",
                line_items: data.line_items || [],
                total_billed: (data.line_items || []).reduce((s, i) => s + (i.total_charge || 0), 0)
            };
        }
    } catch (e) {
        console.error("Financial Clerk Failed", e);
        return { type: "ERROR", line_items: [] };
    }
}
