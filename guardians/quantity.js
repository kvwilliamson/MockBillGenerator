
export async function auditQuantity(billData, mrData, model) {
    const items = billData.lineItems || [];
    const findings = [];

    // 1. Deterministic Quantity Checks (BKM)
    items.forEach((item, idx) => {
        const qty = parseFloat(item.quantity || item.qty || 1);
        const code = item.code.split('-')[0];
        const unitPrice = parseFloat(item.unitPrice || 0);

        // A. Initial Service Limit (Qty > 1 for one-time events)
        const initialCodes = ['99281', '99282', '99283', '99284', '99285', '99221', '99222', '99223', '99201', '99202', '99203', '99204', '99205'];
        if (initialCodes.includes(code) && qty > 1) {
            findings.push({ type: 'INITIAL_SERVICE_LIMIT', line: idx, code, qty });
        }

        // B. Time Limits (Anesthesia/Critical Care > 1440 mins)
        const timeCodes = ['99291', '99292']; // simplified
        if ((item.description?.toLowerCase().includes('anesthesia') || timeCodes.includes(code)) && qty > 1440) {
            findings.push({ type: 'TIME_LIMIT_EXCEEDED', line: idx, code, qty, limit: 1440 });
        }

        // C. Implant Heuristic (Qty > 20 for hardware/screws)
        if (item.description?.toLowerCase().includes('screw') || item.description?.toLowerCase().includes('implant') || item.description?.toLowerCase().includes('hardware')) {
            if (qty > 20) {
                findings.push({ type: 'IMPLANT_OUTLIER', line: idx, code, qty });
            }
        }

        // D. Generic Outlier (Qty > 20 AND Price > $5.00)
        if (qty > 20 && unitPrice > 5.00) {
            findings.push({ type: 'GENERIC_QUANTITY_OUTLIER', line: idx, code, qty, unitPrice });
        }
    });

    const prompt = `
        You are the "Quantity & Record Match Guardian". Deterministic checks have identified volume outliers.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. MEDICAL RECORD (The Truth): ${JSON.stringify(mrData)}
        3. DETERMINISTIC FINDINGS: ${JSON.stringify(findings)}

        **INSTRUCTIONS**:
        1. **Deterministic Priority**: If DETERMINISTIC FINDINGS is NOT empty, you MUST return passed: false. These findings (like Qty > 1 for Initial encounters) are hard-stop BKM violations.
        2. **Laterality Check**: Extract the anatomical side (Left, Right, Bilateral) from the record and bill. Flag mismatches.
        3. **Quantity Verification**: For any deterministic findings, explain the clinical impossibility (e.g., billing for 2 initial ER visits on one day is impossible).
        
        **RETURN JSON**:
        {
            "guardian": "Quantity",
            "passed": boolean, 
            "status": "PASS | FAIL",
            "evidence": "Forensic Proof citing record vs billing qty/side.",
            "failure_details": {
                "type": "Quantity / Laterality Violation",
                "explanation": "Provide a detailed clinical explanation of the discrepancy.",
                "severity": "High",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
