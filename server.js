// server.js - Mock Bill Generator Backend
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import puppeteer from 'puppeteer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { runDeepDiveAudit } from './guardians/orchestrator.js';
import {
    STATE_Z_FACTORS,
    PAYER_MULTIPLIERS,
    isMajorMetro,
    fetchMedicareRate,
    calculateBilledPrice,
    getBasePrice
} from './server/pricing_core.js';


// Load local ENV
dotenv.config();

const ERROR_DESCRIPTIONS = {
    "CLEAN": "The charges and quantities on the bill perfectly match the services the patient actually received.",
    "DUPLICATE": "The exact same service, medication, or supply appears multiple times on the bill for the same day.",
    "QTY_ERROR": "The bill lists an impossible volume of supplies, such as being charged for 100 pairs of gloves for one nurse visit.",
    "UPCODING": "The patient is billed for a more complex and expensive version of a service than the one actually performed.",
    "UNBUNDLING": "A single procedure is broken into smaller parts and billed separately to increase the total cost.",
    "MISSING_MODIFIER": "The absence of a specific code prevents a standard discount from being applied to a secondary procedure.",
    "MODIFIER_CONFLICT": "Incompatible codes are used together, which prevents the system from automatically discounting related procedures.",
    "GLOBAL_PERIOD_VIOLATION": "The patient is billed for a follow-up visit that should have been included for free in the 'package price' of a previous surgery.",
    "PHANTOM_BILLING": "The patient is charged for medications, equipment, or tests that were never ordered or administered.",
    "RECORD_MISMATCH": "The itemized bill shows services that do not exist anywhere in the patient's actual clinical medical records.",
    "TIME_LIMIT": "The patient is billed for more units of time than the patient actually spent in the session.",
    "WRONG_PLACE_OF_SERVICE": "A simple office visit is billed as a 'Hospital Outpatient' service to trigger much higher facility fees.",
    "REVENUE_CODE_MISMATCH": "An incorrect department code is used to classify a cheap item into a more expensive billing category.",
    "NO_SURPRISES_VIOLATION": "The patient is illegally billed for the 'remainder' of a balance after insurance has already paid for an out-of-network emergency.",
    "CMS_BENCHMARK": "The facility is charging a rate that is significantly higher than the fair market price established by Medicare.",
    "DRG_OUTLIER": "The hospital claims the patient's case was 'exceptionally difficult' to trigger a massive add-on fee above the standard rate.",
    "MED_NECESSITY_FAIL": "The patient is forced to pay out-of-pocket because the provider performed a service that insurance considers elective or unnecessary.",
    "QUANTITY_LIMIT": "The patient is billed for more doses of a drug or units of service than is medically safe or allowed per day.",
    "MATH_ERROR": "The 'Total' column for a line item is higher than the 'Quantity' multiplied by the 'Unit Price.'",
    "BALANCE_MISMATCH": "The math on the summary page is wrong, showing a balance due that is higher than the charges minus payments.",
    "GHOST_PROVIDER": "The bill lists a provider the patient never saw or an ID number for someone who is no longer practicing.",
    "NPI_INACTIVE": "The patient is being billed by a provider who does not have a valid, active license to practice or bill insurance.",
    "IMPOSSIBLE_DATE": "The bill includes charges for dates before the patient was admitted or after the patient was discharged."
};

const app = express();
const PORT = 4000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Use the fallback model if deep analysis isn't behaving, but User requested Deep Analysis model var.
// Note: 'gemini-2.5-flash-lite' string might need validation against library versions, but we use what's in env.
const MODEL_NAME = process.env.AI_MODEL_DEEP_ANALYSIS || 'gemini-1.5-flash';

console.log(`[Server] Using AI Model: ${MODEL_NAME}`);

// --- HELPERS: Pricing & Coding Baselines (MIGRATED TO pricing_core.js) ---

import { generateV3Bill } from './server/v3_engine/orchestrator.js';

// --- CONSTANTS ---

