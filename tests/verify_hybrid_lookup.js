
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { fetchMedicareRate } from '../server/pricing_core.js';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: process.env.AI_MODEL_DEEP_ANALYSIS || 'gemini-1.5-flash',
    generationConfig: { responseMimeType: "application/json" }
});

async function runVerification() {
    console.log("--- STARTING HYBRID LOOKUP VERIFICATION ---");

    // 1. Test Local DB Hit (CPT 99213)
    console.log("\n[Test 1] Testing Local DB Hit (CPT 99213)...");
    const rate1 = await fetchMedicareRate(model, '99213', 'Office visit');
    console.log(`Result: $${rate1} (Expected: $92.45 from benchmarks.json)`);

    // 2. Test Cache Hit (Repeat CPT 99213)
    console.log("\n[Test 2] Testing Cache Hit (Repeat CPT 99213)...");
    const start2 = Date.now();
    const rate2 = await fetchMedicareRate(model, '99213', 'Office visit');
    const duration2 = Date.now() - start2;
    console.log(`Result: $${rate2} (Duration: ${duration2}ms - should be near 0)`);

    // 3. Test Static Fallback (CPT 99281 - not in benchmarks.json but in getBasePrice)
    console.log("\n[Test 3] Testing Static Fallback (CPT 99281)...");
    const rate3 = await fetchMedicareRate(model, '99281', 'ER visit');
    console.log(`Result: $${rate3} (Expected: $40 from static fallbacks)`);

    // 4. Test AI Fallback (CPT 12345 - made up code)
    console.log("\n[Test 4] Testing AI Fallback (CPT 12345 - niche case)...");
    const rate4 = await fetchMedicareRate(model, '12345', 'Niche Medical Procedure');
    console.log(`Result: $${rate4} (Determined by Gemini AI)`);

    console.log("\n--- VERIFICATION COMPLETE ---");
}

runVerification().catch(err => {
    console.error("Verification failed:", err);
});
