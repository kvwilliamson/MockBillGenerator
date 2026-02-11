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
        1.  **Facility Fee Pricing (Chargemaster)**:
            -   **E/M Codes (99xxx)**: $2,000 - $5,000 (ER Room Fee).
            -   **Labs/Nursing**: High markup (5x-10x).
            -   **Technical Components (-TC)**: Price at ~80% of Global Fee. (e.g. CT Scan Global $4000 -> TC $3200).
            -   **ENTROPY**: Add random cents (e.g. $485.25).
            
        2.  **Professional Fee Pricing (Doctor's Bill)**:
            -   **E/M Codes (99xxx)**: $200 - $600 (Doctor's Time).
            -   **Professional Components (-26)**: Price at ~20% of Global Fee. (e.g. CT Scan Global $4000 -> 26 $800).
            -   **Surgical**: Standard surgeon fees.
           
        3. **Rev Codes**:
           - **Laboratory (8xxxx)**: ALWAYS use **0300** (General) or **0301**. NEVER use 0450 for labs.
           - **Radiology (7xxxx)**: ALWAYS use **0320** (X-Ray), **0350** (CT), or **0610** (MRI).
           - **Pharmacy/Meds (Jxxxx)**: ALWAYS use **0250** (Gen Pharm) or **0636** (Drugs requiring detailed coding).
           - **IV Infusion (963xx)**: ALWAYS use **0260** (IV Therapy).
           - **E/M Codes (99xxx)**: THESE are the only codes mapped to the Setting:
             - ER Visit: **0450**
             - Clinic Visit: **0510**
             - Urgent Care: **0456**
           
        4. **PAYER LOGIC**: 
           - **IF Payer is 'Self-Pay'**: 
             * Adjustment = $0.00. (CRITICAL: Show NO discounts).
             * Patient Responsibility = Total Charge. 
           - **IF Payer is 'Commercial'**: 
             * Adjustment = 30-50% of Total Charge.
           
        **RETURN JSON**:
        {
            // IF SPLIT:
            "facility_line_items": [
                {
                    "code": "99285",
                    "description": "HC ED VISIT LVL 5",
                    "rev_code": "0450",
                    "quantity": 1,
                    "unit_price": 3500.00,
                    "total_charge": 3500.00
                }
            ],
            "professional_line_items": [
                {
                    "code": "99285",
                    "description": "ED PHYSICIAN VISIT 5",
                    "rev_code": "0981", // Professional revenue code
                    "quantity": 1,
                    "unit_price": 450.00,
                    "total_charge": 450.00
                }
            ],
            
            // IF GLOBAL:
            "line_items": [
                {
                    "code": "99213",
                    "description": "OFFICE VISIT LVL 3",
                    "rev_code": "0510",
                    "quantity": 1,
                    "unit_price": 150.00,
                    "total_charge": 150.00
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
