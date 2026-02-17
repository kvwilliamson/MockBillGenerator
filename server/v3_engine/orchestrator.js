
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
export async function generateV3Bill(genAI_Model, scenarioId, payerType = 'Self-Pay', chargeRate = 'FMV', siteOfService = 'HOSPITAL_ED', ownershipType = 'HOSPITAL_OWNED', billingModel = 'SPLIT') {
    console.log(`\n=== STARTING V3 ENGINE (Scenario ID: ${scenarioId}, Payer: ${payerType}) ===`);

    try {
        // 0. Load Scenario Instruction
        const scenario = canonicalInstructions.find(s => s.scenarioId === String(scenarioId));
        if (!scenario) throw new Error(`Scenario ID ${scenarioId} not found in canonical instructions.`);

        const randomSeed = Math.floor(Math.random() * 1000000);

        // PHASE 1: Facility Scout
        const facilityData = await generateFacilityIdentity(genAI_Model, siteOfService, ownershipType, randomSeed);

        // PHASE 2: Clinical Architect
        const clinicalTruth = await generateClinicalArchitect(genAI_Model, scenario, facilityData, siteOfService);

        // PHASE 3: Medical Coder
        const codingResult = await generateMedicalCoder(genAI_Model, clinicalTruth, scenario, siteOfService, billingModel);

        // PHASE 4: Financial Clerk (AI selects codes and revenue codes)
        const financialResult = await generateFinancialClerk(genAI_Model, codingResult, scenario, facilityData, payerType, billingModel, siteOfService);

        // --- PHASE 4.5: Deterministic Pricing Hardening ---
        console.log('[Phase 4.5] Hardening Prices (Deterministic)...');

        // Determine Effective Payer (Chargemaster vs FMV for Self-Pay)
        let effectivePayer = payerType;
        if (payerType === 'Self-Pay') {
            const instructions = (scenario.billingInstructions || "").toLowerCase();
            const forcesChargemaster = instructions.includes("gross charges") ||
                instructions.includes("full list price") ||
                instructions.includes("no discount");

            if (forcesChargemaster || chargeRate === 'CHARGEMASTER') {
                console.log("[Orchestrator] Self-Pay: Using CHARGEMASTER (8.0x) mode.");
                effectivePayer = 'Self-Pay';
                financialResult.appliedPricingMode = 'GROSS';
            } else {
                console.log("[Orchestrator] Self-Pay: Using FMV (AGB/Market) mode.");
                effectivePayer = 'Self-Pay-FMV';
                financialResult.appliedPricingMode = 'AGB';
            }
        }

        const hardenItems = async (items) => {
            if (!items) return [];
            return await Promise.all(items.map(async (item) => {
                const medicareRate = await fetchMedicareRate(genAI_Model, item.code, item.description);
                const modifiers = String(item.code).split('-').slice(1);
                const cityZip = `${facilityData.city} ${facilityData.zip}`;
                let hardenedPrice = calculateBilledPrice(medicareRate, effectivePayer, facilityData.state, cityZip, modifiers);

                // FAILSAFE: If Supplies (99070) came out as $0.00 or too low, force a minimum.
                if (String(item.code).startsWith('99070') && hardenedPrice < 15.00) {
                    console.log(`[Pricing FailSafe] Boosting 99070 from ${hardenedPrice} to $45.00`);
                    hardenedPrice = 45.00;
                }

                return {
                    ...item,
                    unit_price: hardenedPrice,
                    total_charge: parseFloat((hardenedPrice * (item.quantity || 1)).toFixed(2))
                };
            }));
        };

        // --- PHASE 4.X: TEMPORAL CLAMPING (V2026.3) ---
        // Middleware to ensure all dates are strictly within [Admit, Discharge].
        const clampDates = (items, admitDate, dischargeDate) => {
            if (!items || !admitDate) return items;

            // Helper to parse "YYYY-MM-DD"
            const parseD = (d) => new Date(d);
            const fmtD = (d) => d.toISOString().split('T')[0];

            // Phase 14 Hardening: Normalize Admit/Discharge formats
            if (admitDate && admitDate.includes('/')) {
                const p = admitDate.split('/');
                admitDate = `${p[2]}-${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}`;
            }
            if (dischargeDate && dischargeDate.includes('/')) {
                const p = dischargeDate.split('/');
                dischargeDate = `${p[2]}-${p[0].padStart(2, '0')}-${p[1].padStart(2, '0')}`;
            }

            const start = parseD(admitDate);
            const end = dischargeDate ? parseD(dischargeDate) : start;

            return items.map(item => {
                // Force Clean Date Format
                let cleanDate = item.date;
                if (cleanDate && cleanDate.includes('/')) {
                    const parts = cleanDate.split('/');
                    if (parts[2].length === 4) cleanDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
                }

                // If item has no date or invalid, default to Admit Date
                if (!cleanDate) return { ...item, date: admitDate };

                const d = parseD(cleanDate);
                if (isNaN(d.getTime())) return { ...item, date: admitDate };

                if (d < start) {
                    console.log(`[Temporal] Clamping PRE-ADMIT date ${item.date} -> ${admitDate}`);
                    return { ...item, date: admitDate };
                }
                if (d > end) {
                    console.log(`[Temporal] Clamping POST-DISCHARGE date ${item.date} -> ${dischargeDate}`);
                    return { ...item, date: dischargeDate || admitDate };
                }
                return { ...item, date: cleanDate };
            });
        };

        if (financialResult.type === 'SPLIT') {
            financialResult.facility.line_items = await hardenItems(financialResult.facility.line_items);
            financialResult.facility.line_items = clampDates(financialResult.facility.line_items, clinicalTruth.encounter.admission_date, clinicalTruth.encounter.discharge_date);
            financialResult.facility.total = financialResult.facility.line_items.reduce((s, i) => s + i.total_charge, 0);

            financialResult.professional.line_items = await hardenItems(financialResult.professional.line_items);
            financialResult.professional.line_items = clampDates(financialResult.professional.line_items, clinicalTruth.encounter.admission_date, clinicalTruth.encounter.discharge_date);
            financialResult.professional.total = financialResult.professional.line_items.reduce((s, i) => s + i.total_charge, 0);
        } else {
            financialResult.line_items = await hardenItems(financialResult.line_items);
            financialResult.line_items = clampDates(financialResult.line_items, clinicalTruth.encounter.admission_date, clinicalTruth.encounter.discharge_date);

            // --- GLOBAL STRIP (V2026.9) ---
            if (billingModel === 'GLOBAL') {
                financialResult.line_items = financialResult.line_items.map(item => {
                    const newItem = { ...item };
                    delete newItem.rev_code;
                    delete newItem.revCode;
                    if (newItem.code) newItem.code = newItem.code.split('-')[0];
                    return newItem;
                });
            }

            financialResult.total_billed = financialResult.line_items.reduce((s, i) => s + i.total_charge, 0);
        }

        // PHASE 5: Publisher
        let billData = generatePublisher(facilityData, clinicalTruth, codingResult, financialResult, scenario, payerType, siteOfService);

        // PHASE 6: Polish Agent
        billData = await generatePolishAgent(genAI_Model, billData, scenario, siteOfService, billingModel);

        // PHASE 7: Reviewer
        const reviewReport = await generateReviewer(genAI_Model, billData, clinicalTruth, codingResult, scenario, siteOfService, billingModel);

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