// --- AGENT 1: THE WRITER (Generation Pass) ---
async function generateDraftBill(params) {
    const { specialty, errorType, complexity, payerType } = params;
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
        You are an expert Medical Biller (The Writer).
        Generate a DRAFT Hospital Bill JSON for a patient in **${specialty}**.
        Complexity: ${complexity} | Payer: ${payerType}.
        
        **GOAL**: Create realistic, messy raw data. Don't worry about perfect consistency yet (The Auditor will fix that).
        
        **PAYER PROFILES**:
        - **Commercial**: Standard Insurance. Adjustments ~50%.
        - **High-Deductible**: Insurance Paid = $0.00. Patient Balance = High.
        - **Self-Pay**: Insurance Paid = $0.00. (Initial Bill: No discounts applied yet).
        - **Medicare**: High Adjustments. Low Patient Balance.
        
        **INSTRUCTION PRIORITY ORDER**:
        1. **COMPLEXITY (HIGHEST PRIORITY)**:
           - **IF COMPLEXITY = "Low"**:
             - **SETTING**: MUST be Outpatient / Clinic / Urgent Care.
             - **DURATION**: Single Date of Service (Statement Date = Date of Service).
             - **CODES**: Office Visits (99203-99214), Urgent Care (S9083).
             - **NO Room & Board**. NO Inpatient codes (9922x).
             - **VOLUME**: 3-5 line items max.
             - **Scenario**: A simple checkup, minor procedure, or follow-up.
             - **CRITICAL - IF ErrorType is UPCODING**:
               - Use **99285** (ED Level 5) or **99205/99215** (High Level Clinic).
               - BUT keep the diagnosis simple (e.g. Cough, Rash) to ensure the mismatch is obvious.

           - **IF COMPLEXITY = "High"**:
             - **SETTING**: MUST be Inpatient Hospital.
             - **DURATION**: Multi-day stay (3-5 days).
             - **CODES**: Initial Hospital (9922x) -> Subsequent (9923x).
        ** INSTRUCTIONS **:
        1.  ** CLINICAL ALIGNMENT **: Every code MUST be directly supported by the visit note.
        2.  ** CASE STUDY **: If a patient has a simple sore throat (Pharyngitis J02.9) and is stable, do NOT use 99213/99283 unless there's a specific complication. Use 99212/99282.
            - If ${errorType} === 'UPCODING': You MUST intentionally select a code exactly ONE or TWO levels higher than supported (e.g., use 99215 for a Level 2 encounter). 
            - If ${errorType} === 'DUPLICATE': You MUST repeat one of the service line items (e.g., bill for the same Lab test twice on the same date).
            - If ${errorType} === 'PHANTOM_BILLING': Add a line item for a high-cost service (e.g., CT Scan) that is NOT mentioned in the clinical scenario.
            - If ${errorType} === 'CLEAN': Be extremely conservative. Do not upcode!
        4.  ** NO "AI TELLS" **: Do not use perfectly rounded quantities like 10.0 or prices. Use messy, realistic billing codes.

        RETURN JSON: { "bill_data": { ...standard structure... } }
    `;

    // We reuse the standard prompt structure but simplify the "Writer" instructions to focus on creativity
    // reusing the strict rules from before but framing it as "Drafting"
    // For brevity in this refactor, I will inline the full prompt construction in the main flow or keep it robust here.

    // Let's use a robust Writer Prompt based on our previous success
    let fullPrompt = `
        You are "The Writer", an expert Medical Biller.
        Generate a DRAFT Hospital Bill JSON for a patient in **${specialty}**.
        Complexity: ${complexity}.
        Payer Type: **${payerType}**.
        
        **STRICT REALISM RULES**:
        1. **LANGUAGE**: English Only.
        2. **FINANCIALS**: Use irregualar pricing (e.g. $153.42).
        3. **CODES**: Match the specialty.
        4. **SCENARIO**: ${errorType}
           - **DEFINITION**: "${ERROR_DESCRIPTIONS[errorType] || 'Standard Bill'}"
           - If ${errorType} != CLEAN, try to inject the error logic now.
        
        RETURN JSON with this structure:
        {
            "bill_data": {
                "provider": "Hospital Name",
                "npi": "10-digit NPI",
                "taxId": "XX-XXXXXXX",
                "statementId": "Unique String",
                "statementDate": "MM/DD/YYYY",
                "dueDate": "MM/DD/YYYY",
                "accountNumber": "String",
                "tob": "3-digit Code",
                "patientName": "Realistic Name",
                "patientDOB": "MM/DD/YYYY",
                "admissionDate": "MM/DD/YYYY",
                "admissionTime": "HH:MM",
                "dischargeDate": "MM/DD/YYYY",
                "dischargeTime": "HH:MM",
                "attendingPhysician": "Name, MD",
                "attendingNpi": "10-digit NPI",
                "icd10": "Primary Code + Description, Secondary...",
                "insurance": "Payer Name",
                "insuranceStatus": "Status",
                "lineItems": [
                    { 
                        "date": "MM/DD/YYYY", 
                        "revCode": "0450", 
                        "code": "CPT/HCPCS", 
                        "modifier": "",
                        "description": "Standard Descriptor", 
                        "qty": Number, 
                        "unitPrice": Number, 
                        "total": Number 
                    }
                ],
                "subtotal": Number,
                "subtotal": Number,
                "adjustmentsBreakdown": [ { "label": "String (e.g. 'Contractual Adj')", "amount": Number } ],
                "adjustments": Number,
                "insPaid": Number,
                "grandTotal": Number
            }
        }
        
        **CRITICAL REALISM RULE**:
        - NEVER use the word "Error", "Upcoding", "Unbundling" or "Audit" in the "adjustmentsBreakdown" labels.
        - If you need to lower the price, use "Contractual Adjustment" or "Charity Care".
        - If the scenario is "UPCODING", DO NOT add an adjustment to fix it. Just bill the higher code!
    `;

    const result = await model.generateContent(fullPrompt);
    const text = result.response.text();
    // CLEANUP: Ensure no markdown formatting
    let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return parseAndValidateJSON(cleanText);
}

// --- AGENT 2: THE AUDITOR (Validation Pass) ---
async function auditAndFinalizeBill(draftBill, params) {
    const { specialty, errorType, complexity, payerType } = params;
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
        You are "The Auditor", a Senior Medical Code Auditor.
        Review the following DRAFT BILL generated by a junior biller (The Writer).
        
        **CONTEXT**:
        - Specialty: ${specialty}
        - Intended Scenario: **${errorType}**
        - Definition: "${ERROR_DESCRIPTIONS[errorType] || 'Standard'}"
        - Payer: ${payerType}
        - Complexity: ${complexity}

         **YOUR TASKS**:
        **YOUR TASKS**:
        1. **CONSISTENCY CHECK**: 
           - Ensure descriptions match CPT codes exactly. (e.g. If code is 99285, description MUST be "ED VISIT LEVEL 5").
           - **REVENUE CODES**: Align strictly. 0450=ER, 0300=Lab, 0250=Pharm, 0110-0120=Room & Board.
           - **E/M ALIGNMENT**:
             - **99281-99285 (ER)**: MUST use Rev Code **0450**.
             - **99202-99215 (Clinic)**: MUST use Rev Code **0510** (Clinic).
             - **99221-99233 (Inpatient)**: If strictly room charge, use 0110-0120. If Pro Fee, use **0987**.
             - **NEVER** use 0270 (Supplies) or 01xx (Room) for E/M codes unless specifically bundling.
           - **PATIENT PROFILE SYNC**: 
             - Check DOB vs CPT Code. If patient is >18, REMOVE pediatric codes (e.g. "younger than 5 years").
             - Check Gender. If Male, remove Gynecological/Obstetric codes.
           - **CRITICAL**: Do NOT allow Rev 01xx (Room & Board) for Outpatient/ER codes (9928x) unless ErrorType is specifically "REVENUE_CODE_MISMATCH".
           - **PLACE OF SERVICE (TOB CHECK)**: 
             - If TOB starts with "1" (e.g. 111, 121 - Hospital Inpatient), **STRICTLY BAN** Office Codes (99202-99215, 99051). MUST use 9922x-9923x.
             - If TOB starts with "13" (e.g. 131 - Hospital Outpatient), **STRICTLY BAN** Inpatient Codes (9922x). MUST use 9928x, G0463.
             - **Correction**: If found, swap 99051 for 9928x (ER) or G0463 (Clinic).
           - **COMPLEXITY ENFORCEMENT (HARD RULES)**:
             - If Complexity is "Low": 
               - **DURATION**: MUST be Single Day (Admit Date = Discharge Date).
               - **VOLUME**: Single E/M Code. REMOVE subsequent daily visit codes.
               - **SETTING**: If Specialty is "Internal Medicine" or "Family Practice", use **Rev Code 0510** (Clinic). DO NOT USE 0450 (ER).
             - If Complexity is "High": ENSURE Multi-day stay. ENSURE Inpatient codes.
        2. **LOGIC VERIFICATION ("THE GOTCHA" CHECK)**: 
           - **CRITICAL**: Check the 'errorType': **"${errorType}"**.
           - If errorType is NOT 'CLEAN', **DO NOT FIX** the specific error requested! You MUST PRESERVE the mismatch.
           - **UPCODING**: Ensure CPT is 1 level higher than supported.
           - **DUPLICATE**: Repeat one line item twice.
           - **PHANTOM_BILLING**: Add an unrelated expensive service.
           - If errorType is 'CLEAN', then fix ALL errors to make it perfect.
        3. **PAYER ENFORCEMENT**:
           - If Payer is "High-Deductible", FORCE 'insPaid' to 0 and 'grandTotal' to be high.
           - If Payer is "Self-Pay", FORCE 'insPaid' to 0.
        4. **DESCRIPTION POLISH**:
           - **LENGTH**: Limit descriptions to 40-60 characters max.
           - **ABBREVIATIONS**: Use standard abbreviations (e.g. "E/M" for Evaluation and Management, "w/o" for without).
           - **CLEAN**: Remove technical criteria like "Medical Decision Making" or "High Complexity". Patients don't see that.
           - Example: Instead of "Emergency Dept Visit for the Evaluation and Management of a Patient High Complexity", use "ED VISIT LEVEL 5".
        5. **FINALIZE GROUND TRUTH**:
           - **Actual Value**: MUST match exactly what is in the 'lineItems' array of this JSON.
           - **Expected Value**: What SHOULD have been there (The Correct Code/Price).
           - **Explanation**: Explain exactly what is wrong.

        **DRAFT BILL JSON**:
        ${JSON.stringify(draftBill)}

        RETURN FINAL JSON with the exact same structure as the draft, but with corrections applied, AND adding the "ground_truth" object.
        {
            "bill_data": { ...corrected bill data... },
            "ground_truth": {
                "error_type": "${errorType}",
                "offending_line_indices": [Number], 
                "explanation": "Detailed auditor explanation of the error (or 'None' if Clean).",
                "expected_value": "Value if it were correct",
                "actual_value": "Value on the bill"
            }
        }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const cleanText = text.replace(/[^\x00-\x7F]/g, "");
    return parseAndValidateJSON(cleanText);
}

// Main Route
app.post('/generate-data', async (req, res) => {
    try {
        const { specialty, errorType, complexity, payerType = 'Commercial' } = req.body;
        console.log(`[Flow] Starting Dual-Pass Generation: ${specialty} | ${payerType} | ${errorType}`);

        // Step 1: The Writer
        console.log('[Agent 1] The Writer is drafting...');
        const draftData = await generateDraftBill({ specialty, errorType, complexity, payerType });
        console.log('[Agent 1] Draft Complete.');

        // Step 2: The Auditor
        console.log('[Agent 2] The Auditor is reviewing...');
        const finalizedData = await auditAndFinalizeBill(draftData, { specialty, errorType, complexity, payerType });
        console.log('[Agent 2] Audit Complete.');

        // --- AGENT 7: THE COMPLIANCE SENTINEL (The Enforcer) ---
        console.log('[Agent 7] Sentinel is verifying enforcement...');
        const enforcedData = await runComplianceSentinel(finalizedData, errorType);

        // --- HARD CONSTRAINT ENFORCER (Deterministic Logic) ---
        // This runs AFTER the Sentinel to ensure basics are still valid (dates, complexity)
        let data = enforcedData;

        if (complexity === 'Low') {
            console.log('[Enforcer] Applying Low Complexity Hard Constraints...');
            const bill = data.bill_data;

            // 1. Force Single Day Duration
            bill.dischargeDate = bill.admissionDate;

            // 2. Filter Multi-Day Lines with Index Tracking
            // We need to track how indices shift so we can update the Ground Truth later.
            const indexMap = new Map(); // Old Index -> New Index (or -1 if deleted)

            if (bill.lineItems && bill.lineItems.length > 0) {
                let emCodeCount = 0;
                const keptLines = [];

                bill.lineItems.forEach((item, oldIndex) => {
                    let keep = true;

                    // Logic: Keep only one E/M (UNLESS Duplicate error)
                    const isEM = item.code.startsWith('992') || item.code.startsWith('G0');
                    if (isEM && errorType !== 'DUPLICATE') {
                        emCodeCount++;
                        if (emCodeCount > 1) {
                            console.log(`[Enforcer] Removing extra E/M Code at original index ${oldIndex}: ${item.code}`);
                            keep = false;
                        }
                    }

                    if (keep) {
                        // Force date sync (UNLESS we specifically want an Impossible Date)
                        if (errorType !== 'IMPOSSIBLE_DATE') {
                            item.date = bill.admissionDate;
                        }
                        // Map old index to new index
                        indexMap.set(oldIndex, keptLines.length);
                        keptLines.push(item);
                    } else {
                        indexMap.set(oldIndex, -1); // Mark as deleted
                    }
                });

                bill.lineItems = keptLines;
            }

            // 3. Force Clinic Rev Codes for Internal Medicine / Family Practice
            const isClinicSpecialty = specialty.includes('Internal') || specialty.includes('Family') || specialty.includes('General');
            if (isClinicSpecialty && errorType !== 'WRONG_PLACE_OF_SERVICE' && errorType !== 'REVENUE_CODE_MISMATCH') {
                bill.lineItems.forEach(item => {
                    const isEM = item.code.startsWith('992');

                    // Detect ER Codes (9928x) in Clinic Setting
                    if (item.code.match(/9928[1-5]/)) {
                        console.log(`[Enforcer] Swapping ER Code ${item.code} -> 99214 (Clinic Visit)`);
                        item.code = '99214';
                        item.description = 'OFFICE/OUTPATIENT VISIT EST';
                        item.revCode = '0510';
                    }

                    // Ensure Rev Code is 0510 for any E/M
                    if (isEM && item.revCode === '0450') {
                        console.log(`[Enforcer] Swapping ER Rev Code 0450 -> 0510 (Clinic)`);
                        item.revCode = '0510';
                    }

                    // X-Ray (7xxxx) -> Rev 0320 (DX X-Ray) - Standard for Clinics
                    // Loosened check: Starts with 7, ignore length check to catch modifiers, ignore current revCode to catch bad assignments (like 0250)
                    if (item.code.startsWith('7')) {
                        if (item.revCode !== '0320') {
                            console.log(`[Enforcer] Swapping X-Ray Rev Code ${item.revCode} -> 0320`);
                            item.revCode = '0320';
                        }
                    }

                    // Lab (8xxxx) -> Rev 0300 (Lab)
                    if (item.code.startsWith('8')) {
                        if (item.revCode !== '0300') {
                            console.log(`[Enforcer] Swapping Lab Rev Code ${item.revCode} -> 0300`);
                            item.revCode = '0300';
                        }
                    }
                });

                // Ensure TOB is not Inpatient (111) -> Set to Clinic (131) if needed
                if (bill.tob && bill.tob.startsWith('11')) {
                    bill.tob = '131';
                }
            }
        }

        // --- GROUND TRUTH SYNC (Phase 3 Fix) ---
        // Ensuring the 'actual_value' in the JSON matches the final physical bill table, strictly accounting for re-indexing.
        if (data.ground_truth && data.ground_truth.offending_line_indices) {
            const oldIndices = data.ground_truth.offending_line_indices;
            const newIndices = [];
            const deletionNotes = [];

            oldIndices.forEach(oldIdx => {
                // Check our indexMap first (generated during filtering)
                // If indexMap doesn't exist (e.g. High Complexity didn't filter), assume 1:1 mapping
                if (typeof indexMap !== 'undefined' && indexMap.has(oldIdx)) {
                    const newIdx = indexMap.get(oldIdx);
                    if (newIdx !== -1) {
                        newIndices.push(newIdx);
                    } else {
                        deletionNotes.push(`Orig Index ${oldIdx} (Deleted by Enforcer)`);
                    }
                } else {
                    // No filtering happened, preserve index if valid
                    if (oldIdx < data.bill_data.lineItems.length) {
                        newIndices.push(oldIdx);
                    }
                }
            });

            const actualLines = newIndices.map(idx => {
                const item = data.bill_data.lineItems[idx];
                return item ? `${item.code} (Rev ${item.revCode})` : 'Unknown Line';
            });

            const finalValueString = [...actualLines, ...deletionNotes].join(', ');

            if (finalValueString.length > 0) {
                console.log(`[Ground Truth Sync] Updating Actual Value: "${data.ground_truth.actual_value}" -> "${finalValueString}"`);
                data.ground_truth.actual_value = finalValueString;
            }

            // Append a note if we auto-corrected
            if (data.ground_truth.explanation && !data.ground_truth.explanation.includes('Auto-corrected')) {
                data.ground_truth.explanation += " (Note: Final bill values were enforced by system logic).";
            }
        }

        // Synching the Ground Truth strictly to the final state
        // If the constraints above changed anything, the AI's "ground_truth" might be stale.
        // We should update the 'actual_value' if possible, but identifying WHICH item to point to is hard dynamically.
        // However, user asked for "Sync the Ground Truth" logic. 
        // Let's at least ensure the Explanation doesn't contradict. 
        // For now, the physical correction of the bill is the priority.

        // --- POST-PROCESSING (Math, Jitter, NPIs) ---
        // We keep this purely deterministic code to strictly enforce rules even if the Auditor misses them.

        // 1. Price Jitter (Chaos Monkey)
        if (data.bill_data.lineItems && errorType !== 'MATH_ERROR') {
            const bill = data.bill_data;
            bill.lineItems.forEach(item => {
                if (Number.isInteger(item.unitPrice)) {
                    const jitter = (Math.random() * 10) - 5;
                    item.unitPrice = Math.max(0.01, item.unitPrice + jitter);
                    item.unitPrice = Number(item.unitPrice.toFixed(2));
                    console.log(`[Jitter] Randomized Price: ${item.unitPrice - jitter} -> ${item.unitPrice}`);
                }
            });
        }

        // 2. Math Enforcement
        // CRITICAL: If the intended error is a math/balance error, DO NOT "heal" it here.
        const isMathError = errorType && (errorType.toLowerCase().includes('math') || errorType.toLowerCase().includes('balance'));
        if (errorType && !isMathError) {
            const bill = data.bill_data;
            const charges = bill.subtotal || 0;
            const adj = Math.abs(bill.adjustments || 0);
            const paid = Math.abs(bill.insPaid || 0);

            const correctBalance = Math.max(0, charges - adj - paid);
            bill.grandTotal = correctBalance;

            // LOGIC FIX: Cap Insurance Paid at (Charges - Adjustments) to prevent negative balance logic or overpayment
            const maxPayable = Math.max(0, charges - adj);
            if (paid > maxPayable) {
                console.log(`[Math Guard] Capping Insurance Paid: ${paid} -> ${maxPayable}`);
                bill.insPaid = maxPayable;
                // Recalculate balance
                bill.grandTotal = Math.max(0, charges - adj - bill.insPaid);
            }

            if (bill.lineItems && Array.isArray(bill.lineItems)) {
                bill.lineItems.forEach(item => {
                    item.total = item.qty * item.unitPrice;
                });
            }

            // Re-calc subtotal from lines
            let newSub = 0;
            bill.lineItems.forEach(i => newSub += i.total);
            bill.subtotal = Number(newSub.toFixed(2));

            // Re-sync balance after subtotal update
            const finalCharges = bill.subtotal;
            bill.grandTotal = Math.max(0, finalCharges - adj - paid);
            bill.grandTotal = Number(bill.grandTotal.toFixed(2));
        }

        // 3. Identifier Realism
        // Overwrite lazy AI placeholders with valid data (UNLESS we want a Ghost/Inactive provider)
        if (errorType !== 'GHOST_PROVIDER' && errorType !== 'NPI_INACTIVE') {
            if (data.bill_data.npi && (data.bill_data.npi.includes('12345') || data.bill_data.npi.length !== 10)) {
                data.bill_data.npi = generateValidNPI();
            }
            if (data.bill_data.attendingNpi && (data.bill_data.attendingNpi.includes('12345') || data.bill_data.attendingNpi === data.bill_data.npi)) {
                data.bill_data.attendingNpi = generateValidNPI();
            }
        }

        if (data.bill_data.taxId && data.bill_data.taxId.includes('XX')) {
            const r = () => Math.floor(Math.random() * 9);
            data.bill_data.taxId = `${r()}${r()}-${r()}${r()}${r()}${r()}${r()}${r()}${r()}`;
        }

        res.json(data);

    } catch (error) {
        console.error('[Flow Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// --- AGENT 3: THE COMPLIANCE OFFICER (GFE Generator) ---
async function generateGFE(billData) {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
        You are "The Compliance Officer".
        Generate a "Good Faith Estimate" (GFE) compliant with the No Surprises Act for the following scheduled services.
        
        **INPUT BILL DATA**:
        ${JSON.stringify(billData)}
        
        **INSTRUCTIONS**:
        1. **Provider Info**: Use the same provider/facility details as the bill.
        2. **Services**: Map the 'lineItems' from the bill to the GFE.
        3. **Estimates**: 
           - The estimates should match the 'unitPrice' on the bill (assuming the bill represents the expected cost).
           - Add a 'range' (+/- 10%) to make it look like an estimate.
        4. **Disclaimers**: Include standard CMS-style mandatory disclaimers.
        
        **RETURN JSON**:
        {
            "gfe_data": {
                "gfeNumber": "GFE-XXXX-XXXX",
                "date": "Date issued (prior to service)",
                "provider": { ... },
                "facility": { ... },
                "patient": { ... },
                "services": [
                    { "code": "CPT", "description": "Desc", "estimatedCost": Number, "serviceDate": "Date" }
                ],
                "totalEstimatedCost": Number,
                "disclaimers": ["String1", "String2"]
            }
        }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseAndValidateJSON(text.replace(/[^\x00-\x7F]/g, ""));
}

// --- AGENT 4: THE PHYSICIAN (Medical Record Generator) ---
async function generateMedicalRecord(billData) {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
        You are "The Attending Physician".
        Write the **Official Medical Record (Progress Note)** for the encounter described in this bill.
        
        **INPUT BILL DATA**:
        ${JSON.stringify(billData)}
        
        **INSTRUCTIONS**:
        1. **Clinical Consistency**: The story MUST match the CPT codes and Diagnosis on the bill.
           - If Bill has "Chest X-Ray", the Note MUST discuss "ordering CXR" and the results.
           - If Bill is "Low Complexity", the note must reflect a simple, straightforward visit.
        2. **Format**: Standard SOAP Note or H&P format.
           - **Chief Complaint** (CC)
           - **History of Present Illness** (HPI)
           - **Review of Systems** (ROS)
           - **Physical Exam** (PE) - Body systems relevant to specialty.
           - **Assessment & Plan** (A/P)
        3. **Tone**: Professional, clinical shorthand (e.g., "Pt presents w/...", "CV: RRR, no m/r/g").
        
        **RETURN JSON**:
        {
            "medical_record": {
                "visitDate": "MM/DD/YYYY",
                "patientId": "${billData.patientId || 'MRN-12345'}",
                "patientDob": "${billData.patientDOB || '01/01/1980'}",
                "author": "Name, MD",
                "chiefComplaint": "String",
                "hpi": "Paragraph text...",
                "ros": "Bulleted list or paragraph",
                "physicalExam": "Paragraph or Structured text",
                "assessmentPlan": "Paragraph text",
                "orders": ["List of orders mentioned in bill"]
            }
        }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseAndValidateJSON(text.replace(/[^\x00-\x7F]/g, ""));
}

// --- AGENT 5: THE ANALYST (Verification Pass) ---
async function analyzeBill(billData, errorType, gfeData = null, mrData = null, groundTruth = null) {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
        You are "The Analyst", an expert forensic medical auditor.
        Your goal is to determined IF a specific error exists in the bill, given the available context.

        **INPUTS**:
        1. **BILL DATA**: ${JSON.stringify(billData)}
        ${gfeData ? `2. **GOOD FAITH ESTIMATE**: ${JSON.stringify(gfeData)}` : ''}
        ${mrData ? `3. **MEDICAL RECORD**: ${JSON.stringify(mrData)}` : ''}
        ${groundTruth ? `4. **INTERNAL AUDIT NOTES (GROUND TRUTH)**: \n   - Justification: "${groundTruth.justification}"\n   - Intended Error: ${groundTruth.type}` : ''}

        **TARGET INVESTIGATION**: "${errorType}"
        **DEFINITION**: "${ERROR_DESCRIPTIONS[errorType] || 'Execute Standard Audit Logic'}"

        **INSTRUCTIONS**:
        1. **CHALLENGE THE LOGIC**: Your primary directive is to **challenge the clinical logic** of the bill. Do not be "polite" or "timid." If the medical data (vitals, diagnosis) does not match the service level, you MUST declare a discrepancy.
        2. **Forensic Comparison**: 
           - **STRICTLY** compare the vitals and narrative in the Medical Record against the CPT level.
           - If vitals are stable but the bill is high (e.g. Level 4/5), this is a red flag.
        3. **Internal Notes**: Use the "Internal Audit Notes" as a baseline truth for what was *intended*, but provide your own forensic proof from the bill.
        4. **Scoring**: Low certainty (under 30%) is a failure of your audit. Take a stand based on the data provided.

        **RETURN JSON**:
        {
            "analysis": {
                "certainty_score": number, // 0-100
                "certainty_label": "High" | "Medium" | "Low" | "Unlikely",
                "explanation": "Clear, concise explanation.",
                "other_errors_found": ["List strings of other errors found. Empty if none."]
            }
        }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseAndValidateJSON(text.replace(/[^\x00-\x7F]/g, ""));
}

// --- AGENT 6: THE DEEP DIVE ANALYST (Other Issues Pass) ---
// --- AGENT 14: THE FORENSIC AUDITOR (V2.2 - Modular Orchestrator) ---
async function deepDiveAnalysis(billData, params, gfeData = null, mrData = null) {
    const { specialty, payerType } = params;
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    // Await the dynamic benchmark fetch (Needed for Price Sentry)
    const actuaryData = await getPricingBenchmarks(billData.lineItems, payerType, billData.provider);

    // Invoke the Modular Orchestrator
    try {
        return await runDeepDiveAudit(
            billData,
            mrData,
            actuaryData,
            gfeData,
            params,
            model,
            parseAndValidateJSON
        );
    } catch (error) {
        console.error("[Audit Cluster Failure]", error);
        throw error;
    }
}

// --- AGENT 7: THE COMPLIANCE SENTINEL (The Enforcer) ---
async function runComplianceSentinel(billData, errorType) {
    // 0. Short Verification: If CLEAN, just return (or do minor deterministic cleanup if needed)
    if (errorType === 'CLEAN') return billData;

    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });
    console.log(`[Sentinel] Verifying '${errorType}'...`);

    // 1. VERIFICATION PHASE
    const verifyPrompt = `
        You are The Compliance Sentinel (Quality Assurance).
        
        **TASK**: Verify if the following bill contains the specific error scenario: "${errorType}".
        **DEFINITION**: ${ERROR_DESCRIPTIONS[errorType] || 'Standard Error'}
        
        **BILL DATA**:
        ${JSON.stringify(billData)}
        
        **RETURN JSON**:
        { "has_error": boolean, "reason": "Short explanation" }
    `;

    try {
        const verifyRes = await model.generateContent(verifyPrompt);
        const verifyData = parseAndValidateJSON(verifyRes.response.text());

        if (verifyData.has_error) {
            console.log(`[Sentinel] Verification PASS. Error '${errorType}' detected.`);
            return billData; // All good
        }

        console.log(`[Sentinel] Verification FAIL. Error '${errorType}' NOT detected. Initiating Injection Protocol...`);

        // 2. STRATEGY PHASE (The Plan)
        const planPrompt = `
            You are The Compliance Sentinel.
            The user REQUESTED the error: "${errorType}".
            **DEFINITION**: ${ERROR_DESCRIPTIONS[errorType] || 'Standard Error'}
            However, the current bill is CLEAN/MISSING this error.
            
            **GOAL**: Propose a **SIMPLE JSON MODIFICATION** to inject this error into the 'bill_data'.
            
            **CONSTRAINTS**:
            - Do NOT rewrite the whole bill.
            - Change 1-2 fields max (e.g. change a Qty, Date, Code, or Price).
            - If it requires complex clinical rewriting (e.g. RECORD_MISMATCH), return "FAIL".
            
            **INSTRUCTIONS FOR SPECIFIC GOTCHAS**:
            - **DUPLICATE**: Pick a line index to duplicate.
            - **QTY_ERROR**: Multiply a quantity by 10.
            - **UPCODING**: Change a CPT code to a higher level (e.g. 99283 -> 99285).
            - **MISSING_MODIFIER**: Remove a modifier string.
            - **MATH_ERROR**: Change the 'total' field of a line item to be mathematically wrong.
            - **IMPOSSIBLE_DATE**: Change the 'date' of ONE line item to be 1 day BEFORE the 'admissionDate'.
            - **GHOST_PROVIDER**: Change 'npi' to "9999999999".
            - **NPI_INACTIVE**: Change 'npi' to "1000000000" (A valid format but likely inactive/generic).
            
            **CURRENT BILL**:
            ${JSON.stringify(billData)}
            
            **RETURN JSON**:
            {
                "can_inject": boolean,
                "strategy_description": "String explaining the change",
                "modifications": [
                    {
                        "target": "lineItems" | "header", 
                        "index": number, // Index of line item (if target is lineItems)
                        "field": "key_name", // e.g. "qty", "code", "npi", "total", "date"
                        "new_value": "value" // The new value to set
                    },
                    {
                        "target": "operation",
                        "action": "DUPLICATE_LINE",
                        "index": number
                    },
                     {
                        "target": "operation",
                        "action": "ADD_LINE",
                        "lineItem": { ...object... }
                    }
                ]
            }
        `;

        const planRes = await model.generateContent(planPrompt);
        const planData = parseAndValidateJSON(planRes.response.text());

        if (!planData.can_inject) {
            console.log(`[Sentinel] Injection Failed: Too complex to inject '${errorType}'.`);
            return billData; // Return original if we can't fix it
        }

        console.log(`[Sentinel] Executing Plan: ${planData.strategy_description}`);

        // 3. EXECUTION PHASE (The Act)
        const newBill = JSON.parse(JSON.stringify(billData)); // Deep Copy

        if (planData.modifications) {
            planData.modifications.forEach(mod => {
                try {
                    if (mod.target === 'header') {
                        newBill.bill_data[mod.field] = mod.new_value;
                    } else if (mod.target === 'lineItems') {
                        if (newBill.bill_data.lineItems && newBill.bill_data.lineItems[mod.index]) {
                            newBill.bill_data.lineItems[mod.index][mod.field] = mod.new_value;
                        }
                    } else if (mod.target === 'operation') {
                        if (mod.action === 'DUPLICATE_LINE') {
                            const itemToClone = newBill.bill_data.lineItems[mod.index];
                            if (itemToClone) {
                                newBill.bill_data.lineItems.push({ ...itemToClone }); // Clone
                            }
                        } else if (mod.action === 'ADD_LINE') {
                            if (mod.lineItem) {
                                newBill.bill_data.lineItems.push(mod.lineItem);
                            }
                        }
                    }
                } catch (e) {
                    console.error("[Sentinel] Modification Error:", e);
                }
            });
        }

        // Add a meta-marker so we know the Sentinel intervened
        if (!newBill.bill_data.meta) newBill.bill_data.meta = {};
        newBill.bill_data.meta.sentinel_intervention = true;
        newBill.bill_data.meta.sentinel_action = planData.strategy_description;

        // Add Telemetry for Frontend
        if (!newBill.simulation_debug) newBill.simulation_debug = {};
        newBill.simulation_debug.sentinel_truth = {
            status: "INTERVENED",
            error_requested: errorType,
            action_taken: planData.strategy_description,
            modifications: planData.modifications
        };

        return newBill;

    } catch (error) {
        console.error("[Sentinel] Error during enforcement loop:", error);
        return billData; // Fail safe
    }
}

// ----------------------------------------------------
//     AGENTS V2: THE MASTER SIMULATION
// ----------------------------------------------------

// HELPER: Deterministic Revenue Codes
// HELPER: Deterministic Revenue Codes
function assignRevenueCode(cpt, facilityType = 'Clinic') {
    const code = String(cpt).split('-')[0]; // Strip modifiers for rev-code mapping
    const isHospital = facilityType && (facilityType.includes('Hospital') || facilityType.includes('Emergency') || facilityType.includes('ER'));

    // Facility Setting Priority
    if (code.startsWith('9928')) return "0450"; // Emergency Room
    if (code.startsWith('9920') || code.startsWith('9921')) return "0510"; // Clinic/Office
    if (code.startsWith('9922') || code.startsWith('9923')) return "0110"; // Inpatient (Room)

    // Service Categorization
    if (code.startsWith('7')) return "0320"; // Radiology
    if (code.startsWith('8')) return "0300"; // Lab
    if (code.startsWith('93')) return "0730"; // EKG/ECG
    if (code.startsWith('9900')) return "0300"; // Lab Handling
    if (code.startsWith('9636') || code.startsWith('9637')) return "0260"; // IV Therapy / Injections
    if (code.startsWith('J') || code.startsWith('90')) return "0636"; // Drugs / Pharmacy

    // Procedures (Surgery/Ortho/etc)
    if (code.match(/^[1-6]/)) {
        return isHospital ? "0450" : "0510"; // If in hospital/ER use ER rev code, else clinic
    }

    return "0250"; // Gen Pharmacy/Supply
}

// ABBREVIATION MAP (For Descriptive Bill Naming)
const ABB_MAP = {
    // Specialties
    "Internal Medicine": "IM",
    "Orthopedics": "ORTHO",
    "Cardiology": "CARD",
    "Emergency Medicine": "ED",
    "Oncology": "ONCO",
    "Family Medicine": "FM",
    "Psychiatry": "PSYCH",
    "Gastroenterology": "GASTRO",
    "OB-GYN": "OBGYN",
    "Radiology": "RAD",
    "Anesthesiology": "ANES",
    "General Surgery": "GSURG",
    "Geriatric Medicine": "GERI",
    "Infectious Disease Medicine": "ID",
    "Urgent Care": "UC",
    "Neurology": "NEURO",
    "Nephrology": "NEPHRO",
    "Dermatology": "DERM",
    "Urology": "URO",
    "Rheumatology": "RHEUM",
    "Physical Medicine & Rehabilitation": "PMR",
    "Pediatric Medicine": "PEDS",
    "Pulmonology": "PULM",
    // Error Scenarios
    "CLEAN": "CLEAN",
    "UPCODING": "UPC",
    "UNBUNDLING": "UNB",
    "DUPLICATE": "DUP",
    "MATH_ERROR": "MATH",
    "TIME_LIMIT": "TIME",
    "IMPOSSIBLE_DATE": "DATE",
    "MISSING_MODIFIER": "MOD",
    "BALANCE_MISMATCH": "BAL",
    "PHANTOM_BILLING": "PHAN",
    "GLOBAL_PERIOD_VIOLATION": "GLB",
    "GHOST_PROVIDER": "GST",
    "DRG_OUTLIER": "DRG",
    "WRONG_PLACE_OF_SERVICE": "POS",
    "MED_NECESSITY_FAIL": "NEC",
    "QTY_ERROR": "QTY",
    "RECORD_MISMATCH": "REC",
    "CMS_BENCHMARK": "CMS",
    // Payer Types
    "Commercial": "COMM",
    "High-Deductible": "HDHP",
    "Self-Pay": "SELF",
    "Medicare": "MCARE",
    "Medicaid": "MCAID",
    "Tricare": "TRIC",
    // Complexity
    "Low": "L1",
    "Medium": "M2",
    "High": "H3"
};

// 1. THE CLINICAL ARCHITECT ("The Doctor")
// --- AGENT 10: THE CLINICAL ARCHITECT (V2.2 - Identity & Source of Truth) ---
async function generateClinicalArchitect(params, scoutContext) {
    const { specialty, errorType, complexity, randomSeed } = params;
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
        You are "The Architect". Create the "SOURCE OF TRUTH" medical record for a mock bill. 
        Your goal is to be a perfectly honest, high-fidelity medical record creator.

        ** INPUTS **:
        - Facility Context: ${scoutContext.name} (${scoutContext.facilityType}) in ${scoutContext.city}, ${scoutContext.state}
        - Specialty: ${specialty}
        - Complexity: ${complexity} (STRICTLY FOLLOW THIS)
        - Intended Error (FYI ONLY): "${errorType}" (Do NOT write the note to justify this error; the note must be the HONEST truth).
        - Random Seed: ${randomSeed}

        ** INSTRUCTIONS **:
        1. **GEOGRAPHIC REALISM**: Generate a patient name, age, and history that reflects the demographics of ${scoutContext.city}, ${scoutContext.state}. 
        2. **STRICT COMPLEXITY BOUNDARIES**: 
           - **LOW**: Patient presents for a single, non-emergent issue (e.g., 2-day cough, minor 1cm cut). Minimal vitals, max 2 orders. 
           - **MEDIUM**: Chronic flare-up or acute pain needing investigation (e.g., 6/10 abdominal pain, stable asthma). Detailed vitals, 3-5 orders.
           - **HIGH**: Life-threatening or unstable (e.g., Sepsis, Stroke, ACS). Critical vitals, extensive orders.
        3. **FORENSIC VITALS**: Generate a full vitals block (BP, HR, Temp, SpO2, RR). Ensure the vitals match the ${complexity} level (e.g., SpO2 99% for a cold, 88% for an emergency).
        4. **LATERALITY**: If a condition involves a limb/organ (Ear, Eye, Kidney, Knee), you MUST pick a side (Left or Right) and keep it consistent.
        5. **MEDICAL SHORTHAND**: Use standard shorthand (e.g., "Pt is a 62yo F with hx of HLD", "HEENT: NC/AT", "Lungs: CTA").
        6. **GLOBAL PERIOD TRAP**: If the history suggests a recent surgery (e.g., "Status post appendectomy 5 days ago"), include that in the patient history.

        ** RETURN JSON STRUCTURE **:
        {
            "clinical_truth": {
                "patient": {
                    "name": "String",
                    "id": "MRN-XXXXX (Unique 5-digit number)",
                    "age": Number,
                    "gender": "M/F",
                    "hx": "Brief relevant medical history, including recent surgeries if applicable"
                },
                "attending_physician": {
                    "name": "Full Name, MD/DO",
                    "npi": "10-digit NPI starting with 1"
                },
                "vitals": {
                    "bp": "XXX/XX",
                    "hr": "XX",
                    "rr": "XX",
                    "temp": "XX.X",
                    "spo2": "XX%"
                },
                "soap_note": {
                    "hpi": "Detailed narrative of the visit (Who, What, When, Why)",
                    "physical_exam": "Organ system findings focusing on the specialty",
                    "assessment": "Specific diagnosis (with ICD-10 description)",
                    "plan": "Next steps/Orders"
                },
                "orders": ["Order 1", "Order 2"],
                "metadata": {
                    "complexity_enforced": "${complexity}",
                    "facility_type": "${scoutContext.facilityType}",
                    "primary_anatomical_side": "LEFT | RIGHT | N/A (Mandatory if applicable to the specialty)"
                }
            }
        }
    `;
    const result = await model.generateContent(prompt);
    return parseAndValidateJSON(result.response.text());
}

