import { parseAndValidateJSON } from '../utils.js';

/**
 * PHASE 2: THE CLINICAL ARCHITECT
 * Goal: Generate the Medical "Truth" (Medical Records & Context)
 */
export async function generateClinicalArchitect(model, scenario, facility, siteOfService) {
    const prompt = `
        You are "The Clinical Architect". Your goal is to generate the CLINICAL TRUTH for a medical encounter.
        
        **CONTEXT**:
        - Facility: ${facility.name} (${facility.city}, ${facility.state})
        - SOS: ${siteOfService}
        - Description: ${scenario.description}
        - Narrative Rule: "${scenario.narrative}"
        
        **INSTRUCTIONS**:
        1. Generate a realistic "Patient Name" and "DOB".
        2. Create a **RICH, DETAILED Medical Record** that ALIGNS with the Narrative Rule.
        3. **COMPLEXITY DRIVER (THE PATHWAY)**: 
           - **ACUTE FINDINGS**: If the Narrative Rule implies a minor condition, you MUST generate **LOW ACUITY** acute findings (Stable Vitals, Happy/Comfortable). 
             * Do NOT generate high-acuity interventions just to match a high billing code. 
             * The "Upcoding" error relies on the mismatch between the *Boring Record* and the *Expensive Code*.
           
           - **HISTORICAL COMPLEXITY (RED HERRINGS)**:
             * To make High-Level coding look plausible (even if incorrect), ALWAYS include 1-2 "Risk Factors" or "History" items in the HPI/Past Medical History.
             * **CRITICAL**: These are *historical* factors, not acute problems. The patient should be currently stable.

        4. If the narrative implies valid care, document it fully.
        4. If the narrative implies valid care, document it fully.
        5. If the narrative implies a gap (e.g., "Short visit billed as high level"), document the *actual* short visit but perhaps include the "padding" items that often accompany such visits to mask the fraud.
        6. Generate the "Chief Complaint" and "Diagnosis" (ICD-10 style description).
        
        **RETURN JSON**:
        {
            "patient": {
                "name": "First Last",
                "dob": "YYYY-MM-DD",
                "gender": "M/F",
                "address": "Real Street Address",
                "city": "Real City",
                "state": "Real ST",
                "zip": "XXXXX"
            },
            "encounter": {
                "date_of_service": "${new Date().toISOString().split('T')[0]}",
                "chief_complaint": "...",
                "hpi": "History of Present Illness...",
                "exam_notes": "Physical exam findings...",
                "diagnosis_narrative": "...",
                "plan": "..."
            }
        }
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const aiData = parseAndValidateJSON(text);

        console.log(`[V3 Phase 2] Clinical Architect: Generated record for ${aiData.patient.name}`);
        return aiData;
    } catch (error) {
        console.error("Clinical Architect Failed:", error);
        // Fallback
        return {
            patient: { name: "John Doe", dob: "1980-01-01", gender: "M" },
            encounter: {
                chief_complaint: "General Pain",
                hpi: "Patient reports pain.",
                exam_notes: "Vitals stable.",
                diagnosis_narrative: "General pain",
                plan: "Monitor."
            }
        };
    }
}
