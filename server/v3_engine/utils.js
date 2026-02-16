
/**
 * Utilities for V3 Engine
 */

export function parseAndValidateJSON(text) {
    try {
        // Strip markdown code fences if present
        let cleanText = text.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanText);
    } catch (e) {
        console.error("Failed to parse AI response:", text);
        // Fallback: try to find the first '{' and last '}'
        try {
            const first = text.indexOf('{');
            const last = text.lastIndexOf('}');
            if (first !== -1 && last !== -1) {
                return JSON.parse(text.substring(first, last + 1));
            }
        } catch (e2) {
            // ignore
        }
        throw new Error("Invalid JSON from AI");
    }
}

// --- DETERMINISTIC HELPERS: NPI & TAX ID (BKM: Luhn Compliance) ---
export function generateLuhnPaddedNPI() {
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


export function generateRandomEIN() {
    // Format: XX-XXXXXXX
    const prefix = Math.floor(Math.random() * 90) + 10;
    const suffix = Array.from({ length: 7 }, () => Math.floor(Math.random() * 10)).join('');
    return `${prefix}-${suffix}`;
}

/**
 * Generates a realistic phone number based on state/region.
 */
export function generatePhoneNumber(state) {
    const areaCodes = {
        'TX': ['713', '281', '832', '214', '972', '469', '512'],
        'NY': ['212', '718', '917', '646', '332', '516', '914'],
        'CA': ['213', '310', '424', '415', '650', '408', '619'],
        'FL': ['305', '786', '407', '813', '954', '561'],
        'IL': ['312', '773', '847', '630', '708'],
        'PA': ['215', '267', '445', '412', '724', '878'],
        'AZ': ['602', '480', '623', '520'],
        'GA': ['404', '678', '470', '770'],
        'WA': ['206', '425', '253', '360'],
        'MA': ['617', '857', '508', '774', '978']
    };
    const codes = areaCodes[state] || ['800', '888', '877'];
    const area = codes[Math.floor(Math.random() * codes.length)];
    const exchange = Math.floor(Math.random() * 800) + 200;
    const line = Math.floor(Math.random() * 9000) + 1000;
    return `${area}-${exchange}-${line}`;
}

/**
 * Generates a consistent domain name based on facility name.
 */
export function generateDomain(name) {
    if (!name) return "healthcare.org";
    const clean = name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const suffixes = ['.org', '.com', '.health', '.edu'];
    return `www.${clean.substring(0, 15)}${suffixes[Math.floor(Math.random() * suffixes.length)]}`;
}
