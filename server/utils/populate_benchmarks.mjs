
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, '..', 'data', 'medicare_benchmarks.json');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
    model: process.env.AI_MODEL_DEEP_ANALYSIS || 'gemini-1.5-flash',
    generationConfig: { responseMimeType: "application/json" }
});

async function populateBatch(batchSize = 20) {
    const currentDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const existingCodes = currentDb.map(c => c.code).join(', ');

    console.log(`[Populator] Current DB size: ${currentDb.length}. Fetching next ${batchSize} codes...`);

    const prompt = `
        You are a medical billing data expert. 
        I am building a database of the top 20,000 medical codes with their CMS National Average rates.
        
        **EXCLUSION LIST** (Do not return these):
        ${existingCodes}

        **TASK**: Return 20 NEW, high-volume CPT or HCPCS Level II codes with their description and 2025 Medicare National Average rate.
        Focus on: [Imaging, Surgery, Drugs(J-codes), or Specific Specialties].

        **RETURN ONLY JSON ARRAY**:
        [
          {"code": "String", "description": "String", "medicareRate": Number}
        ]
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const newCodes = JSON.parse(cleanText);

        const updatedDb = [...currentDb, ...newCodes];
        fs.writeFileSync(DB_PATH, JSON.stringify(updatedDb, null, 2));
        console.log(`[Populator] Success! Added ${newCodes.length} codes. New Total: ${updatedDb.length}`);
    } catch (e) {
        console.error("[Populator] Batch failed:", e.message);
    }
}

async function run(iterations = 5) {
    console.log(`--- Starting AI-Assisted Benchmark Population (${iterations} iterations) ---`);
    for (let i = 0; i < iterations; i++) {
        await populateBatch(25);
    }
    console.log("--- Population Batch Complete ---");
}

run(10); // Run 10 batches of 25 by default
