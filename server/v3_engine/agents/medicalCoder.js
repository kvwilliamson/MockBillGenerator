import { parseAndValidateJSON } from '../utils.js';

/**
 * PHASE 3: THE MEDICAL CODER
 * Goal: Apply Codes based on Instructions (Hybrid AI/Constraint)
 */
export async function generateMedicalCoder(model, clinicalTruth, scenario) {
  const prompt = `
        You are "The Medical Coder". Your goal is to assign CPT and ICD codes for a bill.
        
        **INPUTS**:
        - Clinical Record: ${JSON.stringify(clinicalTruth.encounter)}
        - Care Setting: ${scenario.careSetting}
        
        **STRICT CODING INSTRUCTIONS (FROM BOSS)**:
        "${scenario.codingInstructions}"
        
        **TASK**:
        1. Assign ICD-10 Diagnosis Codes based on the clinical record.
           - **DIAGNOSIS REALISM**: For High-Level E/M, use **High-Acuity Diagnoses** relevant to the **Care Setting**. (e.g. Clinic: 'Uncontrolled Chronic Condition'; ER: 'Acute Onset Pain'; Inpatient: 'Systemic Infection').
        
        2. **CORE PROCEDURE**: Assign CPT Procedure Codes based on the **STRICT CODING INSTRUCTIONS**.
           - **BUNDLING RULE (CRITICAL)**: Unless the instructions explicitly say to "Unbundle" or "Explode" a code for the scenario, you must **BUNDLE** standard services according to NCCI edits.
           - **MUTUAL EXCLUSIVITY (NCCI)**: You must select **EXACTLY ONE** E/M Code appropriate for the setting (e.g. 9928x for ER, 9920x/9921x for Clinic, 9922x for Inpatient). NEVER bill multiple E/M codes.
           
        3. **DERIVED SERVICES (AND DENSITY)**: Review the *entire* Clinical Record and assign CPT/HCPCS codes.
           - **ANCILLARY DENSITY (GRAVITY SCORE)**:
             * **Analyze the Scenario Intent**: Is this "Clean" or "Upcoding"?
             * **IF UPCODING (Low Gravity)**: The Goal is to show a mismatch. Generate **ROUTINE/LOW GRAVITY** ancillaries (e.g. basic labs, strep test, urinalysis). Avoid high-tech items like CT/MRI unless strictly necessary.
             * **IF CLEAN (High Gravity)**: The Bill must justify its high level. Generate **HIGH GRAVITY** ancillaries (e.g. CT Scans, IV Meds, Complex panels).
             * *Prompt*: "List 3-5 ancillary services for [Diagnosis] that match a [Gravity Score] acuity level."
           
           - **ANCILLARY RESTRAINT**: Only bill for ancillaries explicitly found in the Clinical Record.
           
           - **CHARGEMASTER NOISE (BLOAT)**: 
             * For High-Level visits, add 1-2 "Administrative" line items (e.g. Supplies, Monitoring) to look "Real".
           
           - **PHARMACY LOGIC (J-CODES)**: If medications are administered, you MUST assign the correct J-Code. 
             * **CRITICAL UNIT LOGIC**: Look up the "billing unit" for the J-Code. Calculate the quantity based on the dose given.
           
           - **FORMATTING RULE**: CPT Codes must be 5-character STRINGS. **NO DECIMALS**. ICD-10 codes DO have decimals.
           - **Goal**: The bill must accurately reflect the *complexity* of the generated clinical story.
        4. **DESCRIPTION FORMAT**: YOU MUST GENERATE TWO DESCRIPTIONS PER CODE.
           - **billing_description**: REAL WORLD CHARGEMASTER STYLE. Short, ALL CAPS, cryptic, max 30 chars.
           - **official_description**: FULL OFFICIAL AMA CPT DESCRIPTION. Must be exact.
           
           **EXAMPLES (FOLLOW THESE EXACTLY)**:
           - 99285:
             * billing: "HC ED VISIT LVL 5"
             * official: "Emergency department visit for the evaluation and management of a patient, which requires these 3 key components: A comprehensive history; A comprehensive examination; and Medical decision making of high complexity."
           - 36415:
             * billing: "VENIPUNCTURE"
             * official: "Collection of venous blood by venipuncture"
           - 85025:
             * billing: "CBC W/DIFF"
             * official: "Blood count; complete (CBC), automated (Hgb, Hct, RBC, WBC and platelet count) and automated differential WBC count"
           - 96360:
             * billing: "IV INFUSION 1 HR"
             * official: "Intravenous infusion, hydration; initial, 31 minutes to 1 hour"
           - J2405:
             * billing: "ONDANSETRON 1MG"
             * official: "Injection, ondansetron hydrochloride, per 1 mg"
           - G0001:
             * billing: "FLU VACCINE ADMIN"
             * official: "Administration of influenza virus vaccine for the prophylaxis of influenza disease (this code is to be used for Medicare billing purposes only)"

        5. Even if the instructions imply fraud (e.g., "Upcode to Level 5"), YOU MUST FOLLOW THEM for the main code. You are simulating the error.
        6. Provide a short "Coding Rationale" for each code.
        
        **RETURN JSON**:
        {
            "icd_codes": [
                { "code": "R07.9", "description": "Chest pain, unspecified" }
            ],
            "cpt_codes": [
                { 
                    "code": "99285", 
                    "billing_description": "HC ED VISIT LVL 5", 
                    "official_description": "Emergency department visit for the evaluation and management of a patient...",
                    "quantity": 1, 
                    "modifier": "", 
                    "type": "CORE" 
                }
            ]
        }
    `;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const aiData = parseAndValidateJSON(text);

    console.log(`[V3 Phase 3] Medical Coder: Assigned ${aiData.cpt_codes.length} services.`);
    return aiData;
  } catch (error) {
    console.error("Medical Coder Failed:", error);
    return {
      icd_codes: [{ code: "R69", description: "Illness, unspecified" }],
      cpt_codes: [{ code: "99213", description: "Office visit", quantity: 1 }]
    };
  }
}
