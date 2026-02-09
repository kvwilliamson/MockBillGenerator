
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { auditUpcoding } from '../guardians/upcoding.js';
import { auditQuantity } from '../guardians/quantity.js';
import { auditGlobalPeriod } from '../guardians/date.js';
import { auditMath } from '../guardians/math.js';
import { auditPrice } from '../guardians/price.js';
import { auditUnbundling } from '../guardians/unbundling.js';
import { auditDuplicates } from '../guardians/duplicate.js';
import { auditGFE } from '../guardians/gfe.js';
import { auditReview } from '../guardians/review.js';
import { auditMissingData } from '../guardians/extraction.js';

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
            bill: { lineItems: [{ code: '99285', description: 'ER Level 5', revCode: '0450' }] },
            mr: { vitals: { hr: 72, bp: '120/80' }, narrative: 'Patient has a mild cough, stable vites.' }
        },
        pass: {
            bill: { lineItems: [{ code: '99282', description: 'ER Level 2', revCode: '0450' }] },
            mr: { vitals: { hr: 72, bp: '120/80' }, narrative: 'Patient has a mild cough, stable vites.' }
        }
    },
    quantity: {
        fail: {
            bill: { lineItems: [{ code: '99285', quantity: 2, description: 'ER Level 5' }] },
            mr: { narrative: 'Initial ER visit.' }
        },
        pass: {
            bill: { lineItems: [{ code: '99285', quantity: 1, description: 'ER Level 5' }] },
            mr: { narrative: 'Initial ER visit.' }
        }
    },
    date: {
        fail: {
            bill: { admissionDate: '2026-02-05', lineItems: [{ code: '99214', date: '2026-02-01', total: 150 }] },
            mr: { history: 'No recent surgeries.' }
        },
        pass: {
            bill: { admissionDate: '2026-02-01', lineItems: [{ code: '99214', date: '2026-02-01', total: 150 }] },
            mr: { history: 'No recent surgeries.' }
        }
    },
    math: {
        fail: {
            bill: { lineItems: [{ qty: 1, unitPrice: 100, total: 200 }], grandTotal: 200, adjustments: 0 }
        },
        pass: {
            bill: { lineItems: [{ qty: 1, unitPrice: 100, total: 100 }], grandTotal: 100, adjustments: 0 }
        }
    },
    price: {
        fail: {
            bill: { payerType: 'Commercial', lineItems: [{ code: '71045', unitPrice: 5000, description: 'CXR' }] },
            actuary: { itemized_benchmarks: [{ code: '71045', estimated_fair_price: 250 }] }
        },
        pass: {
            bill: { payerType: 'Commercial', lineItems: [{ code: '71045', unitPrice: 500, description: 'CXR' }] },
            actuary: { itemized_benchmarks: [{ code: '71045', estimated_fair_price: 250 }] }
        }
    },
    unbundling: {
        fail: {
            bill: {
                lineItems: [
                    { code: '99285', revCode: '0450', description: 'ER VISIT' },
                    { code: '36415', description: 'BLOOD DRAW' }
                ]
            }
        },
        pass: {
            bill: { lineItems: [{ code: '99285', description: 'ER VISIT', revCode: '0450' }] }
        }
    },
    duplicate: {
        fail: {
            bill: {
                lineItems: [
                    { code: '85025', date: '2026-02-15', total: 100, description: 'CBC' },
                    { code: '85025', date: '2026-02-15', total: 100, description: 'CBC' }
                ]
            }
        },
        pass: {
            bill: {
                lineItems: [
                    { code: '85025', date: '2026-02-15', total: 100, description: 'CBC' },
                    { code: '81001', date: '2026-02-15', total: 100, description: 'UA' }
                ]
            }
        }
    },
    gfe: {
        fail: {
            bill: { grandTotal: 1200, lineItems: [] },
            gfe: { totalEstimatedCost: 500, lineItems: [] },
            payerType: 'Self-Pay'
        },
        pass: {
            bill: { grandTotal: 550, lineItems: [] },
            gfe: { totalEstimatedCost: 500, lineItems: [] },
            payerType: 'Self-Pay'
        }
    },
    review: {
        fail: {
            bill: { lineItems: [{ code: '85025', total: 100, description: 'CBC' }] },
            mr: { narrative: 'Patient seen for physical therapy. No lab work ordered.' }
        },
        pass: {
            bill: { lineItems: [{ code: '85025', total: 100, description: 'CBC' }] },
            mr: { narrative: 'STAT CBC ordered for suspected infection.' }
        }
    },
    extraction: {
        fail: {
            bill: { typeOfBill: '131', lineItems: [{ total: 100, code: '' }] }
        },
        pass: {
            bill: { typeOfBill: '131', admissionDate: '2026-02-01', dischargeDate: '2026-02-02', lineItems: [{ total: 100, code: '85025' }] }
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
    console.log("--- STARTING BKM GUARDIAN UNIT TESTS ---");

    await runTest('upcoding', auditUpcoding, { type: 'fail', params: [TEST_CASES.upcoding.fail.bill, TEST_CASES.upcoding.fail.mr] });
    await runTest('upcoding', auditUpcoding, { type: 'pass', params: [TEST_CASES.upcoding.pass.bill, TEST_CASES.upcoding.pass.mr] });

    await runTest('quantity', auditQuantity, { type: 'fail', params: [TEST_CASES.quantity.fail.bill, TEST_CASES.quantity.fail.mr] });
    await runTest('quantity', auditQuantity, { type: 'pass', params: [TEST_CASES.quantity.pass.bill, TEST_CASES.quantity.pass.mr] });

    await runTest('date', auditGlobalPeriod, { type: 'fail', params: [TEST_CASES.date.fail.bill, TEST_CASES.date.fail.mr] });
    await runTest('date', auditGlobalPeriod, { type: 'pass', params: [TEST_CASES.date.pass.bill, TEST_CASES.date.pass.mr] });

    await runTest('math', auditMath, { type: 'fail', params: [TEST_CASES.math.fail.bill] });
    await runTest('math', auditMath, { type: 'pass', params: [TEST_CASES.math.pass.bill] });

    await runTest('price', auditPrice, { type: 'fail', params: [TEST_CASES.price.fail.bill, TEST_CASES.price.fail.actuary] });
    await runTest('price', auditPrice, { type: 'pass', params: [TEST_CASES.price.pass.bill, TEST_CASES.price.pass.actuary] });

    await runTest('unbundling', auditUnbundling, { type: 'fail', params: [TEST_CASES.unbundling.fail.bill] });
    await runTest('unbundling', auditUnbundling, { type: 'pass', params: [TEST_CASES.unbundling.pass.bill] });

    await runTest('duplicate', auditDuplicates, { type: 'fail', params: [TEST_CASES.duplicate.fail.bill] });
    await runTest('duplicate', auditDuplicates, { type: 'pass', params: [TEST_CASES.duplicate.pass.bill] });

    await runTest('gfe', auditGFE, { type: 'fail', params: [TEST_CASES.gfe.fail.bill, TEST_CASES.gfe.fail.gfe, TEST_CASES.gfe.fail.payerType] });
    await runTest('gfe', auditGFE, { type: 'pass', params: [TEST_CASES.gfe.pass.bill, TEST_CASES.gfe.pass.gfe, TEST_CASES.gfe.pass.payerType] });

    await runTest('review', auditReview, { type: 'fail', params: [TEST_CASES.review.fail.bill, TEST_CASES.review.fail.mr] });
    await runTest('review', auditReview, { type: 'pass', params: [TEST_CASES.review.pass.bill, TEST_CASES.review.pass.mr] });

    await runTest('extraction', auditMissingData, { type: 'fail', params: [TEST_CASES.extraction.fail.bill] });
    await runTest('extraction', auditMissingData, { type: 'pass', params: [TEST_CASES.extraction.pass.bill] });

    console.log("\n--- BKM TESTS COMPLETE ---");
}

startTests();
