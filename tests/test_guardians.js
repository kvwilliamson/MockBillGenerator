
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { auditUpcoding } from '../guardians/upcoding.js';
import { auditLaterality } from '../guardians/laterality.js';
import { auditGlobalPeriod } from '../guardians/date.js';
import { auditMath } from '../guardians/math.js';
import { auditPrice } from '../guardians/price.js';
import { auditUnbundling } from '../guardians/unbundling.js';
import { auditDuplicates } from '../guardians/duplicate.js';
import { auditGFE } from '../guardians/gfe.js';
import { auditBalanceBilling } from '../guardians/balance_billing.js';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = process.env.AI_MODEL_DEEP_ANALYSIS || 'gemini-1.5-flash';
const model = genAI.getGenerativeModel({ model: MODEL_NAME, generationConfig: { responseMimeType: "application/json" } });

function parseAndValidateJSON(text) {
    try {
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("Failed to parse AI response:", text);
        return { passed: false, error: "JSON PARSE FAIL" };
    }
}

const TEST_CASES = {
    upcoding: {
        fail: {
            bill: { lineItems: [{ code: '99285', description: 'ER Level 5' }] },
            mr: { vitals: { hr: 72, bp: '120/80' }, narrative: 'Patient has a mild cough, stable vites.' }
        },
        pass: {
            bill: { lineItems: [{ code: '99282', description: 'ER Level 2' }] },
            mr: { vitals: { hr: 72, bp: '120/80' }, narrative: 'Patient has a mild cough, stable vites.' }
        }
    },
    laterality: {
        fail: {
            bill: { lineItems: [{ code: '73030', description: 'X-ray shoulder, RIGHT' }] },
            mr: { narrative: 'Patient reports pain in the LEFT shoulder after a fall.' }
        },
        pass: {
            bill: { lineItems: [{ code: '73030', description: 'X-ray shoulder, RIGHT' }] },
            mr: { narrative: 'Patient reports pain in the RIGHT shoulder after a fall.' }
        }
    },
    date: {
        fail: {
            bill: { statementDate: '2026-02-01', lineItems: [{ code: '99214', total: 150 }] },
            mr: { history: 'Patient had major knee surgery on 2026-01-20 (within 90 days).' }
        },
        pass: {
            bill: { statementDate: '2026-02-01', lineItems: [{ code: '99214', total: 150 }] },
            mr: { history: 'No recent surgeries.' }
        }
    },
    math: {
        fail: {
            bill: { lineItems: [{ total: 100 }, { total: 200 }], grandTotal: 500, adjustments: 0 }
        },
        pass: {
            bill: { lineItems: [{ total: 100 }, { total: 200 }], grandTotal: 300, adjustments: 0 }
        }
    },
    price: {
        fail: {
            bill: { lineItems: [{ code: '71045', unitPrice: 2000, description: 'CXR' }] },
            actuary: [{ code: '71045', estimated_fair_price: 250 }]
        },
        pass: {
            bill: { lineItems: [{ code: '71045', unitPrice: 275, description: 'CXR' }] },
            actuary: [{ code: '71045', estimated_fair_price: 250 }]
        }
    },
    unbundling: {
        fail: {
            bill: {
                lineItems: [
                    { code: '82947', description: 'Glucose' },
                    { code: '84132', description: 'Potassium' },
                    { code: '84295', description: 'Sodium' }
                ]
            }
        },
        pass: {
            bill: { lineItems: [{ code: '80053', description: 'CMP Panel' }] }
        }
    },
    duplicate: {
        fail: {
            bill: {
                lineItems: [
                    { code: '85025', date: '2026-02-15', description: 'CBC' },
                    { code: '85025', date: '2026-02-15', description: 'CBC' }
                ]
            }
        },
        pass: {
            bill: {
                lineItems: [
                    { code: '85025', date: '2026-02-15', description: 'CBC' },
                    { code: '81001', date: '2026-02-15', description: 'UA' }
                ]
            }
        }
    },
    gfe: {
        fail: {
            bill: { grandTotal: 1200 },
            gfe: { totalEstimatedCost: 500 },
            payerType: 'Self-Pay'
        },
        pass: {
            bill: { grandTotal: 550 },
            gfe: { totalEstimatedCost: 500 },
            payerType: 'Self-Pay'
        }
    },
    balance_billing: {
        fail: {
            bill: { grandTotal: 1000, patientBalance: 800 },
            payerType: 'Commercial'
        },
        pass: {
            bill: { grandTotal: 1000, patientBalance: 20 },
            payerType: 'Commercial'
        }
    }
};

