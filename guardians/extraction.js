
export async function auditMissingData(billData, model) {
    const findings = [];
    const items = billData.lineItems || [];

    // 1. TOB 131 Requirements
    if (billData.typeOfBill === '131') {
        if (!billData.admissionDate) findings.push({ type: 'MISSING_REQUIRED_FIELD', field: 'admissionDate', context: 'TOB 131 requires Admission Date' });
        if (!billData.dischargeDate) findings.push({ type: 'MISSING_REQUIRED_FIELD', field: 'dischargeDate', context: 'TOB 131 requires Discharge Date' });
    }

    // 2. Ghost Charges (Positive total without HCPCS/CPT)
    items.forEach((item, idx) => {
        if (parseFloat(item.total) > 0 && (!item.code || item.code === '')) {
            findings.push({ type: 'GHOST_CHARGE', line: idx, total: item.total });
        }
    });

    if (findings.length === 0) {
        return JSON.stringify({
            guardian: "Extraction",
            passed: true,
            status: "PASS",
            evidence: "No critical data gaps detected in the extraction layer.",
            failure_details: null
        });
    }

    const prompt = `
        You are the "Missing Data Guardian". Deterministic checks have identified incomplete information that prevents safe bill auditing.
        
        **FINDINGS**: ${JSON.stringify(findings)}
        **BILL CONTEXT**: Type of Bill: ${billData.typeOfBill}

        **INSTRUCTIONS**:
        1. Explain why the missing data is critical (e.g. TOB 131 requirements or "Ghost Charges").
        2. Flag the bill as incomplete for forensic audit.
        
        **RETURN JSON**:
        {
            "guardian": "Extraction",
            "passed": false, 
            "status": "FAIL",
            "evidence": "Critical data gaps detected.",
            "failure_details": {
                "type": "Incomplete Data / Extraction Layer Failure",
                "explanation": "Provide a summary of the missing fields or ghost charges.",
                "severity": "Medium",
                "overcharge_potential": "$0.00"
            }
        }`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
