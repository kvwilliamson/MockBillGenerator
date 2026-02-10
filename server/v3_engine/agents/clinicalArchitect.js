import { parseAndValidateJSON } from '../utils.js';

/**
 * PHASE 2: THE CLINICAL ARCHITECT
 * Goal: Generate the Medical "Truth" (Medical Records & Context)
 */
export async function generateClinicalArchitect(model, scenario, facility) {
    const prompt = `
        You are "The Clinical Architect". Your goal is to generate the CLINICAL TRUTH for a medical encounter.
        
        **CONTEXT**:
        - Facility: ${facility.name} (${facility.city}, ${facility.state})
        - Care Setting: ${scenario.careSetting}
        - Description: ${scenario.description}
        - Narrative Rule: "${scenario.narrative}"
        
        **INSTRUCTIONS**:
        1. Generate a realistic "Patient Name" and "DOB".
        2. Create a **RICH, DETAILED Medical Record** that ALIGNS with the Narrative Rule.
        3. **COMPLEXITY DRIVER**: The narrative must include specific, billable clinical events to make the final bill look realistic.
           - Mention specific medications administered (e.g., "Zofran 4mg IV", "Morphine 2mg").
           - Mention specific labs ordered (e.g., "CBC, CMP, Troponin").
           - Mention specific imaging (e.g., "CXR", "CT Head").
           - Mention specific supplies (e.g., "IV Start Kit", "Laceration Tray").
        4. If the narrative implies valid care, document it fully.
        5. If the narrative implies a gap (e.g., "Short visit billed as high level"), document the *actual* short visit but perhaps include the "padding" items that often accompany such visits to mask the fraud.
        6. Generate the "Chief Complaint" and "Diagnosis" (ICD-10 style description).
        
        **RETURN JSON**:
        {
            "patient": {
                "name": "First Last",
                "dob": "YYYY-MM-DD",
                "gender": "M/F"
            },
            "encounter": {
                "date_of_service": "2024-10-15",
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
