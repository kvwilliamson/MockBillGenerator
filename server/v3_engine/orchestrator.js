
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

/**
 * V3 ENGINE ORCHESTRATOR
 */
export async function generateV3Bill(genAI_Model, scenarioId) {
    console.log(`\n=== STARTING V3 ENGINE (Scenario ID: ${scenarioId}) ===`);

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

    // PHASE 4: Financial Clerk
    const financialResult = await generateFinancialClerk(genAI_Model, codingResult, scenario, facilityData);

    // PHASE 5: Publisher
    let billData = generatePublisher(facilityData, clinicalTruth, codingResult, financialResult, scenario);

    // PHASE 6: Polish Agent
    billData = await generatePolishAgent(genAI_Model, billData, scenario);

    // PHASE 7: Reviewer
    const reviewReport = await generateReviewer(genAI_Model, billData, clinicalTruth, codingResult, scenario);

    console.log("=== V3 ENGINE COMPLETE ===");

    return {
        bill_data: billData.bill_data,
        review_report: reviewReport,
        clinical_truth: clinicalTruth, // Optional: return for frontend display if needed
        scenario_meta: scenario
    };
}