// 2. THE MEDICAL CODER ("The Error Anchor")
// --- AGENT 11: THE MEDICAL CODER (V2.2 - The Infiltrator) ---
async function generateMedicalCoder(clinicalTruth, specialty, errorType) {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    // I. CONDITIONAL PROMPTING (BKM: Prevent Instruction Leakage)
    const villainLogics = {
        'CLEAN': "Produce a PERFECT, CPC-compliant bill with ZERO errors. You MUST include required modifiers (like -25 if a procedure is present).",
        'UPCODING': 'GASLIGHTING: Exaggerate the complexity. If the input is Low, use Level 4/5. If the input is High, push into Critical Care (99291) or bill for extensive MDM that exceeds the stabilized vitals.',
        'RECORD_MISMATCH': 'LATERALITY FLIP: Intentionally override the Architect\'s metadata.primary_anatomical_side. If the record says "Left", you must code for "Right" in the CPT description.',
        'GLOBAL_PERIOD': 'TEMPORAL TRAP: If the "hx" mentions a recent surgery (<90 days), ignore the post-op status and bill for a full-priced Evaluation & Management visit anyway.',
        'UNBUNDLING': 'FRAGMENTATION: If the Architect orders a comprehensive panel (like a CMP 80053), "fragment" it. Bill for individual components separately to inflate the cost.',
        'PHANTOM_BILLING': 'PHANTOM: Add an expensive procedure or imaging (appropriate for the specialty) that is NOT in the Architect\'s "orders".',
        'DUPLICATE': 'DOUBLE-BILL: Repeat one valid service twice on the same date.',
        'QTY_ERROR': 'INFLATION: Increase the quantity (qty) of a valid supply or drug (e.g. set Qty to 5 instead of 1).',
        'MISSING_MODIFIER': 'ABSENCE: You MUST include a service that WOULD REQUIRE a modifier (e.g. adding an injection procedure 96372 or Radiology with laterality), then intentionally WITHHOLD the modifier.',
        'MODIFIER_CONFLICT': 'SABOTAGE: Apply a modifier to a code that does NOT support it (e.g. put -25 on a CBC lab) or apply a conflicting laterality (e.g. -RT on a Left-side diagnosis).',
        'BALANCE_MISMATCH': 'MATH TRAP: Set the Grand Total higher than the sum of line items to simulate a "Process Failure".'
    };

    const specificLogic = villainLogics[errorType] || villainLogics['CLEAN'];

    const prompt = `
        You are "The Medical Coder (The Infiltrator)". Your task is to translate the "Clinical Truth" into official billing codes (CPT and ICD-10).
        
        ** GOAL **: ${errorType === 'CLEAN' ? 'Produce a CLEAN bill.' : `INTENTIONALLY apply error: "${errorType}".`}

        ** CLINICAL TRUTH (THE ARCHITECT'S BASELINE) **:
        ${JSON.stringify(clinicalTruth)}
        
        ** YOUR SPECIFIC DIRECTIVE (V2.2 VIBES) **:
        ${specificLogic}

        ** STYLE & REALISM **:
        - ** Setting Awareness **: Use Office codes (99202–99215) for Clinics and ER codes (99281–99285) for Hospital EDs.
        - ** Complexity Lock (STRICT) **: You MUST map levels exactly to complexity unless errorType is "UPCODING".
        - ** Administrative Accuracy **: You MUST include required modifiers (like -25) on ALL bills unless errorType is "MISSING_MODIFIER" or "MODIFIER_CONFLICT". Omitting a -25 on an UPCODING bill is considered poor craftsmanship and will fail simulation quality.
        - ** Pharmacy **: 'PO' = Rev Code 0250. 'IV/IM' = J-Code.
        - ** Descriptions **: Use short abbreviations.
        - ** ANCILLARY REQUIREMENT **: Professional bills are rarely just one line. For Level 4 or 5 visits, you MUST include at least 2 ancillary charges (Labs, Imaging, or Supplies) that support the diagnosis.
        - ** DIAGNOSTIC DEFENSIBILITY **: For high-acuity visits (Level 4 or 5), you SHOULD include at least 2 ICD-10 codes to make the high complexity defensible in an audit. 
        - ** NO META-TALK **: NEVER use words like "FAKE", "ERROR", or "VILLAIN" in descriptions.

        ** MODIFIER LOGIC (V2.3 Mandatory) **:
        Append modifiers to the CPT code with a hyphen (e.g., 99214-25).
        - **Modifier -25 (Separate E/M)**: MUST append to the E/M code if BOTH an Office/ER Visit AND a procedure (like an injection, biopsy, or x-ray) appear on the same bill.
        - **Modifier -RT / -LT (Laterality)**: MUST append to MSK or Radiology codes if the Architect's metadata specifies "RIGHT" or "LEFT".
        - **Modifier -50 (Bilateral)**: Use if a procedure is performed on "both" sides.
        - **Modifier -59 (Distinct Service)**: Use when two different procedures are done that are not usually billed together.
        - **Modifier -26 (Professional)**: Use for the physician interpretation of a test (like 93000-26) if billed separately.

        ** CPT REFERENCE (Use appropriate range for setting) **:
        - E/M: Office (99202-99215) | ER (99281-99285) | Inpatient (99221-99233)
        - Labs: 85025 (CBC), 80053 (CMP), 84443 (TSH), 84450 (Troponin)
        - Rads: 71046 (CXR 2v), 73564 (Knee Xray 3v), 74177 (CT Abd/Pel w/ Contrast), 93000 (ECG)
        - Meds: J1100 (Dex), J0696 (Ceftriaxone), J2405 (Zofran), J7030 (Saline), J1885 (Ketorolac)

        ** RETURN JSON **:
        {
            "coding_truth": {
                "cpt_codes": [{ "code": "String", "desc": "String", "qty": Number }],
                "icd_codes": [{ "code": "String", "desc": "String" }],
                "error_metadata": {
                    "justification": "Detailed explanation that supports your billing (even if gaslighted)"
                }
            }
        }
    `;
    const result = await model.generateContent(prompt);
    return parseAndValidateJSON(result.response.text());
}