async function runTest(guardianName, auditFn, data) {
    console.log(`\n[Test] ${guardianName.toUpperCase()}: ${data.type.toUpperCase()}`);
    try {
        const rawResponse = await auditFn(...data.params, model);
        const result = parseAndValidateJSON(rawResponse);

        const success = (data.type === 'fail') ? !result.passed : result.passed;

        if (success) {
            console.log(`✅ SUCCESS: Guardian ${data.type === 'fail' ? 'detected error' : 'cleared valid data'}`);
            console.log(`   Evidence: ${result.evidence}`);
        } else {
            console.log(`❌ FAILED: Guardian ${data.type === 'fail' ? 'MISSED error' : 'FLAGGED false positive'}`);
            console.log(`   Response:`, JSON.stringify(result, null, 2));
        }
        return success;
    } catch (err) {
        console.error(`💥 CRASH in ${guardianName}:`, err.message);
        return false;
    }
}

async function startTests() {
    console.log("--- STARTING GUARDIAN UNIT TESTS ---");

    // 1. Upcoding
    await runTest('upcoding', auditUpcoding, { type: 'fail', params: [TEST_CASES.upcoding.fail.bill, TEST_CASES.upcoding.fail.mr] });
    await runTest('upcoding', auditUpcoding, { type: 'pass', params: [TEST_CASES.upcoding.pass.bill, TEST_CASES.upcoding.pass.mr] });

    // 2. Laterality
    await runTest('laterality', auditLaterality, { type: 'fail', params: [TEST_CASES.laterality.fail.bill, TEST_CASES.laterality.fail.mr] });
    await runTest('laterality', auditLaterality, { type: 'pass', params: [TEST_CASES.laterality.pass.bill, TEST_CASES.laterality.pass.mr] });

    // 3. Date
    await runTest('date', auditGlobalPeriod, { type: 'fail', params: [TEST_CASES.date.fail.bill, TEST_CASES.date.fail.mr] });
    await runTest('date', auditGlobalPeriod, { type: 'pass', params: [TEST_CASES.date.pass.bill, TEST_CASES.date.pass.mr] });

    // 4. Math
    await runTest('math', auditMath, { type: 'fail', params: [TEST_CASES.math.fail.bill] });
    await runTest('math', auditMath, { type: 'pass', params: [TEST_CASES.math.pass.bill] });

    // 5. Price
    await runTest('price', auditPrice, { type: 'fail', params: [TEST_CASES.price.fail.bill, TEST_CASES.price.fail.actuary] });
    await runTest('price', auditPrice, { type: 'pass', params: [TEST_CASES.price.pass.bill, TEST_CASES.price.pass.actuary] });

    // 6. Unbundling
    await runTest('unbundling', auditUnbundling, { type: 'fail', params: [TEST_CASES.unbundling.fail.bill] });
    await runTest('unbundling', auditUnbundling, { type: 'pass', params: [TEST_CASES.unbundling.pass.bill] });

    // 7. Duplicate
    await runTest('duplicate', auditDuplicates, { type: 'fail', params: [TEST_CASES.duplicate.fail.bill] });
    await runTest('duplicate', auditDuplicates, { type: 'pass', params: [TEST_CASES.duplicate.pass.bill] });

    // 8. GFE
    await runTest('gfe', auditGFE, { type: 'fail', params: [TEST_CASES.gfe.fail.bill, TEST_CASES.gfe.fail.gfe, TEST_CASES.gfe.fail.payerType] });
    await runTest('gfe', auditGFE, { type: 'pass', params: [TEST_CASES.gfe.pass.bill, TEST_CASES.gfe.pass.gfe, TEST_CASES.gfe.pass.payerType] });

    // 9. Balance Billing
    await runTest('balance_billing', auditBalanceBilling, { type: 'fail', params: [TEST_CASES.balance_billing.fail.bill, TEST_CASES.balance_billing.fail.payerType] });
    await runTest('balance_billing', auditBalanceBilling, { type: 'pass', params: [TEST_CASES.balance_billing.pass.bill, TEST_CASES.balance_billing.pass.payerType] });

    console.log("\n--- TESTS COMPLETE ---");
}

startTests();
