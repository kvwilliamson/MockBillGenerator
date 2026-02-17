import { parseAndValidateJSON } from '../utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Standard Nomenclature
let STANDARD_NOMENCLATURE = [];
try {
  const dbPath = path.join(__dirname, '../../data/standard_nomenclature.json');
  if (fs.existsSync(dbPath)) {
    STANDARD_NOMENCLATURE = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  }
} catch (e) {
  console.warn("[MedicalCoder] Failed to load nomenclature DB:", e.message);
}

/**
 * PHASE 3: THE MEDICAL CODER
 * Goal: Apply Codes based on Instructions (Hybrid AI/Constraint)
 */
export async function generateMedicalCoder(model, clinicalTruth, scenario, siteOfService, billingModel) {
  // Inject Nomenclature into Prompt context
  const nomenclatureContext = STANDARD_NOMENCLATURE.length > 0
    ? JSON.stringify(STANDARD_NOMENCLATURE.slice(0, 50)) // Passing full list might be too big, pass key examples or rely on post-processing
    : "[]";
  const prompt = `
        You are "The Medical Coder". Your goal is to assign CPT, HCPCS, and ICD codes for a bill.
        
        **INPUTS**:
        - Clinical Record: ${JSON.stringify(clinicalTruth.encounter)}
        - SOS: ${siteOfService}
        
        **STRICT CODING INSTRUCTIONS (FROM BOSS)**:
        "${scenario.codingInstructions}"
        
        **TASK**:
        1. Assign ICD-10 Diagnosis Codes based on the clinical record.
           - **DIAGNOSIS REALISM**: For High-Level E/M, use **High-Acuity Diagnoses** relevant to the **Care Setting**.
        
        2. **CORE PROCEDURE**: Assign CPT Procedure Codes based on the **STRICT CODING INSTRUCTIONS**.
           - **SPLIT BILLING RULE (CRITICAL)**: You are generating the coding truth for a **SPLIT ENVIRONMENT**.
             * **FACILITY TRACK**: Assign CPTs for facility resource use (Room, Nursing, Tech).
             * **PROFESSIONAL TRACK**: Assign CPTs for Physician/Provider time (Interpretations, Surgery, MD E/M).
             * **MANDATORY DUALITY**: For every E/M or Imaging code, you MUST provide BOTH a facility version AND a professional version in their respective arrays.
             * **NO TRIPLE BILLING**: List **ONLY** the Facility/Tech component in the facility array and **ONLY** the Professional component in the professional array.
           
             * **SURGICAL REALISM (v2026.11)**: If OR/Surgery is performed (Rev 036x), you MUST assign:
               - Facility: CPT for the procedure (e.g. 29881) + Anesthesia (00xxx) + Supplies.
               - Professional: CPT for the Surgeon (29881) + Anesthesia (00xxx) + Assistant Surgeon (if needed).
             
           - **BUNDLING RULE (CRITICAL)**: Unless the instructions explicitly say to "Unbundle" or "Explode" a code for the scenario, you must **BUNDLE** standard services according to NCCI edits.
            - **MUTUAL EXCLUSIVITY (NCCI)**: You must select **EXACTLY ONE** E/M Code appropriate for the SOS:
              * **HOSPITAL_ED**: Use 99281-99285 (ED E/M).
              * **HOSPITAL_INPATIENT**: Use 99221-99223 (Initial) or 99231-99233 (Subsequent).
              * **HOSPITAL_OUTPATIENT / INDEPENDENT_OFFICE**: Use 99202-99215 (Clinic E/M).
            - **POST-2023 E/M RULES**: 
              * For Observation stays, you MUST include G0378 (Hourly Observation) with accurate units.
           
        3. **DERIVED SERVICES (AND DENSITY)**: Review the *entire* Clinical Record and assign CPT/HCPCS codes.
           - **ANCILLARY DENSITY (DETERMINISTIC)**:
             * **HIGH-ACUITY ED (99285)**: MUST include at least 4-6 ancillary services (e.g., CT, multiple labs, IV meds).
             * **OBSERVATION (G0378)**: MUST include at least 3 supporting diagnostics/services (Rev 0762). NEVER use 99285 for Observation hours.
             * **INPATIENT ROOM & BOARD**: 
               - Daily Room & Board (Rev 0110-0120) MUST appear **only** when Patient Type = Inpatient.
               - Units MUST match the midnight stays (LOS) in the record.
               - NEVER include inpatient room charges for ED or Observation encounters.
           
           - **LOGICAL PAIRING (REV CODES)**:
             * Lab CPTs (8xxxx) -> **0300**
             * Radiology (7xxxx) -> **0320/0350**
             * Cardiology/ECG (93xxx) -> **0730**
             * Pharmacy/J-codes -> **0250**
             * Observation (G0378) -> **0762**
             * ER Facility -> **0450**
             * Clinic Facility -> **0510**
             * **SETTING SENSITIVITY**: Map the E/M revenue code to the **CLAIMED** care setting:
               - If Scenario/Instructions force Inpatient (9922x) -> Use **011x/012x** (Room & Board).
               - If SOS is ER (9928x) -> Use **0450**.
               - If SOS is Clinic (9920x-9921x) -> Use **0510**.
           
            - **BILLING DESCRIPTION (REALISM)**: You MUST provide two description fields for every service:
              1. **billing_description**: A concise, standard billing shorthand (e.g., "ED FACILITY LVL 5", "CMP", "CBC W/DIFF", "X-RAY CHEST 2VW", "INITIAL HOSP CARE"). This is what the patient sees.
              2. **official_description**: The Verbatim Official AMA CPT/HCPCS Description (for auditing/compliance).
              * **STRICT RULE**: The \`billing_description\` MUST NOT exceed 40 characters and should not contain technical clinical requirements (e.g., no "3 key components required").
            
            - **PHARMACY LOGIC (J-CODES)**: If medications are administered, you MUST assign the correct J-Code with accurate units.
           
            // --- STANDARD NOMENCLATURE VALIDATION (V2026.3 Capstone) ---
            - **NOMENCLATURE MATCHING**: 
              * You MUST resolve every CPT/HCPCS code against the official 2026 descriptor.
              * If a code is in the "Standard Nomenclature" list, use that description EXACTLY.
              * NO PARAPHRASING. 
              * Example: 80053 MUST be "COMPREHENSIVE METABOLIC PANEL".
            
            - **FORMATTING RULE**: CPT Codes must be 5-character STRINGS. **NO DECIMALS**. ICD-10 codes DO have decimals.
        
        4. **ADMINISTRATIVE CODING (CLAIM MODE)**:
           - **Type of Bill (TOB)**: 131 (OP Hospital), 111 (Inpatient).
           - **Admission Type**: 1 (Emergency), 2 (Urgent), 3 (Elective).
           - **Admission Source**: 1 (Non-Healthcare Facility), 7 (ED).
           - **Discharge Status**: 01 (Home), 03 (SNF).
        
        **RETURN JSON**:
        {
            "icd_codes": [
                { "code": "R07.9", "description": "Chest pain, unspecified" }
            ],
            // ADMINISTRATIVE ELEMENTS
            "admin": {
                "tob": "131",
                "admission_type": "1",
                "admission_source": "7",
                "discharge_status": "01"
            },
            // IF SPLIT (Hospital/ER) or COMPONENT:
            "facility_codes": [
                 { "code": "99285", "billing_description": "HC ED VISIT LVL 5", "type": "FACILITY_EM" },
                 { "code": "00840", "billing_description": "ANESTHESIA FACILITY", "type": "FACILITY_SURG" }
            ],
            "professional_codes": [
                 { "code": "99285", "billing_description": "ED PHYSICIAN VISIT 5", "type": "PRO_EM" },
                 { "code": "00840", "billing_description": "ANESTHESIA MD", "type": "PRO_SURG", "quantity": 12 }
            ],
            // IF GLOBAL (Single Bill):
            "line_items": [
                 { "code": "99214", "billing_description": "OFFICE VISIT LVL 4", "official_description": "Office or other outpatient visit..." }
            ]
        }
    `;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.log("[V3 Phase 3] Raw AI Text:", text.substring(0, 500) + "..."); // Validated Log

    const aiData = parseAndValidateJSON(text);

    // Force default if parsing fails but returns partial data
    if (!aiData.cpt_codes && !aiData.facility_codes) {
      throw new Error("Invalid structure returned by Coder");
    }

    // --- CRITICAL CONSTRAINT ENFORCEMENT: MODIFIERS & REV CODE REFINEMENT ---
    if (aiData.facility_codes || aiData.professional_codes) {
      const facCodes = aiData.facility_codes || [];
      const proCodes = aiData.professional_codes || [];

      facCodes.forEach(code => {
        let cpt = code.code || '';

        // 0. PLACEBO SCRUBBING (V2026.9.1)
        if (cpt === '99999' || cpt === 'T1013') {
          if (code.billing_description.toLowerCase().includes('fluids') || code.billing_description.toLowerCase().includes('iv')) {
            code.code = 'J7030';
            code.billing_description = 'NS 1000ML (IV FLUIDS)';
          } else if (code.billing_description.toLowerCase().includes('visit')) {
            code.code = '99285'; // Default to high level if hallucinating
          }
        }
        cpt = code.code;

        // 1. Enforce -TC on Facility E/M and Shared Items
        if ((cpt.startsWith('99') || cpt.startsWith('7') || cpt.startsWith('93')) && !cpt.includes('-')) {
          code.code += '-TC';
        }

        // 2. Granularize Lab Revenue Codes (V2026.4 Expert Realism)
        if (cpt.startsWith('8')) {
          const num = parseInt(cpt.substring(0, 5));
          if (num >= 80000 && num <= 84999) code.rev_code = "0301";
          else if (num >= 85000 && num <= 85999) code.rev_code = "0305";
          else if (num >= 88300 && num <= 88399) code.rev_code = "0310";
          else if (!code.rev_code) code.rev_code = "0300";
        }
      });

      // 3. Enforce -26 on Professional E/M and Shared Items
      proCodes.forEach(code => {
        const cpt = code.code || '';
        if ((cpt.startsWith('99') || cpt.startsWith('7') || cpt.startsWith('93')) && !cpt.includes('-')) {
          code.code += '-26';
        }
        if (!code.rev_code) code.rev_code = "0981"; // Professional Service fallback
      });

      aiData.facility_codes = facCodes;
      aiData.professional_codes = proCodes;
    }

    const count = (aiData.facility_codes?.length || 0) + (aiData.professional_codes?.length || 0) + (aiData.line_items?.length || 0);
    console.log(`[V3 Phase 3] Medical Coder: Assigned ${count} services. Model: ${billingModel}`);
    return aiData;
  } catch (error) {
    console.error("Medical Coder Failed (CRITICAL):", error);
    // EMERGENCY FALLBACK TO PREVENT 500 ERROR
    return {
      icd_codes: [{ code: "R69", description: "Illness, unspecified (Fallback)" }],
      facility_codes: [{ code: "99285", billing_description: "ER VISIT LVL 5", type: "FACILITY_EM", quantity: 1 }],
      professional_codes: [{ code: "99285", billing_description: "ER PHYSICIAN VISIT 5", type: "PRO_EM", quantity: 1 }]
    };
  }
}
