import { parseAndValidateJSON, generateLuhnPaddedNPI, generateRandomEIN } from '../utils.js';

/**
 * PHASE 1: THE FACILITY SCOUT
 * Goal: Establish real-world grounding using V2 Logic.
 */
export async function generateFacilityIdentity(model, specialty, randomSeed) {
    const prompt = `
        You are "The Facility Scout". Your task is to select a REAL, EXISTING medical facility in the United States that matches the requested specialty.
        
        **RANDOM SEED**: ${randomSeed}
        **SPECIALTY**: "${specialty}"
        
        **INSTRUCTIONS**:
        1. Select a random US state and then pick a REAL medical facility within that state.
        2. Provide the EXACT real-world name and physical address.
        3. Do NOT provide fake names or placeholders (like "Metropolis General").
        4. If the specialty is "Emergency Medicine", select a real hospital with an ER.
        5. If the specialty is "Cardiology", select a real heart center or hospital.
        6. **FACILITY TYPE**: Determine if this is a "Corporate Hospital", an "ASC", or a "Local Private Practice".
        
        **RETURN JSON**:
        {
            "name": "Exact Real Hospital Name",
            "address": "Real Street Address",
            "city": "Real City",
            "state": "Real ST",
            "zip": "XXXXX",
            "facilityType": "Corporate Hospital / Private Practice / ASC",
            "state": "Real ST",
            "zip": "XXXXX",
            "facilityType": "Corporate Hospital / Private Practice / ASC",
            "billingModel": "Split / Global" // Hospital = Split. Private Practice = Global.
        }
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const aiData = parseAndValidateJSON(text);

        // HARDENED IDENTIFIERS (JS Deterministic)
        aiData.npi = generateLuhnPaddedNPI();
        aiData.taxId = generateRandomEIN();

        // Enforce fallback if AI fails to give valid address (Sanity Check)
        if (!aiData.city) aiData.city = "Anytown";
        if (!aiData.state) aiData.state = "TX";

        console.log(`[V3 Phase 1] Facility Scout: Selected ${aiData.name}`);
        return aiData;
    } catch (error) {
        console.error("Facility Scout Failed:", error);
        // Fallback for extreme failure
        return {
            name: "General Hospital Center",
            address: "123 Medical Way",
            city: "Houston",
            state: "TX",
            zip: "77002",
            facilityType: "Corporate Hospital",
            npi: generateLuhnPaddedNPI(),
            taxId: generateRandomEIN()
        };
    }
}
