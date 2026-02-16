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
        
        **PRICING RULES (DETERMINISTIC)**:
        1.  **Pricing is Automatic**: Do not worry about the exact dollar amounts; a deterministic engine will override your prices using Medicare rates * Multipliers.
        2.  **Revenue Code Mapping (STRICT)**:
           - Laboratory (8xxxx): **0300**
           - Radiology (7xxxx): **0320** / **0350** / **0610**
           - Cardiology/ECG (93xxx): **0730**
           - Pharmacy/J-codes: **0250**
           - ER Facility: **0450**
           - Clinic Facility: **0510**
           - Observation Hourly (G0378): **0762**
           - **CRITICAL**: If you see TWO E/M codes (e.g. 99285 AND 99285), REMOVE ONE. 
           - **SUPPLIES**: NEVER use an E/M code (992xx) for Supplies. Use 99070 or specific HCPCS codes (Axxxx, Cxxxx).
           - Inpatient Room (Rev 0110-0120): **Conditional on Inpatient Status**
             
        3. **CHARGEMASTER STYLE**: Provide "uneven" unit prices (e.g., $154.23 instead of $150.00) to increase realism.
           
        **RETURN JSON**:
        {
            // IF SPLIT:
            "facility_line_items": [
                {
                    "code": "99285",
                    "description": "HC ED VISIT LVL 5",
                    "rev_code": "0450",
                    "quantity": 1,
                    "unit_price": 3542.87,
                    "total_charge": 3542.87
                }
            ],
            "professional_line_items": [
                {
                    "code": "99285",
                    "description": "ED PHYSICIAN VISIT 5",
                    "rev_code": "0981", 
                    "quantity": 1,
                    "unit_price": 457.12,
                    "total_charge": 457.12
                }
            ],
            
            // IF GLOBAL:
            "line_items": [
                {
                    "code": "99213",
                    "description": "OFFICE VISIT LVL 3",
                    "rev_code": "0510",
                    "quantity": 1,
                    "unit_price": 154.23,
                    "total_charge": 154.23
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