// --- HELPERS: Pricing & Coding Baselines ---

// --- SHARED PRICING CORE (MIGRATED TO pricing_core.js) ---


// 3. THE FINANCIAL CLERK ("The Payer Persona")
async function generateItemPrice(item, payerType, facility) {
    try {
        const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });
        const medicareRate = await fetchMedicareRate(model, item.code, item.desc);

        const modifiers = String(item.code).split('-').slice(1);
        const cityZip = `${facility.city} ${facility.zip}`;
        const pEst = calculateBilledPrice(medicareRate, payerType, facility.state, cityZip, modifiers);

        console.log(`[Price Engine] ${item.code}: Med=$${medicareRate}, P_est=$${pEst}`);
        return { medicare: medicareRate, price: pEst, z: STATE_Z_FACTORS[facility.state] || 1.0 };
    } catch (e) {
        console.warn(`[Price Engine] Logic failure for ${item.code}, reverting to fallback.`);
        const baseCode = String(item.code).split('-')[0];
        const pMedFallback = getBasePrice(baseCode);
        let y = PAYER_MULTIPLIERS.Commercial;
        if (payerType.includes("Medicare")) y = PAYER_MULTIPLIERS.Medicare;
        else if (payerType.includes("Self") || payerType.includes("Uninsured")) y = PAYER_MULTIPLIERS["Self-Pay"];

        const pEstFallback = parseFloat((pMedFallback * y * 1.0).toFixed(2));
        return { medicare: pMedFallback, price: pEstFallback, y, z: 1.0 };
    }
}

