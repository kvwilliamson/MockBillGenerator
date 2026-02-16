import { parseAndValidateJSON, generateLuhnPaddedNPI, generateRandomEIN, generatePhoneNumber, generateDomain } from '../utils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * PHASE 1: THE FACILITY SCOUT (V2026.3 Capstone)
 * Goal: Anchor to Verified Data (Single Source of Truth).
 */
export async function generateFacilityIdentity(model, specialty, randomSeed) {

    // 1. Try to load Verified Facilities
    let verifiedFacilities = [];
    try {
        const dbPath = path.join(__dirname, '../../data/verified_facilities.json');
        if (fs.existsSync(dbPath)) {
            verifiedFacilities = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        }
    } catch (e) {
        console.warn("[FacilityScout] Failed to load verified DB:", e.message);
    }

    // 2. Select from Verified DB (Priority)
    if (verifiedFacilities.length > 0) {
        // Simple random selection for now, or hash based on seed
        const idx = Math.floor(Math.random() * verifiedFacilities.length);
        const facility = verifiedFacilities[idx];

        console.log(`[V3 Phase 1] Facility Scout: Selected VERIFIED ${facility.name}`);

        // Ensure all fields are present (Data Strengthening)
        return {
            ...facility,
            facilityType: facility.type || "Corporate Hospital",
            billingModel: facility.billing_model || "Split",
            // Remittance fallback if missing in JSON
            remittance: facility.remittance || {
                payee: facility.name,
                address: `PO Box ${Math.floor(Math.random() * 8999) + 1000}`,
                city: facility.city,
                state: facility.state,
                zip: facility.zip
            }
        };
    }

    // 3. Fallback to AI (Legacy Path - Only if DB fails)
    console.log("[V3 Phase 1] Facility Scout: verified_facilities.json empty/missing. Using AI Fallback.");

    const prompt = `
        You are "The Facility Scout". Your task is to select a REAL, EXISTING medical facility in the United States that matches the requested specialty.
        
        **RANDOM SEED**: ${randomSeed}
        **SPECIALTY**: "${specialty}"
        
        **STRICT REALISM RULES**:
        1. Select a random US state and then pick a REAL medical facility within that state.
        2. Provide the EXACT real-world name and physical address.
        3. **GEOGRAPHIC CONSISTENCY**: The ZIP code MUST match the City and State. 
        4. Do NOT provide fake names or placeholders (like "Metropolis General" or "555-XXXX").
        5. If the specialty is "Emergency Medicine", select a real hospital with an ER.
        6. **FACILITY TYPE**: Determine if this is a "Corporate Hospital", an "ASC", or a "Local Private Practice".
        
        **RETURN JSON**:
        {
            "name": "Exact Real Hospital Name",
            "address": "Real Street Address",
            "city": "Real City",
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
        aiData.phone = generatePhoneNumber(aiData.state);
        aiData.domain = generateDomain(aiData.name);

        // Enforce fallback if AI fails to give valid address (Sanity Check)
        if (!aiData.city) aiData.city = "Houston";
        if (!aiData.state) aiData.state = "TX";
        if (!aiData.zip) aiData.zip = "77030";

        // Add Synthetic Remittance for AI data
        aiData.remittance = {
            payee: aiData.name,
            address: `PO Box ${Math.floor(Math.random() * 9000) + 1000}`,
            city: aiData.city,
            state: aiData.state,
            zip: aiData.zip
        };

        console.log(`[V3 Phase 1] Facility Scout: Selected ${aiData.name} (${aiData.city}, ${aiData.state})`);
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
            taxId: generateRandomEIN(),
            remittance: {
                payee: "General Hospital Center",
                address: "PO Box 5555",
                city: "Houston",
                state: "TX",
                zip: "77002"
            }
        };
    }
}
