/**
 * pricing_core.js - Deterministic Pricing Engine
 * Centralized source of truth for multipliers and Medicare rate lookups.
 */

export const STATE_Z_FACTORS = {
    'AL': 0.91, 'AK': 1.27, 'AZ': 0.99, 'AR': 0.89, 'CA': 1.14,
    'CO': 1.03, 'CT': 1.08, 'DE': 1.02, 'FL': 0.98, 'GA': 0.96,
    'HI': 1.11, 'ID': 0.93, 'IL': 1.02, 'IN': 0.92, 'IA': 0.90,
    'KS': 0.91, 'KY': 0.91, 'LA': 0.93, 'ME': 0.96, 'MD': 1.08,
    'MA': 1.12, 'MI': 0.97, 'MN': 1.02, 'MS': 0.91, 'MO': 0.93,
    'MT': 0.92, 'NE': 0.91, 'NV': 1.01, 'NH': 1.02, 'NJ': 1.11,
    'NM': 0.94, 'NY': 1.12, 'NC': 0.96, 'ND': 0.93, 'OH': 0.94,
    'OK': 0.90, 'OR': 1.03, 'PA': 0.99, 'RI': 1.04, 'SC': 0.93,
    'SD': 0.90, 'TN': 0.92, 'TX': 0.98, 'UT': 0.96, 'VT': 0.95,
    'VA': 1.01, 'WA': 1.06, 'WV': 0.90, 'WI': 0.96, 'WY': 0.95,
    'DC': 1.15
};

export const PAYER_MULTIPLIERS = {
    'Medicare': 1.0,
    'Commercial': 5.0, // Increased to reflect Billed Charges
    'Self-Pay': 8.0,   // Increased to reflect Hospital Chargemaster (Gross)
    'Self-Pay-FMV': 2.0, // Discounted rate (approx 2x Medicare)
    'High-Deductible': 5.0,
    'Medicaid': 1.0,
    'Tricare': 1.0
};

export const isMajorMetro = (text) => {
    if (!text || typeof text !== 'string') return false;
    const metros = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Francisco', 'Miami'];
    const zipPrefixes = ['100', '101', '102', '606', '900', '901', '902', '770', '850', '191', '782', '921', '752', '941', '331'];

    const hasMetroName = metros.some(m => text.includes(m));
    const hasMetroZip = zipPrefixes.some(z => new RegExp(`\\b${z}\\d{2,5}\\b`).test(text));

    return hasMetroName || hasMetroZip;
};

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load local Medicare benchmarks
let MEDICARE_BENCHMARKS = [];
try {
    const benchmarksPath = path.join(__dirname, 'data', 'medicare_benchmarks.json');
    if (fs.existsSync(benchmarksPath)) {
        MEDICARE_BENCHMARKS = JSON.parse(fs.readFileSync(benchmarksPath, 'utf8'));
    }
} catch (e) {
    console.error("[Pricing Core] Failed to load local benchmarks:", e.message);
}

const MEDICARE_CACHE = new Map();

/**
 * Static "Ideal" Medicare rates or work-baselines for common codes.
 * Ported from server.js for fallback consistency.
 */
export function getBasePrice(cpt) {
    const code = String(cpt);

    // Check local benchmarks first (Deterministic Lookup)
    const benchmark = MEDICARE_BENCHMARKS.find(b => b.code === code);
    if (benchmark) return benchmark.medicareRate;

    // Hardcoded fallbacks for critical codes
    if (code.startsWith('99285')) return 380;
    if (code.startsWith('99284')) return 230;
    if (code.startsWith('99283')) return 150;
    if (code.startsWith('99282')) return 80;
    if (code.startsWith('99281')) return 40;
    if (code.startsWith('99215')) return 185;
    if (code.startsWith('99214')) return 130;
    if (code.startsWith('99213')) return 95;
    if (code.startsWith('99212')) return 65;
    if (code.startsWith('99205')) return 220;
    if (code.startsWith('99204')) return 170;
    if (code.startsWith('741')) return 280;
    if (code.startsWith('71046')) return 35;
    if (code.startsWith('71045')) return 32;
    if (code.startsWith('73610')) return 36;
    if (code.startsWith('73630')) return 40;
    if (code.startsWith('7')) return 45;
    if (code.startsWith('87081')) return 18.74;
    if (code.startsWith('87')) return 20;
    if (code.startsWith('85025')) return 12;
    if (code.startsWith('80053')) return 15;
    if (code.startsWith('8100')) return 8;
    if (code.startsWith('86592')) return 22;
    if (code.startsWith('8')) return 15;
    if (code.startsWith('131')) return 180;
    if (code.startsWith('12011')) return 43;
    if (code.startsWith('9637')) return 35;
    if (code.startsWith('99070')) return 45; // Default for Supplies
    if (code.startsWith('1')) return 50;
    return 100;
}

/**
 * Fetches Medicare rate using Hybrid Lookup (Cache -> Local DB -> AI Fallback).
 */
export async function fetchMedicareRate(model, code, desc) {
    const baseCode = String(code).split('-')[0];

    // 1. Check In-Memory Cache
    if (MEDICARE_CACHE.has(baseCode)) return MEDICARE_CACHE.get(baseCode);

    // 2. Check Local Deterministic DB
    const benchmark = MEDICARE_BENCHMARKS.find(b => b.code === baseCode);
    if (benchmark) {
        MEDICARE_CACHE.set(baseCode, benchmark.medicareRate);
        return benchmark.medicareRate;
    }

    // 3. AI Fallback (Reserving Gemini for niche cases)
    const prompt = `
        You are "The Medicare Rate Lookup Agent". Return the current CMS MPFS National Average rate for:
        CPT/HCPCS "${code}" - "${desc}"
        Return ONLY JSON: {"medicareRate": Number}
    `;

    try {
        console.log(`[Pricing Core] AI Fallback for ${code}...`);
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const data = JSON.parse(cleanText);
        const rate = Number(data.medicareRate);
        MEDICARE_CACHE.set(baseCode, rate);
        return rate;
    } catch (e) {
        console.warn(`[Medicare Lookup] Static Fallback for ${code}`);
        return getBasePrice(code);
    }
}

/**
 * Core pricing formula applied to all engines.
 */
export function calculateBilledPrice(medicareRate, payerType, state, cityZip, modifiers = []) {
    let y = PAYER_MULTIPLIERS.Commercial;
    if (PAYER_MULTIPLIERS[payerType]) {
        y = PAYER_MULTIPLIERS[payerType];
    } else if (payerType.includes("Medicare")) {
        y = PAYER_MULTIPLIERS.Medicare;
    } else if (payerType.includes("Self") || payerType.includes("Uninsured")) {
        y = PAYER_MULTIPLIERS["Self-Pay"];
    }

    let z = STATE_Z_FACTORS[state] || 1.0;
    if (isMajorMetro(cityZip)) {
        z += 0.10;
    }

    let modMultiplier = 1.0;
    if (modifiers.includes('26')) modMultiplier *= 0.40;
    if (modifiers.includes('TC')) modMultiplier *= 0.60;
    if (modifiers.includes('50')) modMultiplier *= 1.50;

    return parseFloat((medicareRate * y * z * modMultiplier).toFixed(2));
}