// --- AGENT 12: THE FINANCIAL CLERK (V2.2 - Mathematical Sabotage) ---
async function generateFinancialClerk(codingTruth, payerType, errorType = 'CLEAN', specialty, facility) {
    // 1. DETERMINISTIC MULTIPLIERS (BKM Standards)
    const isSelfPay = payerType.includes("Self");
    const isMedicare = payerType.includes("Medicare");
    const isPriceGouging = errorType === "CMS_BENCHMARK";
    const isBalanceMismatch = errorType === "BALANCE_MISMATCH" || errorType === "MATH_ERROR";

    // 2. THE PRICING SABOTAGE LOGIC
    // Medicare=1.0, Insured=2.5, Self-Pay=4.0
    let y = 2.0;
    if (isMedicare) y = 1.0;
    else if (isSelfPay) y = 2.5;

    // Boost to 5.5x for CMS_BENCHMARK to guarantee a Policy Violation flag (>5.0x threshold)
    if (isPriceGouging) y = 5.5;

    const lineItems = await Promise.all(codingTruth.cpt_codes.map(async (item) => {
        // BKM: One-by-one Price Engine lookup
        const pricingResult = await generateItemPrice(item, payerType, facility);

        // Apply the Y-multiplier override if we are in a gouging scenario
        let unitPrice = pricingResult.price;
        if (isPriceGouging) {
            unitPrice = parseFloat((pricingResult.medicare * y * pricingResult.z).toFixed(2));
        }

        return {
            date: "MM/DD/YYYY", // Placeholder for Publisher
            revCode: assignRevenueCode(item.code, facility.facilityType),
            code: item.code,
            description: item.desc,
            qty: item.qty,
            unitPrice: unitPrice,
            total: parseFloat((unitPrice * item.qty).toFixed(2))
        };
    }));

    const trueSubtotal = lineItems.reduce((sum, item) => sum + item.total, 0);
    let reportedSubtotal = trueSubtotal;

    if (errorType === "MATH_ERROR") {
        // SABOTAGE: Bury the error in the line-item summation.
        // The Reported Subtotal will NOT match the sum of individual items.
        const discrepancy = 10 + (Math.random() * 40);
        reportedSubtotal = parseFloat((trueSubtotal + discrepancy).toFixed(2));
    }

    // 3. ADJUSTMENTS & INSURANCE (The "Process" Logic)
    // We use the reported (potentially bad) subtotal for the rest of the math
    let adjustments = 0;
    let adjBreakdown = [];
    if (!isSelfPay) {
        // Standard 40% Insurance Write-off
        adjustments = parseFloat((reportedSubtotal * 0.40).toFixed(2));
        adjBreakdown.push({ label: "Contractual Adj", amount: -adjustments });
    }

    const insPaidRaw = (isSelfPay || isMedicare) ? 0 : parseFloat((reportedSubtotal * 0.10).toFixed(2));
    const insPaid = insPaidRaw === 0 ? 0 : -insPaidRaw;

    // 4. THE GRAND TOTAL TRAP (The "Sabotage")
    let grandTotal;
    if (errorType === "BALANCE_MISMATCH") {
        // SABOTAGE: "Forget" to subtract adjustments.
        grandTotal = parseFloat(reportedSubtotal.toFixed(2));
    } else {
        // HONEST MATH (relative to the reported subtotal)
        grandTotal = parseFloat((reportedSubtotal - adjustments - insPaidRaw).toFixed(2));
    }

    return {
        lineItems,
        subtotal: parseFloat(reportedSubtotal.toFixed(2)),
        adjustments: -adjustments,
        adjustmentsBreakdown: adjBreakdown,
        insPaid: insPaid,
        grandTotal: grandTotal,
        true_subtotal_audit: trueSubtotal // Hidden field for internal simulation tracking
    };
}

/**
 * Distributes line items across a date range for multi-day stays
 */
