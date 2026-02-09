
export async function auditGlobalPeriod(billData, mrData, model) {
    const items = billData.lineItems || [];
    const findings = [];
    const today = new Date('2026-02-08');
    const admitDate = billData.admissionDate ? new Date(billData.admissionDate) : null;
    const dischargeDate = billData.dischargeDate ? new Date(billData.dischargeDate) : null;

    items.forEach((item, idx) => {
        const serviceDate = new Date(item.date);

        // 1. Future Dates
        if (serviceDate > today) {
            findings.push({ type: 'FUTURE_DATE', line: idx, date: item.date });
        }

        // 2. Admission/Discharge Gates
        if (admitDate && serviceDate < admitDate) {
            const diffDays = Math.ceil((admitDate - serviceDate) / (1000 * 60 * 60 * 24));
            const isPreOpLab = item.revCode === '0300' || item.revCode === '0320' || item.code === '93000' || item.code.startsWith('8');

            if (diffDays > 3 || !isPreOpLab) {
                findings.push({ type: 'PRE_ADMIT_CHARGE', line: idx, date: item.date, admitDate: billData.admissionDate, diffDays });
            }
        }

        if (dischargeDate && serviceDate > dischargeDate) {
            if (item.code !== '99238') {
                findings.push({ type: 'POST_DISCHARGE_CHARGE', line: idx, date: item.date, dischargeDate: billData.dischargeDate });
            }
        }
    });

    // 3. Billing Velocity Check
    const statementDate = billData.statementDate ? new Date(billData.statementDate) : null;
    if (statementDate && items.length >= 8) {
        const latestService = new Date(Math.max(...items.map(i => new Date(i.date))));
        const velocityDays = Math.ceil((statementDate - latestService) / (1000 * 60 * 60 * 24));
        if (velocityDays < 7) {
            findings.push({ type: 'IMPOSSIBLE_TURNAROUND', velocityDays, itemsCount: items.length });
        }
    }

    if (findings.length === 0) {
        return JSON.stringify({
            guardian: "Date",
            passed: true,
            status: "PASS",
            evidence: "All service dates are logically consistent with admission and discharge windows.",
            failure_details: null
        });
    }

    const prompt = `
        You are the "Date Guardian". Deterministic checks have identified temporal logic errors in the medical billing.
        
        **FINDINGS**: ${JSON.stringify(findings)}
        **CONTEXT**:
        - Admission: ${billData.admissionDate}
        - Discharge: ${billData.dischargeDate}
        - Statement Date: ${billData.statementDate}

        **INSTRUCTIONS**:
        1. Explain the temporal violation (Pre-admit, Post-discharge, Future Date, or Velocity).
        2. Cite the BKM rule (3-day pre-op window, discharge gate, or 7-day velocity rule).
        
        **RETURN JSON**:
        {
            "guardian": "Date",
            "passed": false,
            "status": "FAIL",
            "evidence": "Temporal logic mismatch detected.",
            "failure_details": {
                "type": "Date / Temporal Violation",
                "explanation": "State exactly why the dates are clinically or administratively impossible.",
                "severity": "Medium",
                "overcharge_potential": "$0.00"
            }
        }`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
