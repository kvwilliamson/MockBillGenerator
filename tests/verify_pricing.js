
import { calculateBilledPrice, PAYER_MULTIPLIERS } from '../server/pricing_core.js';

console.log("=== Verifying Pricing Logic ===");

const medicareRate = 100.00;
const state = 'TX'; // Factor 0.98
const cityZip = '75001'; // Not metro
const modifiers = [];

// Expected Multipliers:
// Medicare: 1.0
// Commercial: 2.0
// Self-Pay: 2.5
// Self-Pay-FMV: 1.5

const cases = [
    { payer: 'Medicare', expectedMult: 1.0 },
    { payer: 'Commercial', expectedMult: 2.0 },
    { payer: 'Self-Pay', expectedMult: 2.5 },
    { payer: 'Self-Pay-FMV', expectedMult: 1.5 }
];

let failed = false;

cases.forEach(c => {
    const price = calculateBilledPrice(medicareRate, c.payer, state, cityZip, modifiers);
    const expected = parseFloat((medicareRate * c.expectedMult * 0.98).toFixed(2)); // 0.98 is TX factor

    if (Math.abs(price - expected) > 0.01) {
        console.error(`[FAIL] ${c.payer}: Expected $${expected}, got $${price}`);
        failed = true;
    } else {
        console.log(`[PASS] ${c.payer}: $${price} matches expected $${expected}`);
    }
});

if (failed) process.exit(1);
console.log("=== Verification Successful ===");