function distributeLineItems(lineItems, admissionDate, dischargeDate) {
    // Sanitize dates - fallback to something valid if AI hallucinated placeholders
    const isValidDate = (d) => d instanceof Date && !isNaN(d);

    let start = new Date(admissionDate);
    if (!isValidDate(start)) start = new Date("02/01/2026");

    let end = new Date(dischargeDate);
    if (!isValidDate(end)) end = new Date(start);

    const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
        return lineItems.map(item => ({ ...item, date: admissionDate }));
    }

    return lineItems.map((item, index) => {
        let itemDate = new Date(start);

        // Logic: 
        // 1. Room & Board (Rev 0110/0120) should technically be per day, 
        //    but for mock data we often have one line with Qty > 1. 
        //    Let's put it on the start date or spread if AI gave us multiple.

        // 2. ER Visit (Rev 0450) always Day 0
        if (item.revCode === '0450') {
            itemDate = new Date(start);
        }
        // 3. Lab (Rev 0300) spread across first 2 days
        else if (item.revCode === '0300') {
            const dayShift = index % Math.min(diffDays + 1, 2);
            itemDate.setDate(start.getDate() + dayShift);
        }
        // 4. Pharmacy (Rev 0250/0636) spread across all days
        else if (item.revCode === '0250' || item.revCode === '0636') {
            const dayShift = index % (diffDays + 1);
            itemDate.setDate(start.getDate() + dayShift);
        }
        // 5. Imaging (Rev 0320) usually Day 0 or 1
        else if (item.revCode === '0320') {
            const dayShift = Math.min(diffDays, (index % 2));
            itemDate.setDate(start.getDate() + dayShift);
        }
        // Default: Random spread within range
        else {
            const dayShift = Math.min(diffDays, (index % (diffDays + 1)));
            itemDate.setDate(start.getDate() + dayShift);
        }

        return {
            ...item,
            date: itemDate.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' })
        };
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
}

// 4. THE POLISH AGENT ("Visual Noise & QC")
// --- AGENT 13: THE PUBLISHER (V2.2 - Forensic Documentarian) ---
async function generatePolishAgent(clinicalTruth, codingTruth, financialData, params) {
    const { specialty, payerType, errorType, complexity, facility } = params;
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
        You are "The Publisher". Your role is to finalize the bill and PRESERVE all forensic evidence exactly as provided.
        DO NOT correct any perceived errors in pricing, math, or descriptions.

        ** INPUT DATA **:
        - Patient: ${JSON.stringify(clinicalTruth.patient)}
        - Vitals: ${JSON.stringify(clinicalTruth.vitals)}
        - Financials: ${JSON.stringify(financialData)}
        - Facility Data: ${JSON.stringify(facility)}
        - Coding Justification: "${codingTruth.error_metadata.justification}"

        ** INSTRUCTIONS **:
        1. **PERSISTENT IDENTIFIERS**: Use the EXACT Patient Name ("${clinicalTruth.patient.name}"), NPI ("${facility.npi}"), and Tax ID ("${facility.taxId}") provided. DO NOT introduce typos or alternate spellings.
        2. **FORENSIC PRESERVATION**: Use the EXACT CPT descriptions provided by the Coder. If the Coder says "RIGHT" and the clinical note says "LEFT", PRINT "RIGHT".
        3. **PROVIDER NOTES**: Generate a naturalistic "Provider Note" based on the clinical truth. **STRICT LIMITATION**: Do NOT use "audit-defense" language. Do NOT say things like "this necessitated a higher level," "justified level 4," or "due to complexity." Instead, simply describe the observations and symptoms neutrally (e.g., "Pt presents with persistent cough, vitals stable, CXR performed"). It must sound like a clinical entry, not a defense of the bill.
        4. **MATHEMATICAL FIDELITY**: If financialData.grandTotal does not equal (Subtotal - Adjustments), PRINT THE BROKEN TOTAL. You are a printer, not a calculator.
        5. **REGIONAL BRANDING**: Use the facility name and address from the Scout context.
        6. **DATES**: Ensure Statement Date is logical (e.g., Feb 2026). If the visit was High Complexity (Multi-day), set a 2-3 day range.

        ** RETURN JSON **:
        {
            "bill_data": {
                "patientName": "String",
                "admissionDate": "02/15/2026",
                "dischargeDate": "02/15/2026",
                "statementDate": "02/20/2026",
                "dueDate": "03/20/2026",
                "npi": "${facility.npi}",
                "taxId": "${facility.taxId}",
                "provider": {
                    "name": "${facility.name}",
                    "address": "${facility.address}, ${facility.city}, ${facility.state} ${facility.zip}",
                    "contact": "${facility.contact || '800-555-0199'}",
                    "tob": "131",
                    "providerNotes": "A professional medical summary concluding the visit."
                }
            }
        }
        ** CRITICAL **: NEVER return placeholders like "MM/DD/YYYY" or "Realistic Phone Number". Use real dates (Year 2026) and valid formats.
    `;

    const result = await model.generateContent(prompt);
    let aiData = parseAndValidateJSON(result.response.text());

    // --- SANITY SANITIZER (Logic Hardening) ---
    const nuclearSanitize = (str) => typeof str === 'string' ? str.replace(/\s+/g, '') : str;

    // Preserve the exact financials from the Clerk (No recalculation)
    aiData.bill_data.subtotal = financialData.subtotal;
    aiData.bill_data.grandTotal = financialData.grandTotal;
    aiData.bill_data.adjustments = financialData.adjustments;
    aiData.bill_data.adjustmentsBreakdown = financialData.adjustmentsBreakdown;
    aiData.bill_data.insPaid = financialData.insPaid;

    // Force Identifier Persistence
    aiData.bill_data.npi = facility.npi;
    aiData.bill_data.taxId = facility.taxId;

    // V2.2 Fix: Branded Identifiers (e.g. BAR-12345678)
    const prefix = facility.name.substring(0, 3).toUpperCase();
    aiData.bill_data.accountNumber = `${prefix}-${Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('')}`;

    // Distribute items (Single day for Low/Med, Range for High)
    aiData.bill_data.lineItems = distributeLineItems(
        financialData.lineItems,
        aiData.bill_data.admissionDate,
        aiData.bill_data.dischargeDate
    );

    // Sync Patient Truth
    aiData.bill_data.patientName = clinicalTruth.patient.name;
    aiData.bill_data.patientId = clinicalTruth.patient.id || "MRN-12345";

    // Dynamic DOB (No Hardcoding)
    if (clinicalTruth.patient.age) {
        // Calculate birth year based on the admission date provided by the agent (or current year)
        const admDateStr = aiData.bill_data.admissionDate;
        let refDate = new Date(admDateStr);
        // Fallback for placeholders or invalid dates
        if (isNaN(refDate.getTime())) refDate = new Date("02/15/2026");

        const birthYear = refDate.getFullYear() - clinicalTruth.patient.age;
        // Deterministic but varied Day/Month based on Patient ID to ensure consistency
        const seedStr = (clinicalTruth.patient.id || "12345").replace(/\D/g, "");
        const seedNum = parseInt(seedStr) || 123;

        // Ensure the generated month/day falls BEFORE the admission/refDate to avoid off-by-one age flipping
        // (if today is Feb 15 and your birthday is Jun 1, you are technically age X-1)
        const month = ((seedNum % refDate.getMonth()) + 1).toString().padStart(2, '0');
        const day = ((seedNum % 28) + 1).toString().padStart(2, '0');
        aiData.bill_data.patientDOB = `${month}/${day}/${birthYear}`;
    } else {
        aiData.bill_data.patientDOB = clinicalTruth.patient.dob || "01/01/1950";
    }

    // V2.2 Fix: Include Attending Physician context
    aiData.bill_data.attendingPhysician = clinicalTruth.attending_physician?.name || "Dr. Staff Physician, MD";
    aiData.bill_data.attendingNpi = clinicalTruth.attending_physician?.npi || "1098765432";

    // V2.2 Fix: Include narrative descriptions for ICD-10 codes
    aiData.bill_data.icd10 = codingTruth.icd_codes.map(x => `${x.code} (${x.desc})`).join(', ');

    // --- V2.2 LABEL VARIANCE ENGINE (Simulation Hardening) ---
    const LABEL_MATRIX = {
        npi: { primary: "NPI", alternates: ["Provider ID", "Facility NPI", "National Provider Identifier"] },
        taxId: { primary: "Tax ID", alternates: ["EIN", "Federal Tax ID", "Tax ID:"] },
        address: { primary: "Address", alternates: ["Facility Address", "Service Location", "Place of Service"] },
        contact: { primary: "Customer Service", alternates: ["Billing Inquiries", "Patient Financial Services", "Contact Us", "Customer Care"] },
        account: { primary: "Account", alternates: ["Account Number", "Patient ID", "MRN", "Guarantor Account"] },
        tob: { primary: "TOB", alternates: ["Bill Type", "Type of Bill"] },
        patient: { primary: "PATIENT", alternates: ["Patient Name", "Recipient"] },
        dob: { primary: "DOB", alternates: ["Date of Birth", "Birth Date"] },
        dos: { primary: "DATE OF SERVICE", alternates: ["Service Date", "DOS", "Admit Date", "From/Through Dates"] },
        attending: { primary: "Attending", alternates: ["Rendering Provider", "Ordering Physician", "Treating Provider", "Attending MD"] },
        diagnosis: { primary: "DIAGNOSIS (ICD-10)", alternates: ["Diagnosis Description", "Primary Diagnosis", "ICD Code"] },
        insurance: { primary: "INSURANCE", alternates: ["Primary Payer", "Coverage", "Carrier"] },
        statementDate: { primary: "Statement Date", alternates: ["Bill Date", "Document Date", "Post Date"] },
        statementId: { primary: "Statement ID", alternates: ["Invoice Number", "Document ID", "Reference Number"] },
        dueDate: { primary: "Due Date", alternates: ["Pay By", "Please Pay By", "Remit By"] },
        gridDate: { primary: "Date", alternates: ["Service Date", "Transaction Date"] },
        revCode: { primary: "Rev Code", alternates: ["Revenue Code", "Department Code", "Rev CD"] },
        gridCode: { primary: "Code / Mod", alternates: ["CPT/HCPCS", "Procedure Code", "Service Code", "Svc Code/Modifier"] },
        gridDesc: { primary: "Description", alternates: ["Service Description", "Item Name", "Charge Description"] },
        qty: { primary: "Qty", alternates: ["Units", "Quantity"] },
        price: { primary: "Price", alternates: ["Unit Price", "Standard Charge"] },
        total: { primary: "Total", alternates: ["Extended Price", "Amount", "Billed Amount"] },
        totalCharges: { primary: "Total Charges", alternates: ["Gross Charges", "Total Billed", "Total Fees"] },
        adjustments: { primary: "Total Adjustments", alternates: ["Contractual Write-off", "Provider Discount", "Adjustments/Credits", "Contractual Allowance"] },
        balance: { primary: "PATIENT BALANCE", alternates: ["Amount Due", "Patient Responsibility", "Please Pay This Amount", "Outstanding Balance"] },
        coupon: { primary: "Please detach and return with payment", alternates: ["Remittance Advice", "Payment Coupon", "Payment Stub"] },
        amountEnclosed: { primary: "Amount Enclosed", alternates: ["Payment Amount", "Total Remitted"] },
        assistance: { primary: "FINANCIAL ASSISTANCE", alternates: ["Charity Care", "Financial Hardship", "Patient Assistance Program"] },
        gfe: { primary: "GOOD FAITH ESTIMATE", alternates: ["GFE Disclosure", "No Surprises Act Notice"] }
    };

    const selectLabel = (key) => {
        const item = LABEL_MATRIX[key];
        if (!item) return key.toUpperCase();
        // 50% Primary, 50% Alternates distributed equally
        if (Math.random() < 0.5) return item.primary;
        return item.alternates[Math.floor(Math.random() * item.alternates.length)];
    };

    // Map randomized labels to bill_data
    aiData.bill_data.labels = {};
    Object.keys(LABEL_MATRIX).forEach(key => {
        aiData.bill_data.labels[key] = selectLabel(key);
    });

    if (payerType === 'Self-Pay') {
        const selfPayVariants = [
            "Self-Pay (Uninsured)",
            "Self-Pay / None",
            "Uninsured / Self-Pay Patient"
        ];
        aiData.bill_data.insurance = selfPayVariants[Math.floor(Math.random() * selfPayVariants.length)];
        aiData.bill_data.insuranceStatus = "";
    } else {
        aiData.bill_data.insurance = payerType;
        aiData.bill_data.insuranceStatus = "Active / Pending";
    }

    // Overwrite the specific insurance label logic with the matrix selection 
    // unless it's Self-Pay handled above (we use insuranceLabel from matrix if needed)
    aiData.bill_data.payerLabel = aiData.bill_data.labels.insurance;

    // V2.2 Fix: Mandatory Legal Protections (No Surprises Act)
    if (payerType === 'Self-Pay') {
        const gfeTitle = aiData.bill_data.labels.gfe;
        aiData.bill_data.disclaimers = [
            `${gfeTitle}: You are receiving this bill because you are self-pay or uninsured. Under the No Surprises Act, you have the right to receive a Good Faith Estimate for the total expected cost of any non-emergency items or services.`,
            "RIGHT TO DISPUTE: If you are billed for more than $400 above your Good Faith Estimate, you have the right to dispute the bill via the patient-provider dispute resolution process.",
            "For more information, visit www.cms.gov/nosurprises or call 1-800-985-3059."
        ];
    }

    return aiData;
}

// --- AGENT 8: THE PRICING ACTUARY (Compliance & Benchmark Anchor) ---
async function getPricingBenchmarks(lineItems, payerType, providerInfo) {
    try {
        const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });
        return await Promise.all(lineItems.map(async (item) => {
            const pMed = await fetchMedicareRate(model, item.code, item.description);

            // 1. Calculate Estimated Fair Price (Deterministic Core)
            const address = providerInfo.address || "";
            const stateMatch = address.match(/\b([A-Z]{2})\b\s+\d{5}/);
            const state = stateMatch ? stateMatch[1] : 'US';
            const cityZip = address; // isMajorMetro handles parsing

            const pEst = calculateBilledPrice(pMed, payerType, state, cityZip);

            return {
                code: item.code,
                description: item.description,
                billed_price: item.unitPrice,
                medicare_rate: pMed,
                estimated_fair_price: pEst,
                flagging_threshold: parseFloat((pEst * (1 + (typeof FLAGGING_THRESHOLD !== 'undefined' ? FLAGGING_THRESHOLD : 0.50))).toFixed(2)),
                status: item.unitPrice > (pEst * (1 + (typeof FLAGGING_THRESHOLD !== 'undefined' ? FLAGGING_THRESHOLD : 0.50))) ? "EXCESSIVE" : "FAIR"
            };
        }));
    } catch (e) {
        console.warn('[Actuary] Failed to fetch benchmarks, using baseline fallback.');
        return lineItems.map(item => {
            const pMed = getBasePrice(item.code);
            return {
                code: item.code,
                description: item.description,
                billed_price: item.unitPrice,
                medicare_rate: pMed,
                estimated_fair_price: pMed * 2.5, // Simple fallack
                status: "VERIFICATION_FAILED"
            };
        });
    }
}

// --- AGENT 9: THE FACILITY SCOUT (Real-World Identity) ---
// --- DETERMINISTIC HELPERS: NPI & TAX ID (BKM: Luhn Compliance) ---
function generateLuhnPaddedNPI() {
    // Standard NPI: 10 digits starting with 1 or 2.
    // Luhn formula is used for the check digit (10th digit).
    let npiBase = "1" + Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join('');

    // Luhn calculation for 80840 + npiBase
    const fullString = "80840" + npiBase; // 80840 is the prefix for US health identifiers
    let sum = 0;
    for (let i = 0; i < fullString.length; i++) {
        let digit = parseInt(fullString.charAt(fullString.length - 1 - i));
        if (i % 2 === 0) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return npiBase + checkDigit;
}

function generateRandomEIN() {
    // Format: XX-XXXXXXX
    const prefix = Math.floor(Math.random() * 90) + 10;
    const suffix = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join('');
    return `${prefix}-${suffix}`;
}

async function generateFacilityIdentity(specialty, randomSeed) {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });
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
            "regional_index": "urban / rural"
        }
    `;
    const result = await model.generateContent(prompt);
    const aiData = parseAndValidateJSON(result.response.text());

    // HARDENED IDENTIFIERS (JS Deterministic)
    aiData.npi = generateLuhnPaddedNPI();
    aiData.taxId = generateRandomEIN();

    return aiData;
}


// 5. THE PRICING SENTRY ("FMV Enforcer")
function performPricingAudit(financialData, errorType) {
    const isPriceGouging = errorType === "CMS_BENCHMARK";
    return {
        status: isPriceGouging ? "Excessive Pricing (Crosses Flagging Threshold)" : "FMV Validated",
        is_fair_market_value: !isPriceGouging,
        audit_note: isPriceGouging
            ? `Price explicitly boosted beyond the ${FLAGGING_THRESHOLD * 100}% threshold.`
            : "Dynamic pricing is within the Estimated Price Engine parameters."
    };
}

app.post('/generate-data-v2', async (req, res) => {
    try {
        const { specialty, errorType, complexity, payerType } = req.body;
        console.log(`[Flow V2] Starting Master Simulation: ${specialty} | ${errorType} `);

        // 0. Facility Scout (Identity Phase)
        const randomSeed = Math.floor(Math.random() * 1000000);
        const facility = await generateFacilityIdentity(specialty, randomSeed);
        console.log(`[0/5] Facility Scout: Selected ${facility.name} (${facility.city}, ${facility.state})`);

        // 1. Architect
        const clinical = await generateClinicalArchitect({ specialty, errorType, complexity, randomSeed }, facility);
        console.log('[1/4] Architect: Created Clinical Truth.');

        // 2. Coder
        const coding = await generateMedicalCoder(clinical.clinical_truth, specialty, errorType);
        console.log(`[2 / 4] Coder: Codes Selected.Justification: ${coding.coding_truth.error_metadata.justification} `);

        // 3. Clerk (Dynamic Pricing Phase)
        const financial = await generateFinancialClerk(coding.coding_truth, payerType, errorType, specialty, facility);
        console.log('[3/5] Clerk: Financials Calculated (One-by-One Dynamic Pricing).');

        // 4. Pricing Sentry (Hardened FMV Check)
        const pricingAudit = performPricingAudit(financial, errorType);
        console.log(`[4/5] Pricing Sentry: ${pricingAudit.status}`);

        // 5. Polish
        let finalOutput = await generatePolishAgent(clinical.clinical_truth, coding.coding_truth, financial, { specialty, payerType, errorType, complexity, facility });
        console.log('[5/5] Polish: Bill Assembled.');

        // 6. COMPLIANCE SENTINEL (The Enforcer) - V2 Integration
        // This ensures the requested "Gotcha" is actually present.
        console.log(`[6/6] Sentinel: Verifying '${errorType}'...`);
        finalOutput = await runComplianceSentinel(finalOutput, errorType);

        // 7. HARD CONSTRAINT ENFORCER (Deterministic Safety Net)
        // Ported from V1, but conditioned to respect the Sentinel's work.
        if (complexity === 'Low') {
            console.log('[Enforcer V2] Applying Low Complexity Constraints...');
            const bill = finalOutput.bill_data;

            // 1. Force Single Day Duration (UNLESS Impossible Date)
            if (errorType !== 'IMPOSSIBLE_DATE') {
                bill.dischargeDate = bill.admissionDate;
            }

            // 2. Filter Multi-Day Lines
            if (bill.lineItems && bill.lineItems.length > 0) {
                let emCodeCount = 0;
                const keptLines = [];
                bill.lineItems.forEach((item) => {
                    let keep = true;
                    // Logic: Keep only one E/M (UNLESS Duplicate error)
                    const isEM = item.code.startsWith('992') || item.code.startsWith('G0');
                    if (isEM && errorType !== 'DUPLICATE') {
                        emCodeCount++;
                        if (emCodeCount > 1) keep = false;
                    }

                    if (keep) {
                        // Force date sync (UNLESS Impossible Date)
                        if (errorType !== 'IMPOSSIBLE_DATE') {
                            item.date = bill.admissionDate;
                        }
                        keptLines.push(item);
                    }
                });
                bill.lineItems = keptLines;
            }

            // 3. Force Clinic Rev Codes
            const isClinicSpecialty = specialty.includes('Internal') || specialty.includes('Family') || specialty.includes('General');
            if (isClinicSpecialty && errorType !== 'WRONG_PLACE_OF_SERVICE' && errorType !== 'REVENUE_CODE_MISMATCH') {
                bill.lineItems.forEach(item => {
                    const isEM = item.code.startsWith('992');
                    if (item.code.match(/9928[1-5]/)) { // ER -> Clinic
                        item.code = '99214';
                        item.description = 'OFFICE/OUTPATIENT VISIT EST';
                        item.revCode = '0510';
                    }
                    if (isEM && item.revCode === '0450') item.revCode = '0510'; // ER Rev -> Clinic Rev
                });
            }
        }

        // 3. Identifier Realism (NPI/TaxID) - Ported Check
        if (errorType !== 'GHOST_PROVIDER' && errorType !== 'NPI_INACTIVE') {
            if (finalOutput.bill_data.npi && finalOutput.bill_data.npi.includes('12345')) {
                finalOutput.bill_data.npi = generateValidNPI();
            }
        }

        // 5. Envelope
        const sExp = ABB_MAP[specialty] || specialty.substring(0, 3).toUpperCase();
        const pExp = ABB_MAP[payerType] || payerType.substring(0, 3).toUpperCase();
        const eExp = ABB_MAP[errorType] || errorType.substring(0, 3).toUpperCase();
        const cExp = ABB_MAP[complexity] || complexity.substring(0, 1).toUpperCase();

        const billName = `FMBI-${sExp}-${pExp}-${eExp}-${cExp}`;

        // V2.2 PURGE: Remove all 'Truth' metadata from the client response.
        const masterObject = {
            billName: billName.toUpperCase(),
            namingParts: { sExp, pExp, eExp, cExp },
            bill_data: finalOutput.bill_data,
            clinical_narrative: clinical.clinical_truth, // Needed for the 'Medical Record' button
            simulation_debug: {
                scout_truth: facility,
                clinical_truth: clinical.clinical_truth,
                coding_truth: coding.coding_truth,
                financial_truth: financial,
                pricing_audit: pricingAudit,
                polish_truth: finalOutput.bill_data,
                sentinel_truth: finalOutput.simulation_debug?.sentinel_truth || null
            }
        };

        // --- FINAL GLOBAL SANITIZATION (The Nuclear Option) ---
        // parentKey is used to avoid stripping spaces from labels (which share keys with data fields)
        const finalSanitize = (obj, parentKey = null) => {
            if (typeof obj !== 'object' || obj === null) return obj;
            const newObj = Array.isArray(obj) ? [] : {};
            for (let key in obj) {
                let val = obj[key];
                if (typeof val === 'string') {
                    // Specific fields that must NEVER have spaces (e.g. "123 456" -> "123456")
                    const nuclearFields = ['patientDOB', 'admissionDate', 'dischargeDate', 'statementDate', 'dueDate', 'npi', 'taxId'];
                    // Only sanitize if it's a nuclear data field AND we are NOT inside the 'labels' dictionary
                    if (nuclearFields.includes(key) && parentKey !== 'labels') {
                        newObj[key] = val.replace(/\s+/g, '');
                    } else if (key === 'patientName') {
                        newObj[key] = val.replace(/\s+/g, ' ').trim();
                    } else {
                        newObj[key] = val;
                    }
                } else if (typeof val === 'object') {
                    newObj[key] = finalSanitize(val, key);
                } else {
                    newObj[key] = val;
                }
            }
            return newObj;
        };

        const cleanMaster = finalSanitize(masterObject);
        res.json(cleanMaster);

    } catch (error) {
        console.error('[V2 Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// --- V3 ENDPOINT (CANONICAL BILLS) ---
app.post('/generate-data-v3', async (req, res) => {
    try {
        const { scenarioId, payerType, chargeRate, siteOfService, ownershipType, billingModel } = req.body;
        console.log(`[V3 Request] Scenario: ${scenarioId} | SOS: ${siteOfService} | Ownership: ${ownershipType} | Model: ${billingModel}`);

        // Pass the initialized genAI model to the orchestrator
        const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

        const v3Result = await generateV3Bill(model, scenarioId, payerType, chargeRate, siteOfService, ownershipType, billingModel);
        res.json(v3Result);
    } catch (error) {
        console.error('[V3 Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 2. GFE Generation Endpoint
app.post('/generate-gfe', async (req, res) => {
    try {
        const { bill_data } = req.body;
        console.log('[Flow] Generating GFE for Statement:', bill_data.statementId);
        const gfe = await generateGFE(bill_data);
        res.json(gfe);
    } catch (error) {
        console.error('[GFE Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 3. Medical Record Generation Endpoint
app.post('/generate-mr', async (req, res) => {
    try {
        const { bill_data } = req.body;
        console.log('[Flow] Generating Medical Record for Patient:', bill_data.patientName);
        const mr = await generateMedicalRecord(bill_data);
        res.json(mr);
    } catch (error) {
        console.error('[MR Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. Gemini Analysis Endpoint
app.post('/analyze-bill', async (req, res) => {
    try {
        const { bill_data, errorType, gfe_data, mr_data, ground_truth } = req.body;
        console.log(`[Flow] Verifying Bill for Error: ${errorType} `);
        const analysis = await analyzeBill(bill_data, errorType, gfe_data, mr_data, ground_truth);
        res.json(analysis);
    } catch (error) {
        console.error('[Analysis Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Deep Dive Analysis Endpoint
app.post('/deep-dive-analysis', async (req, res) => {
    try {
        const { bill_data, specialty, errorType, complexity, payerType, gfe_data, mr_data } = req.body;
        console.log(`[Flow] Performing Deep Dive Analysis for: ${specialty}`);
        const result = await deepDiveAnalysis(bill_data, { specialty, errorType, complexity, payerType }, gfe_data, mr_data);

        // --- THE BULLETPROOF JAVASCRIPT FILTER ---
        // Force-delete any AI hallucinations that are not actual failures
        if (result.other_issues) {
            result.other_issues = result.other_issues.filter(issue => {
                const text = String(issue.explanation).toLowerCase();
                const isPassInText = text.includes("passes") || text.includes("not greater than") || text.includes("less than") || text.includes("no failures");
                const isLowSeverity = issue.severity === "Low";
                // Reject if it's "Low" or the text admits it passed
                return !isPassInText && !isLowSeverity;
            });
        }

        res.json(result);
    } catch (error) {
        console.error('[Deep Dive Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 6. Supplemental Audit Endpoint
app.post('/supplemental-audit', async (req, res) => {
    try {
        const { bill_data, existing_issues } = req.body;
        console.log(`[Flow] Performing Supplemental Compliance Audit...`);
        const result = await supplementalAudit(bill_data, existing_issues);

        // --- SUPPLEMENTAL FILTER ---
        if (result.supplemental_findings) {
            result.supplemental_findings = result.supplemental_findings.filter(f => {
                const text = f.issue.toLowerCase();
                const isSystemTruth = text.includes("tob 131") || text.includes("npi") || text.includes("tax id") || text.includes("ein");
                return !isSystemTruth;
            });
        }

        res.json(result);
    } catch (error) {
        console.error('[Supplemental Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// 4. PDF Rendering Endpoint (Puppeteer)

// 4. PDF Rendering Endpoint (Puppeteer)
app.post('/render-pdf', async (req, res) => {
    try {
        const { html, scanMode } = req.body;
        console.log(`[PDF] Rendering...ScanMode: ${scanMode} `);

        const browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();

        await page.setContent(html, { waitUntil: 'networkidle0' });

        // Apply "Scan Mode" via CSS injection if requested
        if (scanMode) {
            await page.addStyleTag({
                content: `
                    body {
        transform: rotate(0.4deg);
        transform - origin: center;
        filter: blur(0.4px) contrast(115 %) brightness(95 %);
        overflow: hidden; /* Prevent scrollbars from rotation */
    }
    /* Add some noise texture overlay if possible, or just simplistic filters for now */
    `
            });
        }

        const pdfBuffer = await page.pdf({
            format: 'Letter',
            printBackground: true,
            // Add padding to prevent clipping when rotated
            margin: {
                top: '0.6in',
                right: '0.6in',
                bottom: '0.6in',
                left: '0.6in'
            }
        });

        await browser.close();

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBuffer.length,
            'Content-Disposition': `attachment; filename = "mock-bill-${Date.now()}.pdf"`
        });

        res.send(pdfBuffer);

    } catch (error) {
        console.error('[PDF Error]', error);
        res.status(500).json({ error: error.message });
    }
});

// --- MOCK BILLS FILE SYSTEM ENDPOINTS ---

const BILLS_DIR = path.resolve('./Mock_Bills');

// Helper to sanitize filenames
const sanitizeFilename = (name) => {
    return name.replace(/[^a-zA-Z0-9-_]/g, '_');
};

// LIST BILLS
app.get('/list-bills', async (req, res) => {
    try {
        const files = await fs.promises.readdir(BILLS_DIR);
        // Only JSON files
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        res.json({ files: jsonFiles });
    } catch (error) {
        console.error("[List Bills Error]", error);
        res.status(500).json({ error: "Failed to list bills" });
    }
});

// SAVE BILL
app.post('/save-bill', async (req, res) => {
    try {
        const { filename, data } = req.body;
        if (!filename || !data) {
            return res.status(400).json({ error: "Filename and data are required" });
        }

        const safeName = sanitizeFilename(filename);
        const filePath = path.join(BILLS_DIR, `${safeName}.json`);

        // Pretty print JSON
        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');

        console.log(`[MockBill] Saved: ${filePath}`);
        res.json({ success: true, message: "Bill saved successfully", filename: `${safeName}.json` });
    } catch (error) {
        console.error("[Save Bill Error]", error);
        res.status(500).json({ error: "Failed to save bill" });
    }
});

// LOAD BILL
app.post('/load-bill', async (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) {
            return res.status(400).json({ error: "Filename is required" });
        }

        // Prevent directory traversal
        const safeName = path.basename(filename);
        const filePath = path.join(BILLS_DIR, safeName);

        const content = await fs.promises.readFile(filePath, 'utf8');
        const data = JSON.parse(content);

        console.log(`[MockBill] Loaded: ${filePath}`);
        res.json({ success: true, data });
    } catch (error) {
        console.error("[Load Bill Error]", error);
        res.status(500).json({ error: "Failed to load bill" });
    }
});

// --- CANON LOGGING ENDPOINT ---
app.post('/log-canon-entry', async (req, res) => {
    try {
        const { filename, scenario, description, narrative, report } = req.body;

        // Ensure values are strings
        const safeFile = filename || "Unknown";
        const safeScenario = scenario || "Unknown";
        const safeDesc = description || "N/A";

        // Wrap text helper (hard wrap at 80 chars)
        const wrapText = (text, maxLength = 80) => {
            if (!text) return "";
            // Replace existing newlines with spaces to re-flow, or keep them? 
            // Better to keep existing paragraphs but wrap long lines.
            return text.split('\n').map(line => {
                if (line.length <= maxLength) return line;
                return line.match(new RegExp(`.{1,${maxLength}}`, 'g')).join('\n');
            }).join('\n');
        };
        const safeNarrative = wrapText(narrative || "N/A");
        const safeReport = wrapText(report || "N/A");

        const timestamp = new Date().toLocaleString();

        const logEntry = `

Filename: ${safeFile}
Scenario Selected: ${safeScenario}
Description: ${safeDesc}
Narrative (Read-Only): 
${safeNarrative}
Truth Validity report:
${safeReport}
************************
`;

        // Use path.join relative to CWD, wrapped in try/catch for permissions
        const logPath = path.resolve('./CanonLog.txt');

        // Append to file asynchronously (better perfs)
        await fs.promises.appendFile(logPath, logEntry, 'utf8');

        console.log(`[CanonLog] Entry appended: ${safeFile}`);
        res.json({ success: true, message: "Log appended successfully" });
    } catch (error) {
        console.error("[CanonLog Failed]", error.message);
        res.status(500).json({ error: "Failed to write log", details: error.message });
    }
});

// --- RE-RUN ANALYSIS (Manual Edits) ---
app.post('/rerun-analysis', async (req, res) => {
    try {
        const { billText, scenarioName, description, narrative, clinicalTruth } = req.body;

        console.log(`[ReRun] Analyzing manual bill text for scenario: ${scenarioName}`);

        // Instantiate model for this request scope
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const prompt = `
        You are "The Internal Auditor". Your job is to double-check the bill text (which may have been manually edited) before it goes out.
        
        **SCENARIO**: "${scenarioName}"
        **INTENDED ERROR**: "${description}"
        **NARRATIVE TRUTH**: "${narrative}"
        
        **BILL TEXT (RAW)**:
        ${billText}
        
        **CLINICAL RECORD (CONTEXT)**:
        ${JSON.stringify(clinicalTruth || "N/A")}
        
        **TASK**:
        Generate a "Review Report" that explains WHY this bill is incorrect based on the clinical truth and the scenario.
        Consider any manual changes made to the text.
        
        ** RETURN JSON **:
        {
            "detectableFromBill": boolean (Is the error obvious from reading the bill?),
            "explanation": "Summarize the issue clearly for a non-medical person. Mention specific codes or charges seen in the text.",
            "missingInfo": "What else would you need to investigate further? (or 'N/A' if clear)"
        }
        `;

        const result = await model.generateContent(prompt); // 'model' is global from init
        const response = await result.response;
        const text = response.text();

        // Parse JSON safely
        let jsonStart = text.indexOf('{');
        let jsonEnd = text.lastIndexOf('}');
        if (jsonStart === -1 || jsonEnd === -1) throw new Error("Invalid JSON from AI");
        const jsonStr = text.substring(jsonStart, jsonEnd + 1);
        const reviewReport = JSON.parse(jsonStr);

        res.json({ success: true, reviewReport });

    } catch (error) {
        console.error("[Re-Run Error]", error);
        res.status(500).json({ error: "Failed to re-run analysis" });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[MockGen] Server running on http://127.0.0.1:${PORT}`);
});

// Helper to safely parse AI JSON response
function parseAndValidateJSON(text) {
    try {
        // Strip markdown code fences if present
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("Failed to parse AI response:", text);
        throw new Error("Invalid JSON from AI");
    }
}

// Helper to generate a valid 10-digit NPI using Luhn algorithm
function generateValidNPI() {
    // NPIs start with 1 or 2. Let's use 1 for standard.
    let prefix = "1" + Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    // Calculate check digit (Luhn)
    // 1. Double every second digit from the right
    // 2. Sum digits
    // 3. Check digit makes sum divisible by 10
    // NPI usually has a constant prefix '80840' for Luhn calculation but standard implementation treats it as a 10 digit string where the last is check.
    // Simplified NPI generation:
    // The query digit 'd' makes the total sum 0 mod 10.
    // However, for pure visual realism, a random 10-digit starting with 1 is often enough, 
    // but the user specifically asked for "NPI check-digit algorithm".

    // Let's do a proper Luhn check digit calculation on the 9 digits.
    // We append the constant '80840' prefix which is implicit for NPIs? 
    // Actually, NPI check digit is just the last digit of the 10-digit number.
    // Steps:
    // Take the 9 digits.
    // Add the constant prefix 80840 to the beginning (conceptually).
    // Digits: 8 0 8 4 0 [N1...N9]
    // But for most validators, they just check the 10 digits provided.
    // We will just assume standard credit card style Luhn on the 10 digits.

    // Correct NPI Luhn: 
    // The "card issuer" prefix for health is 80840. The 10 digit NPI is the identifier.
    // The full string to checksum is "80840" + NPI (10 digits).
    // The check digit is the last digit of the NPI.

    const base = "80840" + prefix;
    let sum = 0;
    let shouldDouble = true; // working right to left on the base (excluding check digit which we need to find)

    // We need to calculate what X (0-9) makes the sum valid.
    // Let's brute force the check digit 0-9
    for (let check = 0; check <= 9; check++) {
        const fullString = base + check;
        let runningSum = 0;
        let double = false; // Rightmost digit is check digit, so we don't double it. Next one we double.
        // Wait, luhn iterates right to left.
        for (let i = fullString.length - 1; i >= 0; i--) {
            let digit = parseInt(fullString.charAt(i));
            if (double) {
                digit *= 2;
                if (digit > 9) digit -= 9;
            }
            runningSum += digit;
            double = !double;
        }

        if (runningSum % 10 === 0) {
            return prefix + check;
        }
    }
    return prefix + "0"; // Fallback
}
