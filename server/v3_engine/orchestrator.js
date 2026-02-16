
import { generateFacilityIdentity } from './agents/facilityScout.js';
import { generateClinicalArchitect } from './agents/clinicalArchitect.js';
import { generateMedicalCoder } from './agents/medicalCoder.js';
import { generateFinancialClerk } from './agents/financialClerk.js';
import { generatePublisher } from './agents/publisher.js';
import { generatePolishAgent } from './agents/polishAgent.js';
import { generateReviewer } from './agents/reviewer.js';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const canonicalInstructions = require('../data/canonical_instructions.json');
import { fetchMedicareRate, calculateBilledPrice } from '../pricing_core.js';

/**
 * V3 ENGINE ORCHESTRATOR
 */
export async function generateV3Bill(genAI_Model, scenarioId, payerType = 'Self-Pay') {
    console.log(`\n=== STARTING V3 ENGINE (Scenario ID: ${scenarioId}, Payer: ${payerType}) ===`);

    try {
        // 0. Load Scenario Instruction
        const scenario = canonicalInstructions.find(s => s.scenarioId === String(scenarioId));
        if (!scenario) throw new Error(`Scenario ID ${scenarioId} not found in canonical instructions.`);

        const randomSeed = Math.floor(Math.random() * 1000000);

        // PHASE 1: Facility Scout
        const facilityData = await generateFacilityIdentity(genAI_Model, scenario.careSetting, randomSeed);

        // PHASE 2: Clinical Architect
        const clinicalTruth = await generateClinicalArchitect(genAI_Model, scenario, facilityData);

        // PHASE 3: Medical Coder
        const codingResult = await generateMedicalCoder(genAI_Model, clinicalTruth, scenario);

        // PHASE 4: Financial Clerk (AI selects codes and revenue codes)
        const financialResult = await generateFinancialClerk(genAI_Model, codingResult, scenario, facilityData, payerType);

        // --- PHASE 4.5: Deterministic Pricing Hardening ---
        console.log('[Phase 4.5] Hardening Prices (Deterministic)...');
        const hardenItems = async (items) => {
            if (!items) return [];
            return await Promise.all(items.map(async (item) => {
                const medicareRate = await fetchMedicareRate(genAI_Model, item.code, item.description);
                const modifiers = String(item.code).split('-').slice(1);
                const cityZip = `${facilityData.city} ${facilityData.zip}`;
                const hardenedPrice = calculateBilledPrice(medicareRate, payerType, facilityData.state, cityZip, modifiers);

                return {
                    ...item,
                    unit_price: hardenedPrice,
                    total_charge: parseFloat((hardenedPrice * (item.quantity || 1)).toFixed(2))
                };
            }));
        };

        if (financialResult.type === 'SPLIT') {
            financialResult.facility.line_items = await hardenItems(financialResult.facility.line_items);
            financialResult.facility.total = financialResult.facility.line_items.reduce((s, i) => s + i.total_charge, 0);

            financialResult.professional.line_items = await hardenItems(financialResult.professional.line_items);
            financialResult.professional.total = financialResult.professional.line_items.reduce((s, i) => s + i.total_charge, 0);
        } else {
            financialResult.line_items = await hardenItems(financialResult.line_items);
            financialResult.total_billed = financialResult.line_items.reduce((s, i) => s + i.total_charge, 0);
        }

        // PHASE 5: Publisher
        let billData = generatePublisher(facilityData, clinicalTruth, codingResult, financialResult, scenario, payerType);

        // PHASE 6: Polish Agent
        billData = await generatePolishAgent(genAI_Model, billData, scenario);

        // PHASE 7: Reviewer
        const reviewReport = await generateReviewer(genAI_Model, billData, clinicalTruth, codingResult, scenario);

        console.log("=== V3 ENGINE COMPLETE ===");

        return {
            ...billData, // Spread: mode, facilityBill, professionalBill, (or bill_data if legacy)
            review_report: reviewReport,
            clinical_truth: clinicalTruth,
            scenario_meta: scenario
        };
    } catch (criticalError) {
        console.error("CRITICAL V3 ENGINE FAILURE:", criticalError);
        return {
            mode: "GLOBAL",
            facilityBill: null, // UI will handle this gracefully hopefully, or show error
            bill_data: {
                provider: { name: "System Error" },
                lineItems: [{ code: "ERROR", desc: "Configuration Failure - See Logs", total: 0 }],
                grandTotal: 0
            },
            error: criticalError.message
        };
    }
}
