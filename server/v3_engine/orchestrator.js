
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
        const scenario = canonicalInstructions.find(s => s.scenarioId === String(scenarioId));
        if (!scenario) throw new Error(`Scenario ID ${scenarioId} not found in canonical instructions.`);

        const randomSeed = Math.floor(Math.random() * 1000000);
        const facilityData = await generateFacilityIdentity(genAI_Model, siteOfService, ownershipType, randomSeed);
        const clinicalTruth = await generateClinicalArchitect(genAI_Model, scenario, facilityData, siteOfService);
        const codingResult = await generateMedicalCoder(genAI_Model, clinicalTruth, scenario, siteOfService, billingModel);
        const financialResult = await generateFinancialClerk(genAI_Model, codingResult, scenario, facilityData, payerType, billingModel, siteOfService);

        console.log('[Phase 4.5] Hardening Prices (Deterministic)...');

        let effectivePayer = payerType;
        if (payerType === 'Self-Pay') {
            const instructions = (scenario.billingInstructions || "").toLowerCase();
            const forcesChargemaster = instructions.includes("gross charges") ||
                instructions.includes("full list price") ||
                instructions.includes("no discount");

            if (forcesChargemaster || chargeRate === 'CHARGEMASTER') {
                effectivePayer = 'Self-Pay';
                financialResult.appliedPricingMode = 'GROSS';
            } else {
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

                if (String(item.code).startsWith('99070') && hardenedPrice < 15.00) {
                    hardenedPrice = 45.00;
                }

                const finalTotal = parseFloat((hardenedPrice * (item.quantity || 1)).toFixed(2));
                return { ...item, unit_price: hardenedPrice, total_charge: finalTotal };
            }));
        };

        const clampDates = (items, admitDate, dischargeDate) => {
            if (!items || !admitDate) return items;
            const parseD = (d) => new Date(d);
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
                let cleanDate = item.date;
                if (cleanDate && cleanDate.includes('/')) {
                    const parts = cleanDate.split('/');
                    if (parts[2].length === 4) cleanDate = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
                }
                if (!cleanDate) return { ...item, date: admitDate };
                const d = parseD(cleanDate);
                if (isNaN(d.getTime())) return { ...item, date: admitDate };
                if (d < start) return { ...item, date: admitDate };
                if (d > end) return { ...item, date: dischargeDate || admitDate };
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

        let billData = generatePublisher(facilityData, clinicalTruth, codingResult, financialResult, scenario, payerType, siteOfService);
        billData = await generatePolishAgent(genAI_Model, billData, scenario, siteOfService, billingModel);
        const reviewReport = await generateReviewer(genAI_Model, billData, clinicalTruth, codingResult, scenario, siteOfService, billingModel);

        console.log("=== V3 ENGINE COMPLETE ===");

        // --- PHASE 17.1: DEEP REALISM SCRUB (v2026.20) ---
        const deepScrub = (obj, path = 'root') => {
            if (!obj) return obj;
            if (typeof obj === 'string') {
                const patterns = [
                    /FACILITY/gi, /PROFESSIONAL/gi, /TECHNICAL/gi,
                    /PRO\b/gi, /TECH\b/gi, /COMPONENT/gi, /COMP\b/gi,
                    /PHYSICIAN/gi, /PRACTITIONER/gi
                ];
                let d = obj;
                const original = d;
                patterns.forEach(p => { d = d.replace(p, ''); });
                const final = d.replace(/[\-\/]/g, ' ').replace(/\s+/g, ' ').trim();

                if (original !== final && original.length > 0) {
                    console.log(`[DeepScrub] ${path}: "${original}" -> "${final}"`);
                }
                return final;
            }
            if (Array.isArray(obj)) return obj.map((item, i) => deepScrub(item, `${path}[${i}]`));
            if (typeof obj === 'object') {
                const newObj = {};
                for (const key in obj) {
                    // Update: don't scrub keys like 'code' or 'rev_code' or 'billing_description' values that are used as keys
                    newObj[key] = (key === 'code' || key === 'rev_code' || key === 'revCode') ? obj[key] : deepScrub(obj[key], `${path}.${key}`);
                }
                return newObj;
            }
            return obj;
        };

        const finalResult = {
            ...billData,
            review_report: reviewReport,
            clinical_truth: clinicalTruth,
            scenario_meta: scenario
        };

        // Failsafe for Scenario 1
        if (!finalResult.facilityBill && (finalResult.bill_data || (finalResult.professionalBill && finalResult.professionalBill.bill_data))) {
            const fallback = finalResult.bill_data || finalResult.professionalBill.bill_data;
            finalResult.facilityBill = { bill_data: JSON.parse(JSON.stringify(fallback)) };
            console.log("[Orchestrator] Failsafe: Generated facilityBill from fallback.");
        }

        return deepScrub(finalResult);

    } catch (criticalError) {
        console.error("CRITICAL V3 ENGINE FAILURE:", criticalError);
        return {
            mode: "GLOBAL",
            facilityBill: null,
            bill_data: {
                provider: { name: "System Error" },
                lineItems: [{ code: "ERROR", desc: "Configuration Failure - See Logs", total: 0 }],
                grandTotal: 0
            },
            error: criticalError.message
        };
    }
}
