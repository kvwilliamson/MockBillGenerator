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

// Load local ENV
dotenv.config();

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

// --- Routes ---

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
             - **MUST** include Room & Board (Rev 0110-0120).
             - **VOLUME**: 10+ line items.

        **ERROR REQUESTED**: ${errorType}
        - If Error is UPCODING: Use a CPT higher than the Diagnosis supports.
        - If Error is UNBUNDLING: Split panel components.
        - If Error is CLEAN: Make it look standard.

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
           - **UPCODING**: If requested, ensure the CPT code is ONE LEVEL HIGHER than the description/diagnosis supports. (e.g. 99285 for a Cough).
             - If the draft has 99284, CHANGE IT TO 99285.
           - If UPCODING, the bill MUST show a higher level code than supported. If it looks correct, **Introduction an error**.
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

        // --- HARD CONSTRAINT ENFORCER (Deterministic Logic) ---
        // This runs AFTER the auditor to physically prevent hallucinations that violate business rules.
        let data = finalizedData;

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

                    // Logic: Keep only one E/M
                    const isEM = item.code.startsWith('992') || item.code.startsWith('G0');
                    if (isEM) {
                        emCodeCount++;
                        if (emCodeCount > 1) {
                            console.log(`[Enforcer] Removing extra E/M Code at original index ${oldIndex}: ${item.code}`);
                            keep = false;
                        }
                    }

                    if (keep) {
                        // Force date sync
                        item.date = bill.admissionDate;
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
            if (isClinicSpecialty) {
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
        if (errorType && !errorType.toLowerCase().includes('math')) {
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
        // Overwrite lazy AI placeholders with valid data
        if (data.bill_data.npi && (data.bill_data.npi.includes('12345') || data.bill_data.npi.length !== 10)) {
            data.bill_data.npi = generateValidNPI();
        }
        if (data.bill_data.attendingNpi && (data.bill_data.attendingNpi.includes('12345') || data.bill_data.attendingNpi === data.bill_data.npi)) {
            data.bill_data.attendingNpi = generateValidNPI();
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

        **INSTRUCTIONS**:
        1. **Review Context**: 
           - **ONLY** use the data provided in the INPUTS above.
           - Compare the Bill against the Medical Record (if provided).
           - **Internal Notes**: If provided, use the "Internal Audit Notes" as a strong hint, but verify the evidence in the bill yourself.
        2. **Determine Certainty**: 
           - How likely is it that the bill contains the "${errorType}" error?
           - Assign a **Certainty Score** (0-100%).
        3. **Explain**:
           - Cite specific evidence.
        4. **Check for Other Errors**:
           - Scan for duplicate charges, math errors, etc.

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
async function deepDiveAnalysis(billData, params, gfeData = null, mrData = null) {
    const { specialty, errorType, complexity, payerType } = params;
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    // BKM: Await the dynamic benchmark fetch before building the prompt
    const pricingBenchmarks = await getPricingBenchmarks(billData.lineItems);

    const prompt = `
        You are "The Forensic Auditor". Your goal is to find EVERY possible error on this medical bill, specifically focusing on the 9 Core Guardians of the FairMedBill auditing engine.
        
        **CRITICAL RULE**: Do NOT speculate or guess. Every issue listed MUST be supported by specific, identifiable evidence within the provided data.

        **CONTEXT**:
        - Specialty: ${specialty}
        - Expected Primary Error: ${errorType}
        - Payer: ${payerType}
        - Complexity: ${complexity}

        **DATA INPUTS**:
        1. **BILL DATA**: ${JSON.stringify(billData)}
        2. **PRICING BENCHMARKS (ACTUARY)**: ${JSON.stringify(pricingBenchmarks)}
        ${gfeData ? `3. **GOOD FAITH ESTIMATE**: ${JSON.stringify(gfeData)}` : ''}
        ${mrData ? `4. **MEDICAL RECORD**: ${JSON.stringify(mrData)}` : ''}

        **TASK**:
        Perform an exhaustive audit across the **9 GUARDIAN CATEGORIES**:
        1. **Duplicate Guardian**: Check for identical CPT codes/descriptions on the same date.
        2. **Math Guardian**: Check if Qty * Unit Price = Total, and if line items sum to the correct Grand Total.
        3. **Upcoding Guardian**: **STRICT CHECK**. If Complexity is "Low" and Specialty is "ER", the E/M code MUST be 99281 or 99282. Any 99283/4/5 is a HIGH SEVERITY UPCODING ERROR.
        4. **Unbundling Guardian**: Check if lab panels or surgical components are fragmented into separate expensive charges.
        5. **Date Guardian**: Check for admission/discharge order, future dates, or services billed before admission.
        6. **Price Sentry (Hardened)**: Audit prices against the provided **REALITY BENCHMARKS**. 
           - **PRICING VS CLINICAL**: Distinguish between an 'Overpriced Line Item' (Unit Price is too high) and a 'Clinically Unjustified Item' (The code itself shouldn't be there or is the wrong level). Both are OVERCHARGES.
           - **EXCESSIVE**: Flag as 'Excessive' if the price is >5x Medicare. **SELF-PAY EXCEPTION**: For Self-Pay, flag anything >1.5x Medicare as 'Excessive' as this represents a fair-market overcharge for the uninsured.
        7. **GFE Guardian**: If GFE provided, check if the bill exceeds the estimate by >$400 (No Surprises Act violation).
        8. **Balance Billing Guardian**: Scan for out-of-network traps or patient responsibility errors on emergency visits.
        9. **Record Match Guardian**: If MR provided, ensure every billed item is actually documented in the medical notes.

        **INSTRUCTIONS**:
        - **LOGIC SANITY**: Be surgical. If the Pricing Actuary shows a price is within the "Chargemaster Range", it is technically legal, but for Self-Pay, it is still an overcharge if >1.5x Medicare.
        - **FORENSIC BRUTALITY**: Act like a hostile insurance adjuster looking for any reason to deny or downcode this bill. Do not be polite.
        - **AI FINGERPRINTING**: Identify "tells" that suggest this is a synthetic mock bill (e.g. perfect numbering, specific AI phrasing).
        - Be aggressive and exhaustive but strictly EVIDENCE-BASED.
        - **CHECKLIST**: 
           1. Check the 'provider.disclaimers' array. If it has 3+ items, DO NOT flag missing disclaimers. 
           2. Check the 'provider.tob' field. TOB 131 is correct for ER. 
           3. Use the 'executive_summary' to show your math (e.g. "$400 / $230 = 1.7x").
        - Calculate the "Overcharge Potential" based on the billing discrepancy.

        **RETURN JSON**:
        {
            "executive_summary": "A 2-3 sentence professional narrative of the audit findings.",
            "health_score": 0-100, // 100 = Perfect Bill, 0 = Fraudulent/Corrupt
            "realism_score": 0-100, // 100 = Looks 100% authentic, 0 = Obvious AI halluncination
            "ai_fingerprints": ["List specific patterns that look synthetic"],
            "guardian_statuses": [
                { "guardian": "Guardian Name", "status": "PASS" | "FAIL" | "WARNING" }
            ],
            "other_issues": [
                {
                    "guardian": "Guardian Name",
                    "type": "Error Type",
                    "explanation": "Evidence-based forensic explanation",
                    "severity": "High" | "Medium" | "Low",
                    "overcharge_potential": "Estimated $ amount"
                }
            ]
        }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseAndValidateJSON(text.replace(/[^\x00-\x7F]/g, ""));
}

// --- AGENT 7: THE COMPLIANCE SENTINEL (Supplemental Audit) ---
async function supplementalAudit(billData, existingIssues) {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
        You are "The Compliance Sentinel". Your goal is to find non-financial errors on this medical bill.
        
        **CRITICAL**: DO NOT REPEAT issues related to pricing, overcharges, or the 9 Guardians.
        Focus on:
        1. **Administrative Errors**: Typos in names, invalid NPI patterns, missing Tax IDs.
        2. **Compliance**: Missing legal disclaimers, incorrect TOB/Specialty alignment, formatting oddities.
        3. **Identity**: Cross-referencing patient details for inconsistencies.

        **DATA**:
        - Bill: ${JSON.stringify(billData)}
        - Already Identified Financial Issues: ${JSON.stringify(existingIssues)}

        **RETURN JSON**:
        {
            "supplemental_findings": [
                {
                    "category": "Admin" | "Compliance" | "Technical",
                    "issue": "Specific finding",
                    "impact": "Potential impact (e.g. claim denial risk)",
                    "severity": "Low" | "Medium"
                }
            ]
        }
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    return parseAndValidateJSON(text.replace(/[^\x00-\x7F]/g, ""));
}

// ----------------------------------------------------
//     AGENTS V2: THE MASTER SIMULATION
// ----------------------------------------------------

// HELPER: Deterministic Revenue Codes
// HELPER: Deterministic Revenue Codes
function assignRevenueCode(cpt) {
    const code = String(cpt);
    if (code.startsWith('9928')) return "0450"; // ER - Emergency Room
    if (code.startsWith('9920') || code.startsWith('9921')) return "0510"; // Clinic
    if (code.startsWith('9922') || code.startsWith('9923')) return "0110"; // Inpatient (Room)
    if (code.startsWith('7')) return "0320"; // Radiology
    if (code.startsWith('8')) return "0300"; // Lab
    if (code.startsWith('93')) return "0730"; // EKG/ECG
    if (code.startsWith('9900')) return "0300"; // Lab Handling
    if (code.startsWith('9636') || code.startsWith('9637')) return "0260"; // IV Therapy / Injections
    if (code.startsWith('J') || code.startsWith('90')) return "0636"; // Drugs / Pharmacy
    if (code.startsWith('1') || code.startsWith('2') || code.startsWith('3') || code.startsWith('4') || code.startsWith('5') || code.startsWith('6')) return "0450"; // Procedures (ER)
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
async function generateClinicalArchitect(params) {
    const { specialty, errorType, complexity } = params;
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
        You are "The Architect".Create the "SOURCE OF TRUTH" for a mock medical bill.
        
        ** SETTINGS **:
    - Specialty: ${specialty}
    - Complexity: ${complexity}
    - Intended Scenario: "${errorType}"

        ** STRICT COMPLEXITY MAPPING **:
        - ** Low **: Patient presents for a single, non - emergent issue(e.g., minor wound, cough, suture removal, medication refill).Very minimal workup. ** MAX 3 ORDERS **.
        - ** Medium **: Complex chronic management flare - up or extended ER observation(e.g., severe abdominal pain, worsening chronic asthma).Multiple labs / imaging.
        - ** High **: Life - threatening emergency or clinical instability(e.g., ACS / Heart Attack, Stroke, Major Trauma, Sepsis).Extensive workup and critical care.

        ** INSTRUCTIONS **:
        4. ** IDENTITY REALISM **: NEVER use "John Doe", "Jane Smith", or other placeholders. Generate a culturally and age-appropriate first and last name from a diverse pool.
        5. ** CLINICAL FIDELITY **: Only include comorbidities (e.g. Hypertension, Diabetes) in the ICD-10/Truth list if the visit_note actually mentions checking or managing them (e.g. "blood pressure stable", "glucose checked"). DO NOT just list them as filler.
        6. ** CLINICAL SANITY **: Every ICD-10 code MUST perfectly match the "Assessment" and "HPI". If the injury is on the left knee, YOU MUST use a left-specific ICD-10 (e.g. M17.12). DO NOT use a right-side code for a left-side complaint.
        7. Write a detailed ** Visit Note ** (HPI, Physical Exam). 
           - **REALISM**: Use standard medical shorthand (e.g. "Pt reports", "NAD", "PERRLA"). Add clinical measurements where appropriate (e.g. "Lungs: clear vs. scattered rhonchi"). DO NOT make it too clean; include non-essential clinical filler that real doctors write.
        8. List specific ** Medical Orders ** (e.g. "Order: CBC", "Order: CT Scan").

        ** RETURN JSON **:
    {
        "clinical_truth": {
            "patient_demographics": { "name": "String", "age": Number, "gender": "M/F", "history": "String" },
            "visit_note": { "hpi": "String", "physical_exam": "String", "assessment": "String" },
            "orders": ["String (Order 1)", "String (Order 2)"],
                "expected_service_level": "Level X"
        }
    }
    `;
    const result = await model.generateContent(prompt);
    return parseAndValidateJSON(result.response.text());
}

// 2. THE MEDICAL CODER ("The Error Anchor")
async function generateMedicalCoder(clinicalTruth, specialty, errorType) {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
        You are "The Medical Coder". 
        Translate the Clinical Truth into Codes. 
        ** INTENTIONALLY ** apply the error requested by "${errorType}".

        ** CLINICAL TRUTH **:
        ${JSON.stringify(clinicalTruth)}
        
        ** SPECIALTY CONSTRAINTS **:
    - Specialty: "${specialty}"
        - ** Emergency Medicine **: MUST use CPT 99281 - 99285. DO NOT use 9920x / 9921x(Office).
        - ** Internal Medicine / PC **: Use 9920x / 9921x.

        ** TARGET ERROR **: "${errorType}"

        ** LOGIC **:
    1. ** Code the Visit **: Select the appropriate E / M code(Clean or Upcoded).
        2. ** Code the Orders **: YOU MUST create a separate line item for EVERY "Order" listed in the Clinical Truth (Labs, Radiology, Meds, Supplies).
           - ** PHARMACY REALISM **: If the visit note says "PO", "Tylenol", or "Prescription", it is an ORAL medication. DO NOT use J-codes. Use Revenue Code 0250 and a short generic description (e.g. "PHARMACY - ORAL MED").
           - ** INJECTIONS **: Only use J-codes if the note explicitly says "IM", "IV", or "Injection".
           - For Lab Handling: Use CPT 99000.

        ** ERROR INSTRUCTIONS (STRICT SCOPE) **:
        - If CLEAN: Code perfectly (CPC Standard).
        - If UPCODING: Select a CPT code exactly **1-2 levels HIGHER** than supported by the Visit Note.
           - Example: If visit note supports Level 2, use Level 3 or 4. DO NOT jump from Level 2 straight to Level 5.
           - ** CRITICAL **: DO NOT add or remove other line items. Only change the E/M level.
        - If UNBUNDLING: Fragment a standard panel (e.g. CMP) into individual expensive components.
        - If PHANTOM BILLING: Add a CPT code for a service (e.g. expensive drug or procedure) NOT in the "orders".
        - ** NO ERROR LEAKAGE **: If ${errorType} is UPCODING, the rest of the bill MUST be perfect. Do not mix error types.
        
        ** STYLE **:
        - ** Descriptions **: Use SHORT, hospital-standard abbreviations. DO NOT use the full CPT book definition or long sentences.
        - ** NO META-TALK **: NEVER include words like "UPCODING", "ERROR", "INTENT", "ASSUMED", or "PHANTOM" in the line item descriptions. These must look 100% like real clinical descriptions (e.g. "LIDOCAINE INJECTION" not "LIDOCAINE (FOR PHANTOM BILLING)").
        - ** Examples **: "ER VISIT LEVEL 5", "CBC W/ DIFF", "CT ABDOMEN/PELVIS W/ CONTRAST".
        
        ** CPT / HCPCS REFERENCE LIBRARY(STRICT) **:
        - ** ER Visit **: 99281(L1), 99282(L2), 99283(L3), 99284(L4), 99285(L5).
        - ** Injections **: 96374(Initial IV Push), 96375(Each addtl IV push), 96365(Initial Infusion), 96372(IM / SQ).
        - ** Labs **: 85025(CBC), 80053(CMP), 81001(Urinalysis), 84443(TSH), 84450(Troponin).
        - ** Imaging **: 71045(CXR 1v), 71046(CXR 2v), 74177(CT Abd / Pel w / Contrast), 74150(CT Abd w / o), 93000(ECG w / interpret).
        - ** Procedures **: 12011(Simple Repair <2.5cm), 12001(Simple Repair <2.5cm), 10140(I&D Hematoma).
        - ** Vaccines **: 90715(Tdap), 90630(Flu), 90714(Td).
        - ** Medications (J-Codes) **: J1100 (Dexamethasone), J3490 (Unclassified Drugs), J0696 (Ceftriaxone), J1644 (Heparin), J2270 (Morphine), J2405 (Ondansetron), J1040 (Methylprednisolone), J2060 (Lorazepam), J7030 (Normal Saline).
        - ** STRICT **: NEVER use pseudo-codes like "SUPPLY-XX".
        - ** NO CODE REUSE **: NEVER use the same CPT/J-code for two different drug descriptions on the same bill. If you have multiple medications and don't know the specific codes, use DIFFERENT unclassified codes (e.g., J3490, J9999) or unique identifiers to ensure they are distinct line items.
        - ** DO NOT ** use generic codes like A0470 for drugs if a J-code is applicable.
        - ** DO NOT ** use codes like 99185 or 99291 unless clinical truth supports "Critical Care".
        
        ** CRITICAL **: You must output a "Justification String" explaining WHY you chose the code.

        ** RETURN JSON **:
    {
        "coding_truth": {
            "cpt_codes": [{ "code": "String", "desc": "String", "qty": Number }],
                "icd_codes": [{ "code": "String", "desc": "String" }],
                    "error_metadata": {
                "is_error": boolean,
                    "type": "${errorType}",
                        "justification": "I chose code X because..."
            }
        }
    }
    `;
    const result = await model.generateContent(prompt);
    return parseAndValidateJSON(result.response.text());
}

// 3. THE FINANCIAL CLERK ("The Payer Persona")
// --- AGENT 10: THE DYNAMIC ACTUARY (Item-by-Item Realism) ---
// BKM: AI ONLY looks up Medicare rate. Final price is calculated DETERMINISTICALLY in code.
async function generateItemPrice(item, payerType, facility) {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const isSelfPay = payerType.includes("Self");

    // STEP 1: Ask AI ONLY for the Medicare rate lookup (no price calculation)
    const prompt = `
        You are "The Medicare Rate Lookup Agent". Your ONLY job is to look up the 2024 CMS Medicare Physician Fee Schedule reimbursement rate.
        
        **SERVICE**: CPT/HCPCS Code "${item.code}" - "${item.desc}"
        
        **INSTRUCTIONS**:
        1. Look up the 2024 CMS Medicare Physician Fee Schedule national average reimbursement rate for this specific code.
        2. Return ONLY the Medicare rate. Do NOT calculate any markup or final price.
        3. If this is a facility fee or supply, estimate based on typical Medicare reimbursement.
        
        **RETURN JSON**:
        {
            "medicareRate": Number  // The CMS Medicare reimbursement rate (e.g., 145.25)
        }
    `;
    try {
        const result = await model.generateContent(prompt);
        const data = parseAndValidateJSON(result.response.text());
        const medicareRate = Number(data.medicareRate);

        // STEP 2: Calculate price DETERMINISTICALLY in code (no AI discretion)
        let multiplier;
        if (isSelfPay) {
            // Self-Pay: 1.25x to 1.40x Medicare (gives margin under 1.5x threshold)
            multiplier = 1.25 + (Math.random() * 0.15);
        } else {
            // Insured: 2x to 2.8x Medicare (insurance negotiates discounts)
            multiplier = 2.0 + (Math.random() * 0.8);
        }

        const finalPrice = parseFloat((medicareRate * multiplier).toFixed(2));

        console.log(`[Pricing] ${item.code}: PayerType="${payerType}", isSelfPay=${isSelfPay}, Medicare=$${medicareRate.toFixed(2)}, Multiplier=${multiplier.toFixed(2)}x, Final=$${finalPrice}`);

        return { medicare: medicareRate, price: finalPrice };
    } catch (e) {
        console.warn(`[Pricing Agent] Failed for ${item.code}, using fallback.`);
        return null;
    }
}

async function generateFinancialClerk(codingTruth, payerType, errorType = 'CLEAN', specialty, facility) {
    // STRICT JS LOGIC - No AI Math
    const isSelfPay = payerType.includes("Self");
    const isMedicare = payerType.includes("Medicare");
    const isPriceGouging = errorType === "CMS_BENCHMARK";

    // Multipliers (Harden Pricing Guardian Logic)
    // For Self-Pay, we use 1.4x as the standard to avoid "Predatory" flags (>1.5x Medicare).
    // This allows the bill to look "realistic" but correctly price-gouged ONLY if requested.
    let baseMultiplier = isSelfPay ? 1.4 : (isMedicare ? 1.0 : 1.3);
    if (isPriceGouging) baseMultiplier = 5.5; // Explicitly jump over the 5x line for the error scenario

    const getCategoricalMultiplier = (cptCode) => {
        const code = String(cptCode);
        if (isMedicare) return 1.0;

        // Tier 1: High Markup (E/M Visits)
        if (code.startsWith('992')) return baseMultiplier;

        // Tier 2: Medium Markup (Radiology and Small Procedures)
        if (code.startsWith('7') || code.startsWith('1') || code.startsWith('96') || code.startsWith('93')) {
            return isSelfPay ? 1.5 : 1.3;
        }

        // Tier 3: Low Markup (Drugs and Labs)
        if (code.startsWith('J') || code.startsWith('8')) {
            return isSelfPay ? 1.3 : 1.1;
        }

        return baseMultiplier;
    };

    // Base Rates (Simplified RVU-ish)
    const getBasePrice = (cpt) => {
        const code = String(cpt);
        // E/M
        if (code.startsWith('99285')) return 380;
        if (code.startsWith('99284')) return 230;
        if (code.startsWith('99214')) return 130;
        if (code.startsWith('99213')) return 95;

        // Radiology
        if (code.startsWith('741')) return 280; // CT Abdomen
        if (code.startsWith('71046')) return 35; // CXR 2 view
        if (code.startsWith('71045')) return 32; // CXR 1 view
        if (code.startsWith('73610')) return 36; // Ankle X-ray
        if (code.startsWith('7')) return 45;    // Default Rads

        // Lab
        if (code.startsWith('87')) return 20;    // Rapid Tests
        if (code.startsWith('85025')) return 12; // CBC
        if (code.startsWith('80053')) return 15; // CMP
        if (code.startsWith('8100')) return 8;   // Urinalysis
        if (code.startsWith('86592')) return 22; // Strep
        if (code.startsWith('8')) return 15;     // Default Lab

        // Procedures
        if (code.startsWith('131')) return 180; // Complex Repair
        if (code.startsWith('12011')) return 43; // Simple Repair
        if (code.startsWith('9637')) return 35; // Injection Service
        if (code.startsWith('1')) return 50;    // Default Proc

        // Cardiology
        if (code.startsWith('93000')) return 45; // ECG

        // Lab Handling
        if (code.startsWith('9900')) return 15; // Specimen Handling

        // Medications / Misc
        if (code.startsWith('J') || code.startsWith('90')) {
            const isExpensive = code.startsWith('J9') || code.startsWith('J08') || code.startsWith('J3');
            if (isExpensive) return 120 + (Math.random() * 200);
            return 8 + (Math.random() * 15); // Generic Med Base ($8-$23)
        }
        if (code === '0250') return 15; // Generic Oral Med
        if (code === '99000') return 9; // Handling Fee

        // Default catch-all (Randomized to prevent bizarre identical rows)
        return 45 + (Math.random() * 80);
    };

    const lineItems = await Promise.all(codingTruth.cpt_codes.map(async (item) => {
        let price;

        // EXCEPTION: If the error is High Priced (CMS_BENCHMARK), use the deterministic gouging logic
        if (isPriceGouging) {
            const base = getBasePrice(item.code);
            const categoricalMultiplier = 5.5; // Predatory Gouging
            const jitter = 0.95 + (Math.random() * 0.10);
            const noise = (Math.random() * 0.99);
            price = parseFloat(((base * categoricalMultiplier * jitter) + noise).toFixed(2));
        } else {
            // BKM: One-by-one API call. Price is calculated DETERMINISTICALLY inside generateItemPrice().
            const pricingResult = await generateItemPrice(item, payerType, facility);

            if (pricingResult && pricingResult.price) {
                // TRUST the price from generateItemPrice() - it already enforces 1.25x-1.40x for Self-Pay
                price = Number(pricingResult.price);
            } else {
                // Fallback if API fails - use the SAME multiplier logic as generateItemPrice()
                const base = getBasePrice(item.code);
                const fallbackMultiplier = isSelfPay ? (1.25 + Math.random() * 0.15) : (2.0 + Math.random() * 0.8);
                price = parseFloat((base * fallbackMultiplier).toFixed(2));
                console.warn(`[Pricing Fallback] ${item.code}: Base=$${base}, Multiplier=${fallbackMultiplier.toFixed(2)}x, Price=$${price}`);
            }
        }

        const total = parseFloat((price * item.qty).toFixed(2));

        return {
            date: "MM/DD/YYYY", // Placeholder
            revCode: assignRevenueCode(item.code),
            code: item.code,
            description: item.desc,
            qty: item.qty,
            unitPrice: price,
            total: total
        };
    }));

    const totalCharges = lineItems.reduce((sum, item) => sum + item.total, 0);

    // Adjustments
    let adjustments = 0;
    let adjBreakdown = [];

    if (!isSelfPay) {
        // Contractual Write-off
        const writeoffVar = 0.40;
        adjustments = parseFloat((totalCharges * writeoffVar).toFixed(2));
        adjBreakdown.push({ label: "Contractual Adj", amount: -adjustments });
    }

    const insPaidRaw = isSelfPay ? 0 : parseFloat((totalCharges * 0.10).toFixed(2));
    const insPaid = insPaidRaw === 0 ? 0 : -insPaidRaw; // Prevent negative zero visual glitch
    const grandTotal = parseFloat((totalCharges - adjustments - insPaidRaw).toFixed(2));

    return {
        lineItems,
        subtotal: parseFloat(totalCharges.toFixed(2)),
        adjustments: -adjustments,
        adjustmentsBreakdown: adjBreakdown,
        insPaid: insPaid,
        grandTotal: grandTotal
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
async function generatePolishAgent(clinicalTruth, codingTruth, financialData, params) {
    const { specialty, payerType, errorType } = params;
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const prompt = `
        You are "The Publisher".Finalize this bill for printing.

        ** DATA **:
        - Patient: ${JSON.stringify(clinicalTruth.patient_demographics)}
        - Financials: ${JSON.stringify(financialData)}
        - Error Requested: ${errorType}
        - REAL FACILITY DATA: ${JSON.stringify(params.facility)}

        ** INSTRUCTIONS **:
    1. ** Patient Info **: Use Name, Age, Gender from clinical truth.
        2. ** Dates **:
    - Set Admission / Discharge Date(e.g., 02 /01 / 2026).
           - Set Statement Date(e.g., 02 /05 / 2026).
            - ** Due Date Logic **: Use a realistic 21-30 day window from the Statement Date.
        3. ** Identifiers **: Generate 10-digit NPI (start with 141, 167, or 189), 9-digit Tax ID (XX-XXXXXXX), 8-digit Statement ID, and 7-digit Account Number. 
           - ** REALISM **: Use realistic NPI masks starting with '1' (Organization). Tax ID should be in the format e.g. 45-2983741 (NON-SEQUENTIAL digits).
        4. ** Visual Noise & Branding **: 
           - ** REAL FACILITY DATA **: YOU MUST USE THE REAL FACILITY NAME AND ADDRESS provided in the data above.
           - ** Contact **: Use a realistic customer service number for that region.
           - ** Disclaimers **: Provide 3-5 distinct, varied legal disclaimers about patient rights, insurance, and billing disputes.
        5. **Identifiers**: Use a fake Tax ID and NPI, but formatted correctly for that state.
        6. ** NO PLACEHOLDERS **: NEVER use "123 Medical Center", "800-555-1212", "ST 12345", or "(ST)".

        ** RETURN JSON **:
    {
        "bill_data": {
            "patientName": "...",
                "patientDOB": "MM/DD/YYYY",
                    "admissionDate": "MM/DD/YYYY",
                        "dischargeDate": "MM/DD/YYYY",
                            "statementDate": "MM/DD/YYYY",
                                "dueDate": "MM/DD/YYYY",
                                    "statementId": "...",
                                        "accountNumber": "...",
                                            "npi": "...",
                                                "taxId": "...",
                                                    "provider": {
                                                        "name": "Facility Name",
                                                        "address": "Full Street Address, City, ST 12345-6789",
                                                        "contact": "Phone Number",
                                                        "tob": "131",
                                                        "disclaimers": [
                                                            "This bill is for services rendered. Please review for accuracy.",
                                                            "APPEAL RIGHTS: You have 180 days from the statement date to dispute these charges in writing.",
                                                            "Financial assistance is available for qualifying patients."
                                                        ]
                                                    }
        }
    }


        ** CRITICAL ARCHITECTURAL CONSTRAINT **:
    - If Complexity is "Low" or "Medium", the Admission Date and Discharge Date MUST be the SAME.
        - If Complexity is "High", you MUST use a multi - day range(at least 2 days difference).Example: Admit 02 /01, Discharge 02 /03.
    `;

    const result = await model.generateContent(prompt);
    let aiData = parseAndValidateJSON(result.response.text());

    // --- SANITY SANITIZER (Logic Hardening) ---
    // Remove ALL AI-style spaces from dates and names (e.g. "01 / 01 / 1958" -> "01/01/1958")
    const sanitize = (str) => typeof str === 'string' ? str.replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').replace(/^\s+|\s+$/g, '').trim() : str;
    const nuclearSanitize = (str) => typeof str === 'string' ? str.replace(/\s+/g, '') : str;

    aiData.bill_data.patientName = sanitize(aiData.bill_data.patientName);
    aiData.bill_data.patientDOB = nuclearSanitize(aiData.bill_data.patientDOB);
    aiData.bill_data.admissionDate = nuclearSanitize(aiData.bill_data.admissionDate);
    aiData.bill_data.dischargeDate = nuclearSanitize(aiData.bill_data.dischargeDate);
    aiData.bill_data.statementDate = nuclearSanitize(aiData.bill_data.statementDate);
    aiData.bill_data.dueDate = nuclearSanitize(aiData.bill_data.dueDate);

    // Hardened Identifier Masking (Anti-AI Fingerprinting)
    const genIdArr = (len) => Array.from({ length: len }, () => Math.floor(Math.random() * 10)).join('');
    aiData.bill_data.accountNumber = genIdArr(8);
    aiData.bill_data.statementId = genIdArr(9);
    aiData.bill_data.npi = "1" + genIdArr(9);

    if (aiData.bill_data.taxId) {
        aiData.bill_data.taxId = genIdArr(2) + "-" + genIdArr(7);
    }

    // V2.2 Complexity Enforcement: Low/Med are single-day encounters
    const admissionDate = aiData.bill_data.admissionDate || "02/01/2026";
    const complexity = params.complexity || "Low";

    if (complexity === "Low" || complexity === "Medium") {
        aiData.bill_data.dischargeDate = admissionDate;
    } else if (complexity === "High" && (aiData.bill_data.admissionDate === aiData.bill_data.dischargeDate || !aiData.bill_data.dischargeDate)) {
        // Programmatic Force: If High and dates are same, increment discharge by 2 days
        const d = new Date(admissionDate);
        d.setDate(d.getDate() + 2);
        aiData.bill_data.dischargeDate = d.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
    }

    // Use Helper to distribute items across the range for High Complexity
    // For Low/Med, it will correctly stick to a single day.
    aiData.bill_data.lineItems = distributeLineItems(
        financialData.lineItems,
        aiData.bill_data.admissionDate,
        aiData.bill_data.dischargeDate
    );

    aiData.bill_data.subtotal = financialData.subtotal;
    aiData.bill_data.grandTotal = financialData.grandTotal;
    aiData.bill_data.adjustments = financialData.adjustments;
    aiData.bill_data.adjustmentsBreakdown = financialData.adjustmentsBreakdown;
    aiData.bill_data.insPaid = financialData.insPaid;
    // Simplified ICD-10 exported format (Code only or Code + Short Desc)
    aiData.bill_data.icd10 = codingTruth.icd_codes.map(x => `${x.code}`).join(', ');

    // Sync patient info from truth if missing or placeholders
    const age = clinicalTruth.patient_demographics.age || 40;
    const birthYear = 2026 - age;
    aiData.bill_data.patientName = sanitize(clinicalTruth.patient_demographics.name || aiData.bill_data.patientName);
    aiData.bill_data.patientDOB = nuclearSanitize(`01/01/${birthYear}`);
    aiData.bill_data.insurance = payerType;

    // Simplified administrative footer
    if (!aiData.bill_data.footerNote) {
        aiData.bill_data.footerNote = "Account services provided by regional central billing office.";
    }

    // Create Telemetry for Agent 4
    aiData.polish_truth = {
        agent: "The Publisher",
        decisions: {
            admissionDate: aiData.bill_data.admissionDate,
            dischargeDate: aiData.bill_data.dischargeDate,
            complexityEnforced: complexity,
            npiGenerated: aiData.bill_data.npi,
            taxIdGenerated: aiData.bill_data.taxId
        }
    };

    return aiData;
}

// --- AGENT 8: THE PRICING ACTUARY (Compliance & Benchmark Anchor) ---
// BKM: Dynamically fetch benchmarks from AI - no hardcoded tables.
async function getPricingBenchmarks(lineItems) {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

    const codes = lineItems.map(i => `${i.code}: ${i.description}`).join('\n');

    const prompt = `
        You are "The Pricing Actuary". For each medical code below, provide the 2024 CMS Medicare reimbursement rate.
        
        **CODES**:
        ${codes}
        
        **RETURN JSON**:
        {
            "benchmarks": [
                { "code": "String", "medicareRate": Number }
            ]
        }
    `;

    try {
        const result = await model.generateContent(prompt);
        const data = parseAndValidateJSON(result.response.text());
        const benchmarkMap = {};
        data.benchmarks.forEach(b => { benchmarkMap[b.code] = b.medicareRate; });

        return lineItems.map(item => ({
            code: item.code,
            description: item.description,
            billed_price: item.unitPrice,
            medicare_rate: benchmarkMap[item.code] || (item.unitPrice / 3),
            chargemaster_range: "Dynamic (AI-sourced)"
        }));
    } catch (e) {
        console.warn('[Actuary] Failed to fetch benchmarks, using fallback.');
        return lineItems.map(item => ({
            code: item.code,
            description: item.description,
            billed_price: item.unitPrice,
            medicare_rate: item.unitPrice / 3,
            chargemaster_range: "Fallback"
        }));
    }
}

// --- AGENT 9: THE FACILITY SCOUT (Real-World Identity) ---
async function generateFacilityIdentity(specialty, randomSeed) {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });
    const prompt = `
        You are "The Facility Scout". Your task is to select a REAL, EXISTING medical facility in the United States that matches the requested specialty.
        
        **RANDOM SEED**: ${randomSeed}
        **SPECIALTY**: "${specialty}"
        
        **INSTRUCTIONS**:
        1. Select a random US state (e.g. TX, CA, NY, FL, OH) and then pick a REAL medical facility within that state.
        2. Provide the EXACT real-world name and physical address.
        3. Do NOT provide fake names or placeholders (like "Metropolis General").
        4. If the specialty is "Emergency Medicine", select a real hospital with an ER.
        5. If the specialty is "Cardiology", select a real heart center or hospital.
        
        **RETURN JSON**:
        {
            "name": "Exact Real Hospital Name",
            "address": "Real Street Address",
            "city": "Real City",
            "state": "Real ST",
            "zip": "XXXXX-XXXX"
        }
    `;
    const result = await model.generateContent(prompt);
    return parseAndValidateJSON(result.response.text().replace(/[^\x00-\x7F]/g, ""));
}


// 5. THE PRICING SENTRY ("FMV Enforcer")
function performPricingAudit(financialData, errorType) {
    const isPriceGouging = errorType === "CMS_BENCHMARK";
    return {
        status: isPriceGouging ? "Excessive Pricing (Requested)" : "FMV Validated",
        is_fair_market_value: !isPriceGouging,
        audit_note: isPriceGouging
            ? "Price gouging active for CMS_BENCHMARK scenario."
            : "Standard FMV multipliers applied."
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
        const clinical = await generateClinicalArchitect({ specialty, errorType, complexity });
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
        const finalOutput = await generatePolishAgent(clinical.clinical_truth, coding.coding_truth, financial, { specialty, payerType, errorType, complexity, facility });
        console.log('[5/5] Polish: Bill Assembled.');

        // 5. Envelope
        const sExp = ABB_MAP[specialty] || specialty.substring(0, 3).toUpperCase();
        const pExp = ABB_MAP[payerType] || payerType.substring(0, 3).toUpperCase();
        const eExp = ABB_MAP[errorType] || errorType.substring(0, 3).toUpperCase();
        const cExp = ABB_MAP[complexity] || complexity.substring(0, 1).toUpperCase();

        const billName = `FMBI - ${sExp} -${pExp} -${eExp} -${cExp} `;

        const masterObject = {
            billName: billName.toUpperCase(),
            namingParts: { sExp, pExp, eExp, cExp },
            bill_data: finalOutput.bill_data,
            ground_truth: coding.coding_truth.error_metadata, // Compatible with frontend
            simulation_debug: {
                scenario_settings: { specialty, errorType, payerType },
                clinical_truth: clinical.clinical_truth,
                coding_truth: coding.coding_truth,
                financial_truth: financial,
                pricing_audit: pricingAudit,
                polish_truth: finalOutput.polish_truth
            }
        };

        // --- FINAL GLOBAL SANITIZATION (The Nuclear Option) ---
        const finalSanitize = (obj) => {
            if (typeof obj !== 'object' || obj === null) return obj;
            const newObj = Array.isArray(obj) ? [] : {};
            for (let key in obj) {
                let val = obj[key];
                if (typeof val === 'string') {
                    // Specific fields that must NEVER have spaces
                    const nuclearFields = ['patientDOB', 'admissionDate', 'dischargeDate', 'statementDate', 'dueDate', 'npi', 'taxId'];
                    if (nuclearFields.includes(key)) {
                        newObj[key] = val.replace(/\s+/g, '');
                    } else if (key === 'patientName') {
                        newObj[key] = val.replace(/\s+/g, ' ').trim();
                    } else {
                        newObj[key] = val;
                    }
                } else if (typeof val === 'object') {
                    newObj[key] = finalSanitize(val);
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

app.listen(PORT, () => {
    console.log(`[MockGen] Server running on http://localhost:${PORT}`);
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
